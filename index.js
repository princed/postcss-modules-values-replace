const postcss = require('postcss');
const path = require('path');
const promisify = require('es6-promisify');
const { CachedInputFileSystem, NodeJsInputFileSystem, ResolverFactory } = require('enhanced-resolve');
const valuesParser = require('postcss-values-parser');

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

const getDefinition = (atRule, existingDefinitions, requiredDefinitions) => {
  let matches;
  const definition = {};

  // eslint-disable-next-line no-cond-assign
  while (matches = matchValueDefinition.exec(atRule.params)) {
    const [/* match */, requiredName, middle, value, end] = matches;
    // Add to the definitions, knowing that values can refer to each other
    definition[requiredName] = replaceValueSymbols(value, existingDefinitions);

    if (!requiredDefinitions) {
      // eslint-disable-next-line no-param-reassign
      atRule.params = requiredName + middle + definition[requiredName] + end;
    }
  }

  return definition;
};

const getImports = (aliases) => {
  const imports = {};

  aliases.replace(/^\(\s*([\s\S]+)\s*\)$/, '$1').split(/\s*,\s*/).forEach((alias) => {
    const tokens = matchImport.exec(alias);

    if (tokens) {
      const [/* match */, theirName, myName = theirName] = tokens;
      imports[theirName] = myName;
    } else {
      throw new Error(`@value statement "${alias}" is invalid!`);
    }
  });

  return imports;
};

const walk = (requiredDefinitions, walkFile, root, result) => {
  const rules = [];
  const fromDir = result.opts.from && path.dirname(result.opts.from);

  root.walkAtRules('value', (atRule) => {
    rules.push(atRule);
  });

  function reduceRules(definitionsPromise, atRule) {
    return definitionsPromise.then((existingDefinitions) => {
      const matches = matchImports.exec(atRule.params);
      let exportsPath;
      let imports;

      if (matches) {
        const aliases = matches[1];
        let pathString = matches[2];

        // We can use constants for path names
        if (existingDefinitions[pathString]) {
          // eslint-disable-next-line prefer-destructuring
          pathString = existingDefinitions[pathString];
        }

        // Do nothing if path is not found
        if (!pathString.match(matchPath)) {
          return {};
        }

        exportsPath = pathString.replace(/['"]/g, '');
        imports = getImports(aliases);

        return walkFile(exportsPath, fromDir, imports)
          .then(definitions => Object.assign(existingDefinitions, definitions));
      }

      if (atRule.params.indexOf('@value') !== -1) {
        result.warn(`Invalid value definition: ${atRule.params}`);
      }

      const newDefinitions = getDefinition(atRule, existingDefinitions, requiredDefinitions);
      return Promise.resolve(Object.assign(existingDefinitions, newDefinitions));
    });
  }

  const definitionsResultPromise = rules.reduce(reduceRules, Promise.resolve({}));

  return definitionsResultPromise.then((definitions) => {
    let validDefinitions;

    if (requiredDefinitions) {
      validDefinitions = {};
      Object.keys(requiredDefinitions).forEach((key) => {
        validDefinitions[requiredDefinitions[key]] = definitions[key];
      });

      result.messages.push({
        type: INNER_PLUGIN,
        value: validDefinitions,
      });

      return undefined;
    }

    return definitions;
  });
};

const walkerPlugin = postcss.plugin(INNER_PLUGIN, (fn, ...args) => fn.bind(null, ...args));

const factory = ({ fs = nodeFs, resolve: options = {} } = {}) => (root, rootResult) => {
  const resolver = ResolverFactory.createResolver(Object.assign({ fileSystem: fs }, options));
  const resolve = promisify(resolver.resolve, resolver);
  const readFile = promisify(fs.readFile, fs);

  function walkFile(from, dir, requiredDefinitions) {
    return resolve(concordContext, dir, from)
      .then(resolvedFrom => readFile(resolvedFrom)
        .then(content => ({
          content,
          resolvedFrom,
        })))
      .then(({ content, resolvedFrom }) =>
        postcss([walkerPlugin(walk, requiredDefinitions, walkFile)])
          .process(content, { from: resolvedFrom }))
      .then(result => result.messages[0].value);
  }

  return walk(null, walkFile, root, rootResult)
    .then((definitions) => {
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
        }
      });
    });
};


const plugin = postcss.plugin(PLUGIN, factory);
module.exports = plugin;
exports.default = plugin;

