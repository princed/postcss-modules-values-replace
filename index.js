const postcss = require('postcss');
const path = require('path');
const promisify = require('es6-promisify');
const { CachedInputFileSystem, NodeJsInputFileSystem, ResolverFactory } = require('enhanced-resolve');
const valuesParser = require('postcss-values-parser');
const { urlToRequest } = require('loader-utils');
const ICSSUtils = require('icss-utils');

const matchImports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/;
const matchValueDefinition = /(?:\s+|^)([\w-]+)(:?\s+)(.+?)(\s*)$/g;
const matchImport = /^([\w-]+)(?:\s+as\s+([\w-]+))?/;
const matchPath = /"[^"]*"|'[^']*'/;

const PLUGIN = 'postcss-modules-values-replace';
const INNER_PLUGIN = 'postcss-modules-values-replace-bind';

// Borrowed from enhanced-resolve
const nodeFs = new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000);
const concordContext = {};

const replaceValueSymbols = (valueString, replacements) => {
  const value = valuesParser(valueString, { loose: true }).parse();

  value.walk((node) => {
    if (node.type !== 'word') return;

    const replacement = replacements[node.value];

    if (replacement != null) {
      // eslint-disable-next-line no-param-reassign
      node.value = replacement;
    }
  });

  return value.toString();
};

const buildValueDefinitions = (atRule) => {
  const definition = {};
  matchValueDefinition.lastIndex = 0;
  const matches = matchValueDefinition.exec(atRule.params);
  if (matches) {
    const [/* match */, name, middle, value, end] = matches;
    definition[name] = {
      type: 'value',
      name,
      value,
      atRule, // Keep `atRule` to replace transitive value later.
      middle,
      end,
    };
  }
  return definition;
};

const buildImportDefinitions = (aliases, fromDir, filePath) => {
  const imports = {};

  aliases.replace(/^\(\s*([\s\S]+)\s*\)$/, '$1').split(/\s*,\s*/).forEach((alias) => {
    matchImport.lastIndex = 0;
    const tokens = matchImport.exec(alias);

    if (tokens) {
      const [/* match */, theirName, myName = theirName] = tokens;
      imports[myName] = {
        type: 'import',
        myName,
        theirName,
        fromDir,
        filePath,
      };
    } else {
      throw new Error(`@value statement "${alias}" is invalid!`);
    }
  });

  return imports;
};

const resolveDefinition = async (definitions, key, walkFile, allowTransitive) => {
  async function replaceValue(definition) {
    const valueString = definition.value;
    const value = valuesParser(valueString, { loose: true }).parse();
    const lazyResults = [];
    value.walk((node) => {
      if (node.type !== 'word') return;
      if (definitions[node.value]) {
        const promise = resolveDefinition(definitions, node.value, walkFile)
          .then((newValue) => {
            // eslint-disable-next-line no-param-reassign
            node.value = newValue;
          });
        lazyResults.push(promise);
      }
    });

    await Promise.all(lazyResults);
    const newValue = value.toString();
    if (allowTransitive) {
      // eslint-disable-next-line no-param-reassign
      definition.atRule.params = definition.name + definition.middle + newValue + definition.end;
    }
    return newValue;
  }

  const definition = definitions[key];
  if (definition != null) {
    let required;
    switch (definition.type) {
      case 'value':
        return replaceValue(definition);
      case 'import':
        required = { [definition.theirName]: definition };
        return walkFile(definition.filePath, definition.fromDir, required)
          .then(value => value[definition.theirName]);
      default:
        throw new Error(`Definition type "${definition.type}" is invalid`);
    }
  }
  return null;
};

const evaluateDefinitions = async (definitions, requiredDefinitions, walkFile, noRequired) => {
  let keys;
  if (!requiredDefinitions) {
    // All keys in definitions must be resolved
    keys = Object.keys(definitions);
  } else {
    // Otherwise, only keys in requiredDefinitions will be re-evaluated
    keys = Object.keys(requiredDefinitions);
  }
  const promises = [];
  // eslint-disable-next-line no-plusplus
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i];
    if (definitions[key] && typeof definitions[key] === 'object' && definitions[key].type) {
      const promise = resolveDefinition(definitions, key, walkFile, noRequired).then((value) => {
        // eslint-disable-next-line no-param-reassign
        definitions[key] = value;
      });
      promises.push(promise);
    }
  }
  if (promises.length) {
    await Promise.all(promises);
  }
};

const walk = async (requiredDefinitions, walkFile, root, result) => {
  const rules = [];
  const fromDir = result.opts.from && path.dirname(result.opts.from);
  const noRequired = !requiredDefinitions;

  root.walkAtRules('value', (atRule) => {
    rules.push(atRule);
  });

  const collectDefinitions = (existingDefinitions, atRule) => {
    matchImports.lastIndex = 0;
    const matches = matchImports.exec(atRule.params);

    if (matches) {
      // eslint-disable-next-line prefer-const
      let [/* match */, aliases, pathString] = matches;

      // We can use constants for path names
      if (existingDefinitions[pathString]) {
        // eslint-disable-next-line prefer-destructuring
        pathString = existingDefinitions[pathString].value;
      }

      // Do nothing if path is not found
      if (!pathString.match(matchPath)) {
        return {};
      }

      const exportsPath = pathString.replace(/['"]/g, '');
      const imports = buildImportDefinitions(aliases, fromDir, exportsPath);

      return Object.assign(existingDefinitions, imports);
    }

    if (atRule.params.indexOf('@value') !== -1) {
      result.warn(`Invalid value definition: ${atRule.params}`);
    }

    const newDefinitions = buildValueDefinitions(atRule);
    return Object.assign(existingDefinitions, newDefinitions);
  };

  const definitions = rules.reduce(collectDefinitions, {});
  await evaluateDefinitions(definitions, requiredDefinitions, walkFile, noRequired);

  if (!noRequired) {
    result.messages.push({
      type: INNER_PLUGIN,
      value: definitions,
    });

    return undefined;
  }

  return definitions;
};

const walkerPlugin = postcss.plugin(INNER_PLUGIN, (fn, ...args) => fn.bind(null, ...args));

const factory = ({
  fs = nodeFs,
  noEmitExports = false,
  resolve: resolveOptions = {},
  preprocessValues = false,
  importsAsModuleRequests = false,
  replaceInSelectors = false,
} = {}) => async (root, rootResult) => {
  const resolver = ResolverFactory.createResolver(Object.assign(
    { fileSystem: fs },
    resolveOptions,
  ));
  const resolve = promisify(resolver.resolve, resolver);
  const readFile = promisify(fs.readFile, fs);

  let preprocessPlugins = [];
  if (preprocessValues) {
    const rootPlugins = rootResult.processor.plugins;
    const oursPluginIndex = rootPlugins
      .findIndex(plugin => plugin.postcssPlugin === PLUGIN);
    preprocessPlugins = rootPlugins.slice(0, oursPluginIndex);
  }

  const definitionCache = new Map();
  async function walkFile(from, dir, requiredDefinitions) {
    const request = importsAsModuleRequests ? urlToRequest(from) : from;
    const resolvedFrom = await resolve(concordContext, dir, request);

    const cached = definitionCache.get(resolvedFrom);
    if (cached) {
      await evaluateDefinitions(cached, requiredDefinitions, walkFile);
      return cached;
    }

    const content = await readFile(resolvedFrom);
    const plugins = [
      ...preprocessPlugins,
      walkerPlugin(walk, requiredDefinitions, walkFile),
    ];
    const result = await postcss(plugins)
      .process(content, { from: resolvedFrom });

    definitionCache.set(resolvedFrom, result.messages[0].value);

    return result.messages[0].value;
  }

  const definitions = await walk(null, walkFile, root, rootResult);
  rootResult.messages.push({
    plugin: PLUGIN,
    type: 'values',
    values: definitions,
  });

  root.walk((node) => {
    if (node.type === 'decl') {
      // eslint-disable-next-line no-param-reassign
      node.value = replaceValueSymbols(node.value, definitions);
    } else if (node.type === 'atrule' && node.name === 'media') {
      // eslint-disable-next-line no-param-reassign
      node.params = replaceValueSymbols(node.params, definitions);
    } else if (replaceInSelectors && node.type === 'rule') {
      // eslint-disable-next-line no-param-reassign
      node.selector = ICSSUtils.replaceValueSymbols(node.selector, definitions);
    } else if (noEmitExports && node.type === 'atrule' && node.name === 'value') {
      node.remove();
    }
  });
};


const plugin = postcss.plugin(PLUGIN, factory);
module.exports = plugin;
exports.default = plugin;

