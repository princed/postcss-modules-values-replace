import postcss from 'postcss';
import path from 'path';
import promisify from 'es6-promisify';
import { CachedInputFileSystem, NodeJsInputFileSystem, ResolverFactory } from 'enhanced-resolve';
import replaceSymbols, { replaceAll } from 'icss-replace-symbols';

const matchImports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/;
const matchValueDefinition = /(?:\s+|^)([\w-]+)(:?\s+)(.+?)(\s*)$/g;
const matchImport = /^([\w-]+)(?:\s+as\s+([\w-]+))?/;
const matchPath = /"[^"]*"|'[^']*'/;

const PLUGIN = 'postcss-modules-values-replace';
const INNER_PLUGIN = 'postcss-modules-values-replace-bind';

// Borrowed from enhanced-resolve
const nodeFs = new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000);
const concordContext = {};

const getDefinition = (atRule, existingDefinitions, requiredDefinitions) => {
  let matches;
  const definition = {};

  // eslint-disable-next-line no-cond-assign
  while (matches = matchValueDefinition.exec(atRule.params)) {
    const [/* match */, requiredName, middle, value, end] = matches;
    // Add to the definitions, knowing that values can refer to each other
    definition[requiredName] = replaceAll(existingDefinitions, value);

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
        pathString = existingDefinitions[pathString];
      }

      // Do nothing if path is not found
      if (!pathString.match(matchPath)) {
        return {};
      }

      const exportsPath = pathString.replace(/['"]/g, '');
      const imports = getImports(aliases);

      const definitions = await walkFile(exportsPath, fromDir, imports);
      return Object.assign(existingDefinitions, definitions);
    }

    if (atRule.params.indexOf('@value') !== -1) {
      result.warn(`Invalid value definition: ${atRule.params}`);
    }

    const newDefinitions = getDefinition(atRule, existingDefinitions, requiredDefinitions);
    return Object.assign(existingDefinitions, newDefinitions);
  };

  const definitions = await rules.reduce(reduceRules, Promise.resolve({}));

  if (requiredDefinitions) {
    const validDefinitions = {};
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
};

const walkerPlugin = postcss.plugin(INNER_PLUGIN, (fn, ...args) => fn.bind(null, ...args));

const factory = ({ fs = nodeFs, resolve: options = {} } = {}) => async (root, rootResult) => {
  const resolver = ResolverFactory.createResolver(Object.assign({ fileSystem: fs }, options));
  const resolve = promisify(resolver.resolve, resolver);
  const readFile = promisify(fs.readFile, fs);

  async function walkFile(from, dir, requiredDefinitions) {
    const resolvedFrom = await resolve(concordContext, dir, from);
    const content = await readFile(resolvedFrom);
    const result = await postcss([walkerPlugin(walk, requiredDefinitions, walkFile)])
      .process(content, { from: resolvedFrom });

    return result.messages[0].value;
  }

  const definitions = await walk(null, walkFile, root, rootResult);
  rootResult.messages.push({
    plugin: PLUGIN,
    type: 'values',
    values: definitions,
  });
  replaceSymbols(root, definitions);
};


const plugin = postcss.plugin(PLUGIN, factory);
module.exports = plugin; // support old good require
export default plugin;

