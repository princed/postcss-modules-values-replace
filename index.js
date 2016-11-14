const postcss = require('postcss');
const path = require('path');
const nodeFs = require('fs');

const { replaceAll, default: replaceSymbols } = require('icss-replace-symbols');

const matchImports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/;
const matchValueDefinition = /(?:\s+|^)([\w-]+)(:?\s+)(.+?)(\s*)$/g;
const matchImport = /^([\w-]+)(?:\s+as\s+([\w-]+))?/;

const INNER_PLUGIN = 'postcss-modules-values-replace-bind';
const walkerPlugin = postcss.plugin(INNER_PLUGIN, (fn, context) => fn.bind(null, context));

module.exports = postcss.plugin('postcss-modules-values-replace', ({ fs = nodeFs } = {}) => (root, rootResult) => {
  const walkFile = (from, context) => new Promise((resolve, reject) => {
    fs.readFile(from, (err, content) => {
      if (err) {
        reject(err);
        return;
      }

      // eslint-disable-next-line no-use-before-define
      postcss([walkerPlugin(walk, context)]).process(content, { from }).then((result) => {
        resolve(result.messages[0].value);
      });
    });
  });

  const getDefinition = (atRule, existingDefinitions, requiredDefinitions) => {
    let matches;
    const definition = {};

    // eslint-disable-next-line no-cond-assign
    while (matches = matchValueDefinition.exec(atRule.params)) {
      const [/* match*/, key, middle, value, end] = matches;
      const requiredName = key;
      // Add to the definitions, knowing that values can refer to each other
      definition[requiredName] = replaceAll(existingDefinitions, value);
      if (!requiredDefinitions) {
        // eslint-disable-next-line no-param-reassign
        atRule.params = key + middle + definition[requiredName] + end;
      }
    }

    return definition;
  };

  const getImport = ({ matches, importsPath, existingDefinitions, requiredDefinitions }) => {
    const imports = {};
    // eslint-disable-next-line prefer-const
    let [/* match*/, aliases, pathString] = matches;

    // We can use constants for path names
    if (existingDefinitions[pathString]) {
      pathString = existingDefinitions[pathString];
    }

    // Do nothing if path is not found
    if (!pathString.match(/"[^"]*"|'[^']*'/)) {
      return null;
    }

    aliases.replace(/^\(\s*([\s\S]+)\s*\)$/, '$1').split(/\s*,\s*/).forEach((alias) => {
      const tokens = matchImport.exec(alias);
      if (tokens) {
        const [/* match*/, theirName, myName = theirName] = tokens;
        const exportsPath = path.resolve(path.dirname(importsPath), pathString.replace(/['"]/g, ''));

        if (!requiredDefinitions || requiredDefinitions[myName]) {
          const importsName = imports[exportsPath] || (imports[exportsPath] = {});
          importsName[theirName] = myName;
        }
      } else {
        throw new Error(`@import statement "${alias}" is invalid!`);
      }
    });

    return imports;
  };

  const walk = (requiredDefinitions, fromRoot, result) => {
    const importsPath = result.opts.from;
    const rules = [];

    fromRoot.walkAtRules('value', (atRule) => {
      rules.push(atRule);
    });

    const reduceRules = (promise, atRule) => promise.then((existingDefinitions) => {
      const matches = matchImports.exec(atRule.params);
      if (matches) {
        const imports = getImport({
          matches,
          importsPath,
          existingDefinitions,
          requiredDefinitions,
        });


        const files = imports && Object.keys(imports);

        if (!files || !files[0]) {
          return {};
        }

        return walkFile(files[0], imports[files[0]])
          .then(definitions => Object.assign(existingDefinitions, definitions));
      }

      if (atRule.params.indexOf('@value') !== -1) {
        result.warn(`Invalid value definition: ${atRule.params}`);
      }
      const newDefinitions = getDefinition(atRule, existingDefinitions, requiredDefinitions);
      return Object.assign(existingDefinitions, newDefinitions);
    });

    return rules.reduce(reduceRules, Promise.resolve({})).then((definitions) => {
      if (requiredDefinitions) {
        const validDefiniftions = {};
        Object.keys(requiredDefinitions).forEach((key) => {
          validDefiniftions[requiredDefinitions[key]] = definitions[key];
        });

        result.messages.push({
          type: INNER_PLUGIN,
          value: validDefiniftions,
        });

        return undefined;
      }

      return definitions;
    });
  };


  return walk(null, root, rootResult).then((definitions) => {
    replaceSymbols(root, definitions);
  });
});
