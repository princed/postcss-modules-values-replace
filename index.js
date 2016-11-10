const postcss = require('postcss');
const path = require('path');
const nodeFs = require('fs');

const { replaceAll, default: replaceSymbols } = require('icss-replace-symbols');

const matchImports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/;
const matchValueDefinition = /(?:\s+|^)([\w-]+):?\s+(.+?)\s*$/g;
const matchImport = /^([\w-]+)(?:\s+as\s+([\w-]+))?/;

const walkerPlugin = postcss.plugin('postcss-modules-values-replace-identity', fn => fn);

module.exports = postcss.plugin('postcss-modules-values-replace', ({ fs = nodeFs } = {}) => (
  function (root, result) {
    const walkFile = (file, requiredDefinitions) => new Promise((resolve, reject) => {
      fs.readFile(file, (err, content) => {
        if (err) {
          return reject(err);
        }

        const { walk, definitions } = getWalker(requiredDefinitions);

        return postcss([walkerPlugin(walk)]).process(content, { from: file }).then(() => {
          resolve(definitions);
        });
      });
    });

    const getWalker = (requiredDefinitions) => {
      const definitions = {};
      const imports = {};
      function walk(fromRoot, result) {
        fromRoot.walkAtRules('value', (atRule) => {
          const matches = matchImports.exec(atRule.params);
          if (matches) {
            addImport(matches, result.opts.from);
          } else {
            if (atRule.params.indexOf('@value') !== -1) {
              result.warn(`Invalid value definition: ${atRule.params}`);
            }

            addDefinition(atRule);
          }
        });

        const files = Object.keys(imports);
        if (!files.length) {
          return Promise.resolve(definitions);
        }

        return Promise.all(files.map(file => walkFile(file, imports[file]))).then((filesDefinitions) => {
          Object.assign(definitions, ...filesDefinitions);
          return definitions;
        });
      }

      const addDefinition = (atRule) => {
        let matches;

        while ((matches = matchValueDefinition.exec(atRule.params))) {
          const [/* match*/, key, value] = matches;
          const requiredName = requiredDefinitions ? requiredDefinitions[key] : key;
          // Add to the definitions, knowing that values can refer to each other
          definitions[requiredName] = replaceAll(definitions, value);
        }
      };

      function addImport(matches, importsPath) {
        let [/* match*/, aliases, pathString] = matches;

        // We can use constants for path names
        if (definitions[pathString]) {
          pathString = definitions[pathString];
        }

        // Do nothing if path is not found
        if (!pathString.match(/"[^"]*"|'[^']*'/)) {
          return;
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
      }

      return { walk, definitions };
    };

    return getWalker().walk(root, result).then((definitions) => {
      replaceSymbols(root, definitions);
    });
  }
));
