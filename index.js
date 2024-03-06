const postcss = require('postcss');
const fs = require('fs');
const path = require('path');
const { promisify } = require('es6-promisify');
const { CachedInputFileSystem, ResolverFactory } = require('enhanced-resolve');
const { parse } = require('postcss-values-parser');
const { urlToRequest } = require('loader-utils');
const ICSSUtils = require('icss-utils');

const matchImports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/;
const matchValueDefinition = /(?:\s+|^)([\w-]+)(:?\s+)(.+?)(\s*)$/g;
const matchImport = /^([\w-]+)(?:\s+as\s+([\w-]+))?/;
const matchPath = /"[^"]*"|'[^']*'/;

const PLUGIN = 'postcss-modules-values-replace';
const INNER_PLUGIN = 'postcss-modules-values-replace-bind';

// Borrowed from enhanced-resolve
const nodeFs = new CachedInputFileSystem(fs, 4000);
const concordContext = {};
const resolveContext = {};

const replaceValueSymbols = (valueString, replacements) => {
  const value = parse(valueString, { ignoreUnknownWords: true });

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

const walk = async (requiredDefinitions, walkFile, root, result) => {
  const rules = [];
  const fromDir = result.opts.from && path.dirname(result.opts.from);

  root.walkAtRules('value', (atRule) => {
    rules.push(atRule);
  });

  const reduceRules = async (definitionsPromise, atRule) => {
    const existingDefinitions = await definitionsPromise;
    const matches = matchImports.exec(atRule.params);

    if (matches) {
      // eslint-disable-next-line prefer-const
      let [/* match */, aliases, pathString] = matches;

      // We can use constants for path names
      if (existingDefinitions[pathString]) {
        // eslint-disable-next-line prefer-destructuring
        pathString = existingDefinitions[pathString];
      }

      // Do nothing if path is not found
      if (!pathString.match(matchPath)) {
        return {};
      }

      const exportsPath = pathString.replace(/['"]/g, '');
      const imports = getImports(aliases);
      const definitions = await walkFile(exportsPath, fromDir, imports);

      // Map the exported symbols to their aliased names in the importing module.
      Object.keys(imports).forEach((key) => {
        existingDefinitions[imports[key]] = definitions[key];
      });

      return existingDefinitions;
    }

    if (atRule.params.indexOf('@value') !== -1) {
      result.warn(`Invalid value definition: ${atRule.params}`);
    }

    const newDefinitions = getDefinition(atRule, existingDefinitions, requiredDefinitions);
    return Object.assign(existingDefinitions, newDefinitions);
  };

  const definitions = await rules.reduce(reduceRules, Promise.resolve({}));

  if (requiredDefinitions) {
    result.messages.push({
      type: INNER_PLUGIN,
      value: definitions,
    });

    return undefined;
  }

  return definitions;
};

const walkerPlugin = (fn, ...args) => ({
  postcssPlugin: INNER_PLUGIN,
  Once(root, { result }) {
    return fn.call(null, ...args, root, result);
  },
});
walkerPlugin.postcss = true;

const factory = ({
  fs: fileSystem = nodeFs,
  noEmitExports = false,
  resolve: resolveOptions = {},
  preprocessValues = false,
  importsAsModuleRequests = false,
  replaceInSelectors = false,
  atRules = ['media']
} = {}) => ({
  postcssPlugin: PLUGIN,
  prepare(rootResult) {
    let definitions;

    return {
      async Once(root) {
        const resolver = ResolverFactory.createResolver({
          fileSystem,
          ...resolveOptions,
        });
        const resolve = promisify(resolver.resolve.bind(resolver));
        const readFile = promisify(fileSystem.readFile.bind(fileSystem));

        let preprocessPlugins = [];
        if (preprocessValues) {
          const rootPlugins = rootResult.processor.plugins;
          const oursPluginIndex = rootPlugins
            .findIndex((plugin) => plugin.postcssPlugin === PLUGIN);
          preprocessPlugins = rootPlugins.slice(0, oursPluginIndex);
        }

        const definitionCache = new Map();
        async function walkFile(from, dir, requiredDefinitions) {
          const request = importsAsModuleRequests ? urlToRequest(from) : from;
          const resolvedFrom = await resolve(concordContext, dir, request, resolveContext);

          const cached = definitionCache.get(resolvedFrom);
          if (cached) {
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

        definitions = await walk(null, walkFile, root, rootResult);
        rootResult.messages.push({
          plugin: PLUGIN,
          type: 'values',
          values: definitions,
        });
      },
      Declaration(node) {
        // eslint-disable-next-line no-param-reassign
        node.value = replaceValueSymbols(node.value, definitions);
      },
      AtRule: {
        ...atRules.reduce((acc, atRule) => ({
          ...acc,
          [atRule]: (node) => {
            // eslint-disable-next-line no-param-reassign
            node.params = replaceValueSymbols(node.params, definitions);
          },
        }), {}),
        value(node) {
          if (noEmitExports) {
            node.remove();
          }
        },
      },
      Rule(node) {
        if (replaceInSelectors) {
          // eslint-disable-next-line no-param-reassign
          node.selector = ICSSUtils.replaceValueSymbols(node.selector, definitions);
        }
      },
    };
  },
});

const plugin = factory;
plugin.postcss = true;

module.exports = plugin;
exports.default = plugin;
