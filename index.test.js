/* eslint-disable import/no-extraneous-dependencies */

import { resolve } from 'path';
import postcss from 'postcss';
import { test } from 'vitest';

import plugin from '.';

const parserOpts = {
  from: resolve(__dirname, 'fixtures/from.css'),
  to: resolve(__dirname, 'fixtures/to.css'),
};

function run(t, input, output, opts = {}, extraPlugins = []) {
  return postcss([
    ...extraPlugins,
    plugin(opts),
  ]).process(input, parserOpts).then((result) => {
    t.expect(result.css).toBe(output);
    t.expect(result.warnings().length).toBe(0);
  });
}

// Simple plugin that replaces "black" with "purple" within @value declarations,
// used to test preprocess value transformation
const blackToPurplePlugin = () => ({
  postcssPlugin: 'testBlackToPurple',
  Once(root) {
    root.walkAtRules('value', (atRule) => {
      atRule.replaceWith(atRule.clone({
        params: atRule.params.replace('black', 'purple'),
      }));
    });
  },
});
blackToPurplePlugin.postcss = true;

test('should pass through an empty string', async (t) => {
  await run(t, '', '');
});

test('should leave exports as is', async (t) => {
  await run(t, '@value red blue;', '@value red blue;');
});

test('should leave other at rules alone if noEmitExports is true', async (t) => {
  await run(t, '@font-face {}', '@font-face {}', { noEmitExports: true });
});

test('should remove exports if noEmitExports is true', async (t) => {
  await run(t, '@value red blue;', '', { noEmitExports: true });
});

test('gives an error when there is no semicolon between lines', async (t) => {
  const input = '@value red blue\n@value green yellow';
  const processor = postcss([plugin]);
  const result = await processor.process(input, { from: undefined });
  const warnings = result.warnings();

  t.expect(warnings.length).toBe(1);
  t.expect(warnings[0].text).toBe('Invalid value definition: red blue\n@value green yellow');
});

test('gives an error when path to imported file is wrong', async (t) => {
  const input = '@value red from "./non-existent-file.css"';
  const processor = postcss([plugin]);
  await t.expect(processor.process(input, parserOpts)).rejects.toThrow("Can't resolve './non-existent-file.css'");
});

test('gives an error when @value statement is invalid', async (t) => {
  const input = '@value , from "./colors.css"';
  const processor = postcss([plugin]);
  await t.expect(processor.process(input, parserOpts)).rejects.toThrow('@value statement "" is invalid!');
});

test('shouldn\'t break on draft spec syntax', async (t) => {
  await run(
    t,
    '.foo { width: calc(2+2); }',
    '.foo { width: calc(2+2); }',
  );
});

test('should replace constants within the file', async (t) => {
  await run(
    t,
    '@value blue red; .foo { color: blue; }',
    '@value blue red; .foo { color: red; }',
  );
});

test('shouldn\'t replace number-like values', async (t) => {
  await run(
    t,
    '@value 3char #000; .foo { color: 3char; }',
    '@value 3char #000; .foo { color: 3char; }',
  );
});

test('shouldn\'t replace selector', async (t) => {
  await run(
    t,
    '@value blue red; .blue { color: blue; }',
    '@value blue red; .blue { color: red; }',
  );
});

test('shouldn\'t replace inside url', async (t) => {
  await run(
    t,
    '@value blue red; .blue { background-image: url(blue.png); }',
    '@value blue red; .blue { background-image: url(blue.png); }',
  );
});

test('should replace within calc', async (t) => {
  await run(
    t,
    '@value base: 10px;\n.a { margin: calc(base * 2); }',
    '@value base: 10px;\n.a { margin: calc(10px * 2); }',
  );
});

test('should replace within calc without spaces', async (t) => {
  await run(
    t,
    '@value base: 10px;\n.a { margin: calc(base*2); }',
    '@value base: 10px;\n.a { margin: calc(10px*2); }',
  );
});

test('should replace two constants with same name within the file and the latter should win', async (t) => {
  await run(
    t,
    '@value blue red; @value blue green; .foo { color: blue; }',
    '@value blue red; @value blue green; .foo { color: green; }',
  );
});

test('should replace an import', async (t) => {
  await run(
    t,
    '@value red from "./colors.css";\n.foo { color: red; }',
    '@value red from "./colors.css";\n.foo { color: #FF0000; }',
  );
});

test('should replace a constant and an import with same name within the file and the latter should win', async (t) => {
  await run(
    t,
    '@value red from "./colors.css"; @value red green; \n.foo { color: red; }',
    '@value red from "./colors.css"; @value red green; \n.foo { color: green; }',
  );
});

test('should replace an import from several files', async (t) => {
  await run(
    t,
    `@value red from "./colors.css";
@value base from "./level1.css";
@value level2base from "./level2.css";
.a { margin: base; }
.b { margin: level2base; }
.foo { color: red; }`,
    `@value red from "./colors.css";
@value base from "./level1.css";
@value level2base from "./level2.css";
.a { margin: 10px; }
.b { margin: 20px; }
.foo { color: #FF0000; }`,
  );
});

test('should replace a constant and an import with same name within the file and the latter should win', async (t) => {
  await run(
    t,
    '@value red green; @value red from "./colors.css";\n.foo { color: red; }',
    '@value red green; @value red from "./colors.css";\n.foo { color: #FF0000; }',
  );
});

test('should import and alias a constant and replace usages', async (t) => {
  await run(
    t,
    '@value blue as green from "./colors.css";\n.foo { color: green; }',
    '@value blue as green from "./colors.css";\n.foo { color: #0000FF; }',
  );
});

test('should import and alias a constant (using a name from imported file) and replace usages', async (t) => {
  await run(
    t,
    '@value blue as red from "./colors.css";\n.foo { color: red; }',
    '@value blue as red from "./colors.css";\n.foo { color: #0000FF; }',
  );
});

test('should import multiple from a single file', async (t) => {
  await run(
    t,
    `@value blue, red from "./colors.css";
.foo { color: red; }
.bar { color: blue }`,
    `@value blue, red from "./colors.css";
.foo { color: #FF0000; }
.bar { color: #0000FF }`,
  );
});

test('should import from a definition and replace', async (t) => {
  await run(
    t,
    '@value colors: "./colors.css"; @value red from colors;\n.foo { color: red; }',
    '@value colors: "./colors.css"; @value red from colors;\n.foo { color: #FF0000; }',
  );
});

test('should only allow values for paths if defined in the right order', async (t) => {
  await run(
    t,
    ' @value red from colors; @value colors: "./colors.css";\n.foo { color: red; }',
    ' @value red from colors; @value colors: "./colors.css";\n.foo { color: red; }',
  );
});

test('should allow transitive values', async (t) => {
  await run(
    t,
    '@value aaa: red;\n@value bbb: aaa;\n.a { color: bbb; }',
    '@value aaa: red;\n@value bbb: red;\n.a { color: red; }',
  );
});

test('shouldn\'t allow transitive values in urls', async (t) => {
  await run(
    t,
    '@value aaa: red;\n@value bbb: url(aaa.png); \n.a { background-image: url(aaa.png); }',
    '@value aaa: red;\n@value bbb: url(aaa.png); \n.a { background-image: url(aaa.png); }',
  );
});

test('should allow transitive values within calc', async (t) => {
  await run(
    t,
    '@value base: 10px;\n@value large: calc(base * 2);\n.a { margin: large; }',
    '@value base: 10px;\n@value large: calc(10px * 2);\n.a { margin: calc(10px * 2); }',
  );
});

test('should allow transitive values within calc without spaces', async (t) => {
  await run(
    t,
    '@value base: 10px;\n@value large: calc(base*2);\n.a { margin: large; }',
    '@value base: 10px;\n@value large: calc(10px*2);\n.a { margin: calc(10px*2); }',
  );
});

test('should replace inside custom properties', async (t) => {
  await run(
    t,
    '@value path: test.png;\n:root {--path: path};\n.foo { background-image: url(var(--path)); }',
    '@value path: test.png;\n:root {--path: test.png};\n.foo { background-image: url(var(--path)); }',
  );
});

test('should replace inside media queries by default, without specifying custom at-rules', async (t) => {
  await run(
    t,
    '@value base: 10px;\n@media (min-width: calc(base * 200)) {}',
    '@value base: 10px;\n@media (min-width: calc(10px * 200)) {}',
  );
});

test('should replace inside media queries when it is specified as a custom at-rule', async (t) => {
  await run(
    t,
    '@value base: 10px;\n@media (min-width: calc(base * 200)) {}',
    '@value base: 10px;\n@media (min-width: calc(10px * 200)) {}',
    { atRules: ['media'] }
  );
});

test('should replace inside media and container queries when they are specified as a custom at-rules', async (t) => {
  await run(
    t,
    '@value base: 10px;\n@media (min-width: calc(base * 200)) {}\n@container (min-width: calc(base * 200)) {}',
    '@value base: 10px;\n@media (min-width: calc(10px * 200)) {}\n@container (min-width: calc(10px * 200)) {}',
    { atRules: ['media', 'container'] }
  );
});

test('should allow custom-property-style names', async (t) => {
  await run(
    t,
    '@value --red from "./colors.css";\n.foo { color: --red; }',
    '@value --red from "./colors.css";\n.foo { color: #FF0000; }',
  );
});

test('should allow all colour types', async (t) => {
  await run(
    t,
    '@value named: red; @value hex3char #0f0; @value hex6char #00ff00; @value rgba rgba(34, 12, 64, 0.3); @value hsla hsla(220, 13.0%, 18.0%, 1);\n'
    + '.foo { color: named; background-color: hex3char; border-top-color: hex6char; border-bottom-color: rgba; outline-color: hsla; }',
    '@value named: red; @value hex3char #0f0; @value hex6char #00ff00; @value rgba rgba(34, 12, 64, 0.3); @value hsla hsla(220, 13.0%, 18.0%, 1);\n'
    + '.foo { color: red; background-color: #0f0; border-top-color: #00ff00; border-bottom-color: rgba(34, 12, 64, 0.3); outline-color: hsla(220, 13.0%, 18.0%, 1); }',
  );
});

test('should import multiple from a single file on multiple lines', async (t) => {
  await run(
    t,
    `@value (
  blue,
  red
) from "./colors.css";
.foo { color: red; }
.bar { color: blue }`,
    `@value (
  blue,
  red
) from "./colors.css";
.foo { color: #FF0000; }
.bar { color: #0000FF }`,
  );
});

test('should allow definitions with commas in them', async (t) => {
  await run(
    t,
    '@value coolShadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14)   ;\n'
    + '.foo { box-shadow: coolShadow; }',
    '@value coolShadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14)   ;\n'
    + '.foo { box-shadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14); }',
  );
});

test('should allow values with nested parantheses', async (t) => {
  await run(
    t,
    '@value aaa: color(red lightness(50%));\n.foo { color: aaa; }',
    '@value aaa: color(red lightness(50%));\n.foo { color: color(red lightness(50%)); }',
  );
});

test('should import and replace values transitively', async (t) => {
  await run(
    t,
    '@value level2base from "./level1.css";\n.foo { prop: level2base; }',
    '@value level2base from "./level1.css";\n.foo { prop: 20px; }',
  );
});

test('should not import and replace not re-exported values', async (t) => {
  await run(
    t,
    '@value level2hidden from "./level1.css";\n.foo { prop: level2hidden; }',
    '@value level2hidden from "./level1.css";\n.foo { prop: level2hidden; }',
  );
});

test('should replace a constant and an import with same name within the file and the latter should win in the middle of dependency tree', async (t) => {
  await run(
    t,
    '@value level1shadow from "./level1.css";\n.foo { prop: level1shadow; }',
    '@value level1shadow from "./level1.css";\n.foo { prop: level1shadow-value=level1; }',
  );
});

test('should replace a constant and an import with same name within the file and the latter should win in the middle of dependency tree', async (t) => {
  await run(
    t,
    '@value level2shadow from "./level1.css";\n.foo { prop: level2shadow; }',
    '@value level2shadow from "./level1.css";\n.foo { prop: level2shadow-value=level2; }',
  );
});

test('should allow imported transitive values within calc', async (t) => {
  await run(
    t,
    '@value base from "./level1.css";\n@value large: calc(base * 2);\n.a { margin: large; }',
    '@value base from "./level1.css";\n@value large: calc(10px * 2);\n.a { margin: calc(10px * 2); }',
  );
});

test('should allow import of complex transitive values with calc', async (t) => {
  await run(
    t,
    '@value huge from "./level1.css";\n.a { margin: huge; }',
    '@value huge from "./level1.css";\n.a { margin: calc(10px * 4); }',
  );
});

test('should allow imported transitive values within calc', async (t) => {
  await run(
    t,
    '@value enormous from "./level1.css";\n.a { margin: enormous; }',
    '@value enormous from "./level1.css";\n.a { margin: calc(20px * 4); }',
  );
});

test('should replace an import from modules', async (t) => {
  await run(
    t,
    '@value module from "module/module.css";\n.a { color: module; }',
    '@value module from "module/module.css";\n.a { color: black; }',
  );
});

test('should apply extra plugins to inner processing', async (t) => {
  await run(
    t,
    '@value module from "module/module.css";\n.a { color: module; }',
    '@value module from "module/module.css";\n.a { color: purple; }',
    { preprocessValues: true },
    [blackToPurplePlugin()],
  );
});

test('should replace an import from main file of module', async (t) => {
  await run(
    t,
    '@value module from "module";\n.a { color: module; }',
    '@value module from "module";\n.a { color: black; }',
  );
});

test('should replace an import from scoped modules', async (t) => {
  await run(
    t,
    '@value scoped-module from "@scope/module/module.css";\n.a { color: scoped-module; }',
    '@value scoped-module from "@scope/module/module.css";\n.a { color: purple; }',
  );
});

test('should resolve imports as module requests', async (t) => {
  await run(
    t,
    '@value scoped-module from "~@scope/module/module.css";\n@value base from "level1.css";\n.a { color: scoped-module; width: base; }',
    '@value scoped-module from "~@scope/module/module.css";\n@value base from "level1.css";\n.a { color: purple; width: 10px; }',
    { importsAsModuleRequests: true },
  );
});

test('should replace values within rule selectors', async (t) => {
  await run(
    t,
    '@value selectorValue: .exampleClass;\nselectorValue a { color: purple; }',
    '@value selectorValue: .exampleClass;\n.exampleClass a { color: purple; }',
    { replaceInSelectors: true },
  );
});

test('variables are also present in messages', async (t) => {
  const input = '@value myColor: blue; @value myColor2: myColor';
  const processor = postcss([plugin]);
  const result = await processor.process(input, { from: undefined });
  const { values, type } = result.messages[0];

  t.expect(type).toBe('values');
  t.expect(values.myColor2).toBe('blue');
});

test('tailwind', async (t) => {
  const tailwind = () => ({
    postcssPlugin: 'tailwind',
    Once(root) {
      root.walkAtRules('tailwind', (atRule) => {
        atRule.replaceWith(postcss.decl({ prop: '--tw-props', value: ' ' }));
      });
    },
  });
  tailwind.postcss = true;

  const input = '@tailwind base;';
  const processor = postcss([tailwind, plugin]);
  const result = await processor.process(input, { from: undefined });

  t.expect(result.css).toBe('--tw-props:  ;');
  t.expect(result.warnings().length).toBe(0);
});
