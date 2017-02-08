/* eslint-disable import/no-extraneous-dependencies */

import postcss from 'postcss';
import test from 'ava';

import plugin from './';

const parserOpts = {
  from: `${__dirname}/from.css`,
  to: `${__dirname}/to.css`,
};

function run(t, input, output, opts = {}) {
  return postcss([plugin(opts)]).process(input, parserOpts).then((result) => {
    t.is(result.css, output);
    t.is(result.warnings().length, 0);
  });
}

test('should pass through an empty string', async (t) => {
  await run(t, '', '');
});

test('should leave exports as is', async (t) => {
  await run(t, '@value red blue;', '@value red blue;');
});

test('gives an error when there is no semicolon between lines', async (t) => {
  const input = '@value red blue\n@value green yellow';
  const processor = postcss([plugin]);
  const result = await processor.process(input);
  const warnings = result.warnings();

  t.is(warnings.length, 1);
  t.is(warnings[0].text, 'Invalid value definition: red blue\n@value green yellow');
});

test('gives an error when path to imported file is wrong', async (t) => {
  const input = '@value red from "./non-existent-file.css"';
  const processor = postcss([plugin]);
  t.throws(processor.process(input, parserOpts));
});

test('gives an error when @value statement is invalid', async (t) => {
  const input = '@value , from "./fixtures/colors.css"';
  const processor = postcss([plugin]);
  t.throws(processor.process(input, parserOpts));
});

test('should replace constants within the file', async (t) => {
  await run(
    t,
    '@value blue red; .foo { color: blue; }',
    '@value blue red; .foo { color: red; }',
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
    '@value red from "./fixtures/colors.css";\n.foo { color: red; }',
    '@value red from "./fixtures/colors.css";\n.foo { color: #FF0000; }',
  );
});

test('should replace a constant and an import with same name within the file and the latter should win', async (t) => {
  await run(
    t,
    '@value red from "./fixtures/colors.css"; @value red green; \n.foo { color: red; }',
    '@value red from "./fixtures/colors.css"; @value red green; \n.foo { color: green; }',
  );
});


test('should replace a constant and an import with same name within the file and the latter should win', async (t) => {
  await run(
    t,
    '@value red green; @value red from "./fixtures/colors.css";\n.foo { color: red; }',
    '@value red green; @value red from "./fixtures/colors.css";\n.foo { color: #FF0000; }',
  );
});

test('should import and alias a constant and replace usages', async (t) => {
  await run(
    t,
    '@value blue as green from "./fixtures/colors.css";\n.foo { color: green; }',
    '@value blue as green from "./fixtures/colors.css";\n.foo { color: #0000FF; }');
});

test('should import and alias a constant (using a name from imported file) and replace usages', async (t) => {
  await run(
    t,
    '@value blue as red from "./fixtures/colors.css";\n.foo { color: red; }',
    '@value blue as red from "./fixtures/colors.css";\n.foo { color: #0000FF; }',
  );
});

test('should import multiple from a single file', async (t) => {
  await run(
    t,
    `@value blue, red from "./fixtures/colors.css";
.foo { color: red; }
.bar { color: blue }`,
    `@value blue, red from "./fixtures/colors.css";
.foo { color: #FF0000; }
.bar { color: #0000FF }`,
  );
});

test('should import from a definition and replace', async (t) => {
  await run(
    t,
    '@value colors: "./fixtures/colors.css"; @value red from colors;\n.foo { color: red; }',
    '@value colors: "./fixtures/colors.css"; @value red from colors;\n.foo { color: #FF0000; }',
  );
});

test('should only allow values for paths if defined in the right order', async (t) => {
  await run(
    t,
    ' @value red from colors; @value colors: "./fixtures/colors.css";\n.foo { color: red; }',
    ' @value red from colors; @value colors: "./fixtures/colors.css";\n.foo { color: red; }',
  );
});

test('should allow transitive values', async (t) => {
  await run(
    t,
    '@value aaa: red;\n@value bbb: aaa;\n.a { color: bbb; }',
    '@value aaa: red;\n@value bbb: red;\n.a { color: red; }',
  );
});

test('should allow transitive values within calc', async (t) => {
  await run(
    t,
    '@value base: 10px;\n@value large: calc(base * 2);\n.a { margin: large; }',
    '@value base: 10px;\n@value large: calc(10px * 2);\n.a { margin: calc(10px * 2); }',
  );
});

test('should allow custom-property-style names', async (t) => {
  await run(
    t,
    '@value --red from "./fixtures/colors.css";\n.foo { color: --red; }',
    '@value --red from "./fixtures/colors.css";\n.foo { color: #FF0000; }',
  );
});

test('should allow all colour types', async (t) => {
  await run(
    t,
    '@value named: red; @value 3char #0f0; @value 6char #00ff00; @value rgba rgba(34, 12, 64, 0.3); @value hsla hsla(220, 13.0%, 18.0%, 1);\n' +
    '.foo { color: named; background-color: 3char; border-top-color: 6char; border-bottom-color: rgba; outline-color: hsla; }',
    '@value named: red; @value 3char #0f0; @value 6char #00ff00; @value rgba rgba(34, 12, 64, 0.3); @value hsla hsla(220, 13.0%, 18.0%, 1);\n' +
    '.foo { color: red; background-color: #0f0; border-top-color: #00ff00; border-bottom-color: rgba(34, 12, 64, 0.3); outline-color: hsla(220, 13.0%, 18.0%, 1); }',
  );
});

test('should import multiple from a single file on multiple lines', async (t) => {
  await run(
    t,
    `@value (
  blue,
  red
) from "./fixtures/colors.css";
.foo { color: red; }
.bar { color: blue }`,
    `@value (
  blue,
  red
) from "./fixtures/colors.css";
.foo { color: #FF0000; }
.bar { color: #0000FF }`,
  );
});

test('should allow definitions with commas in them', async (t) => {
  await run(
    t,
    '@value coolShadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14)   ;\n' +
    '.foo { box-shadow: coolShadow; }',
    '@value coolShadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14)   ;\n' +
    '.foo { box-shadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14); }',
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
    '@value level2base from "./fixtures/level1.css";\n.foo { prop: level2base; }',
    '@value level2base from "./fixtures/level1.css";\n.foo { prop: 20px; }',
  );
});

test('should not import and replace not re-exported values', async (t) => {
  await run(
    t,
    '@value level2hidden from "./fixtures/level1.css";\n.foo { prop: level2hidden; }',
    '@value level2hidden from "./fixtures/level1.css";\n.foo { prop: level2hidden; }',
  );
});

test('should replace a constant and an import with same name within the file and the latter should win in the middle of dependency tree', async (t) => {
  await run(
    t,
    '@value level1shadow from "./fixtures/level1.css";\n.foo { prop: level1shadow; }',
    '@value level1shadow from "./fixtures/level1.css";\n.foo { prop: level1shadow-value=level1; }',
  );
});

test('should replace a constant and an import with same name within the file and the latter should win in the middle of dependency tree', async (t) => {
  await run(
    t,
    '@value level2shadow from "./fixtures/level1.css";\n.foo { prop: level2shadow; }',
    '@value level2shadow from "./fixtures/level1.css";\n.foo { prop: level2shadow-value=level2; }',
  );
});

test('should allow imported transitive values within calc', async (t) => {
  await run(
    t,
    '@value base from "./fixtures/level1.css";\n@value large: calc(base * 2);\n.a { margin: large; }',
    '@value base from "./fixtures/level1.css";\n@value large: calc(10px * 2);\n.a { margin: calc(10px * 2); }',
  );
});

test('should allow import of complex transitive values with calc', async (t) => {
  await run(
    t,
    '@value huge from "./fixtures/level1.css";\n.a { margin: huge; }',
    '@value huge from "./fixtures/level1.css";\n.a { margin: calc(10px * 4); }',
  );
});

test('should allow imported transitive values within calc', async (t) => {
  await run(
    t,
    '@value enormous from "./fixtures/level1.css";\n.a { margin: enormous; }',
    '@value enormous from "./fixtures/level1.css";\n.a { margin: calc(20px * 4); }',
  );
});

test('variables are also present in messages', async (t) => {
  const input = '@value myColor: blue; @value myColor2: myColor';
  const processor = postcss([plugin]);
  const result = await processor.process(input);
  const values = result.messages[0].values;
  const type = result.messages[0].type;

  t.is(type, 'values');
  t.is(values.myColor2, 'blue');
});
