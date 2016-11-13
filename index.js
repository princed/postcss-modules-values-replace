const postcss = require('postcss');
const path = require('path');
const nodeFs = require('fs');

const { replaceAll, default: replaceSymbols } = require('icss-replace-symbols');

const matchImports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/;
const matchValueDefinition = /(?:\s+|^)([\w-]+):?\s+(.+?)\s*$/g;
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

    // const content = fs.readFileSync(from);
    // // eslint-disable-next-line no-use-before-define
    // postcss([walkerPlugin(walk, context)]).process(content, { from }).then((result) => {
    //   resolve(result.messages[0].value);
    // });
  });

  const getDefinition = (atRule, requiredDefinitions) => {
    let matches;
    const definition = {};

    // eslint-disable-next-line no-cond-assign
    while (matches = matchValueDefinition.exec(atRule.params)) {
      const [/* match*/, key, value] = matches;
      // const requiredName = requiredDefinitions && requiredDefinitions[key] ? requiredDefinitions[key] : key;
      const requiredName = key;
      // Add to the definitions, knowing that values can refer to each other
      definition[requiredName] = replaceAll(definition, value);
    }

    return Promise.resolve(definition);
  };

  const getImport = ({ matches, importsPath, existingImports, requiredDefinitions }) => {
    const imports = {};
    // eslint-disable-next-line prefer-const
    let [/* match*/, aliases, pathString] = matches;

    // We can use constants for path names
    if (existingImports[pathString]) {
      pathString = existingImports[pathString];
    }

    // Do nothing if path is not found
    if (!pathString.match(/"[^"]*"|'[^']*'/)) {
      return {};
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

    const importedDefinitions = Object.keys(imports).map(file => walkFile(file, imports[file]));
    return { imports, importedDefinitions };
  };

  const walk = (requiredDefinitions, fromRoot, result) => {
    const importsPath = result.opts.from;
    const definitions = [];
    const existingImports = {};

    fromRoot.walkAtRules('value', (atRule) => {
      const matches = matchImports.exec(atRule.params);

      if (matches) {
        const { importedDefinitions, imports } = getImport({
          matches,
          importsPath,
          existingImports,
          requiredDefinitions,
        });
        // console.log(importedDefinitions, imports);
        if (imports) {
          Object.assign(existingImports, imports);
          definitions.push(...importedDefinitions);
        }
      } else {
        if (atRule.params.indexOf('@value') !== -1) {
          result.warn(`Invalid value definition: ${atRule.params}`);
        }

        definitions.push(getDefinition(atRule, requiredDefinitions));
      }
    });

    return Promise.all(definitions).then((allDefinitions) => {
      // console.log(allDefinitions);
      const validDefinitions = allDefinitions.filter(definition => definition);

      if (!validDefinitions.length) {
        return {};
      }


      if (requiredDefinitions) {
        const filteredDefinitions = validDefinitions
        .filter(definition => requiredDefinitions[Object.keys(definition)[0]])
        .map(definition => ({ [requiredDefinitions[Object.keys(definition)[0]]]: definition[Object.keys(definition)[0]] }));
        // console.log(filteredDefinitions, requiredDefinitions, validDefinitions);
        result.messages.push({
          type: INNER_PLUGIN,
          value: Object.assign({}, ...filteredDefinitions),
        });

        return {};
      }
      // console.log(requiredDefinitions, definition)

      return Object.assign(...validDefinitions);
    });
  };


  return walk(null, root, rootResult).then((definitions) => {
    // console.log(definitions);
    replaceSymbols(root, definitions);
  });
});
