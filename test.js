/* eslint-disable import/no-extraneous-dependencies */

const postcss = require('postcss');
const test = require('ava');
const { resolve } = require('path');

const plugin = require('.');

const parserOpts = {
  from: resolve(__dirname, 'fixtures/from.css'),
  to: resolve(__dirname, 'fixtures/to.css'),
};

function run(t, input, output, opts = {}) {
  return postcss([plugin(opts)]).process(input, parserOpts).then((result) => {
    t.is(result.css, output);
    t.is(result.warnings().length, 0);
    t.end();
  });
}

test.cb('should pass through an empty string', (t) => {
  run(t, '', '');
});

test.cb('should leave exports as is', (t) => {
  run(t, '@value red blue;', '@value red blue;');
});

test.cb('gives an error when there is no semicolon between lines', (t) => {
  const input = '@value red blue\n@value green yellow';
  const processor = postcss([plugin]);

  processor.process(input)
    .then((result) => {
      const warnings = result.warnings();

      t.is(warnings.length, 1);
      t.is(warnings[0].text, 'Invalid value definition: red blue\n@value green yellow');
      t.end();
    });
});

test.cb('gives an error when path to imported file is wrong', (t) => {
  const input = '@value red from "./non-existent-file.css"';
  const processor = postcss([plugin]);
  t.throws(processor.process(input, parserOpts)).then(() => { t.end(); });
});

test.cb('gives an error when @value statement is invalid', (t) => {
  const input = '@value , from "./colors.css"';
  const processor = postcss([plugin]);
  t.throws(processor.process(input, parserOpts)).then(() => { t.end(); });
});

test.cb('shouldn\'t break on draft spec syntax', (t) => {
  run(
    t,
    '.foo { width: calc(2+2); }',
    '.foo { width: calc(2+2); }',
  );
});

test.cb('should replace constants within the file', (t) => {
  run(
    t,
    '@value blue red; .foo { color: blue; }',
    '@value blue red; .foo { color: red; }',
  );
});

test.cb('shouldn\'t replace number-like values', (t) => {
  run(
    t,
    '@value 3char #000; .foo { color: 3char; }',
    '@value 3char #000; .foo { color: 3char; }',
  );
});

test.cb('shouldn\'t replace selector', (t) => {
  run(
    t,
    '@value blue red; .blue { color: blue; }',
    '@value blue red; .blue { color: red; }',
  );
});

test.cb('shouldn\'t replace inside url', (t) => {
  run(
    t,
    '@value blue red; .blue { background-image: url(blue.png); }',
    '@value blue red; .blue { background-image: url(blue.png); }',
  );
});

test.cb('should replace within calc', (t) => {
  run(
    t,
    '@value base: 10px;\n.a { margin: calc(base * 2); }',
    '@value base: 10px;\n.a { margin: calc(10px * 2); }',
  );
});

test.cb('should replace within calc without spaces', (t) => {
  run(
    t,
    '@value base: 10px;\n.a { margin: calc(base*2); }',
    '@value base: 10px;\n.a { margin: calc(10px*2); }',
  );
});

test.cb('should replace two constants with same name within the file and the latter should win', (t) => {
  run(
    t,
    '@value blue red; @value blue green; .foo { color: blue; }',
    '@value blue red; @value blue green; .foo { color: green; }',
  );
});

test.cb('should replace an import', (t) => {
  run(
    t,
    '@value red from "./colors.css";\n.foo { color: red; }',
    '@value red from "./colors.css";\n.foo { color: #FF0000; }',
  );
});

test.cb('should replace a constant and an import with same name within the file and the latter should win', (t) => {
  run(
    t,
    '@value red from "./colors.css"; @value red green; \n.foo { color: red; }',
    '@value red from "./colors.css"; @value red green; \n.foo { color: green; }',
  );
});


test.cb('should replace an import from several files', (t) => {
  run(
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

test.cb('should replace a constant and an import with same name within the file and the latter should win', (t) => {
  run(
    t,
    '@value red green; @value red from "./colors.css";\n.foo { color: red; }',
    '@value red green; @value red from "./colors.css";\n.foo { color: #FF0000; }',
  );
});

test.cb('should import and alias a constant and replace usages', (t) => {
  run(
    t,
    '@value blue as green from "./colors.css";\n.foo { color: green; }',
    '@value blue as green from "./colors.css";\n.foo { color: #0000FF; }',
  );
});

test.cb('should import and alias a constant (using a name from imported file) and replace usages', (t) => {
  run(
    t,
    '@value blue as red from "./colors.css";\n.foo { color: red; }',
    '@value blue as red from "./colors.css";\n.foo { color: #0000FF; }',
  );
});

test.cb('should import multiple from a single file', (t) => {
  run(
    t,
    `@value blue, red from "./colors.css";
.foo { color: red; }
.bar { color: blue }`,
    `@value blue, red from "./colors.css";
.foo { color: #FF0000; }
.bar { color: #0000FF }`,
  );
});

test.cb('should import from a definition and replace', (t) => {
  run(
    t,
    '@value colors: "./colors.css"; @value red from colors;\n.foo { color: red; }',
    '@value colors: "./colors.css"; @value red from colors;\n.foo { color: #FF0000; }',
  );
});

test.cb('should only allow values for paths if defined in the right order', (t) => {
  run(
    t,
    ' @value red from colors; @value colors: "./colors.css";\n.foo { color: red; }',
    ' @value red from colors; @value colors: "./colors.css";\n.foo { color: red; }',
  );
});

test.cb('should allow transitive values', (t) => {
  run(
    t,
    '@value aaa: red;\n@value bbb: aaa;\n.a { color: bbb; }',
    '@value aaa: red;\n@value bbb: red;\n.a { color: red; }',
  );
});

test.cb('shouldn\'t allow transitive values in urls', (t) => {
  run(
    t,
    '@value aaa: red;\n@value bbb: url(aaa.png); \n.a { background-image: url(aaa.png); }',
    '@value aaa: red;\n@value bbb: url(aaa.png); \n.a { background-image: url(aaa.png); }',
  );
});

test.cb('should allow transitive values within calc', (t) => {
  run(
    t,
    '@value base: 10px;\n@value large: calc(base * 2);\n.a { margin: large; }',
    '@value base: 10px;\n@value large: calc(10px * 2);\n.a { margin: calc(10px * 2); }',
  );
});

test.cb('should allow transitive values within calc without spaces', (t) => {
  run(
    t,
    '@value base: 10px;\n@value large: calc(base*2);\n.a { margin: large; }',
    '@value base: 10px;\n@value large: calc(10px*2);\n.a { margin: calc(10px*2); }',
  );
});

test.cb('should replace inside custom properties', (t) => {
  run(
    t,
    '@value path: test.png;\n:root {--path: path};\n.foo { background-image: url(var(--path)); }',
    '@value path: test.png;\n:root {--path: test.png};\n.foo { background-image: url(var(--path)); }',
  );
});

test.cb('should replace inside media queries', (t) => {
  run(
    t,
    '@value base: 10px;\n@media (min-width: calc(base * 200)) {}',
    '@value base: 10px;\n@media (min-width: calc(10px * 200)) {}',
  );
});

test.cb('should allow custom-property-style names', (t) => {
  run(
    t,
    '@value --red from "./colors.css";\n.foo { color: --red; }',
    '@value --red from "./colors.css";\n.foo { color: #FF0000; }',
  );
});

test.cb('should allow all colour types', (t) => {
  run(
    t,
    '@value named: red; @value hex3char #0f0; @value hex6char #00ff00; @value rgba rgba(34, 12, 64, 0.3); @value hsla hsla(220, 13.0%, 18.0%, 1);\n' +
      '.foo { color: named; background-color: hex3char; border-top-color: hex6char; border-bottom-color: rgba; outline-color: hsla; }',
    '@value named: red; @value hex3char #0f0; @value hex6char #00ff00; @value rgba rgba(34, 12, 64, 0.3); @value hsla hsla(220, 13.0%, 18.0%, 1);\n' +
      '.foo { color: red; background-color: #0f0; border-top-color: #00ff00; border-bottom-color: rgba(34, 12, 64, 0.3); outline-color: hsla(220, 13.0%, 18.0%, 1); }',
  );
});

test.cb('should import multiple from a single file on multiple lines', (t) => {
  run(
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

test.cb('should allow definitions with commas in them', (t) => {
  run(
    t,
    '@value coolShadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14)   ;\n' +
      '.foo { box-shadow: coolShadow; }',
    '@value coolShadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14)   ;\n' +
      '.foo { box-shadow: 0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14); }',
  );
});

test.cb('should allow values with nested parantheses', (t) => {
  run(
    t,
    '@value aaa: color(red lightness(50%));\n.foo { color: aaa; }',
    '@value aaa: color(red lightness(50%));\n.foo { color: color(red lightness(50%)); }',
  );
});

test.cb('should import and replace values transitively', (t) => {
  run(
    t,
    '@value level2base from "./level1.css";\n.foo { prop: level2base; }',
    '@value level2base from "./level1.css";\n.foo { prop: 20px; }',
  );
});

test.cb('should not import and replace not re-exported values', (t) => {
  run(
    t,
    '@value level2hidden from "./level1.css";\n.foo { prop: level2hidden; }',
    '@value level2hidden from "./level1.css";\n.foo { prop: level2hidden; }',
  );
});

test.cb('should replace a constant and an import with same name within the file and the latter should win in the middle of dependency tree', (t) => {
  run(
    t,
    '@value level1shadow from "./level1.css";\n.foo { prop: level1shadow; }',
    '@value level1shadow from "./level1.css";\n.foo { prop: level1shadow-value=level1; }',
  );
});

test.cb('should replace a constant and an import with same name within the file and the latter should win in the middle of dependency tree', (t) => {
  run(
    t,
    '@value level2shadow from "./level1.css";\n.foo { prop: level2shadow; }',
    '@value level2shadow from "./level1.css";\n.foo { prop: level2shadow-value=level2; }',
  );
});

test.cb('should allow imported transitive values within calc', (t) => {
  run(
    t,
    '@value base from "./level1.css";\n@value large: calc(base * 2);\n.a { margin: large; }',
    '@value base from "./level1.css";\n@value large: calc(10px * 2);\n.a { margin: calc(10px * 2); }',
  );
});

test.cb('should allow import of complex transitive values with calc', (t) => {
  run(
    t,
    '@value huge from "./level1.css";\n.a { margin: huge; }',
    '@value huge from "./level1.css";\n.a { margin: calc(10px * 4); }',
  );
});

test.cb('should allow imported transitive values within calc', (t) => {
  run(
    t,
    '@value enormous from "./level1.css";\n.a { margin: enormous; }',
    '@value enormous from "./level1.css";\n.a { margin: calc(20px * 4); }',
  );
});

test.cb('should replace an import from modules', (t) => {
  run(
    t,
    '@value module from "module/module.css";\n.a { color: module; }',
    '@value module from "module/module.css";\n.a { color: black; }',
  );
});

test.cb('should replace an import from main file of module', (t) => {
  run(
    t,
    '@value module from "module";\n.a { color: module; }',
    '@value module from "module";\n.a { color: black; }',
  );
});

test.cb('should replace an import from scoped modules', (t) => {
  run(
    t,
    '@value scoped-module from "@scope/module/module.css";\n.a { color: scoped-module; }',
    '@value scoped-module from "@scope/module/module.css";\n.a { color: purple; }',
  );
});

test.cb('variables are also present in messages', (t) => {
  const input = '@value myColor: blue; @value myColor2: myColor';
  const processor = postcss([plugin]);
  processor.process(input)
    .then((result) => {
      const { values, type } = result.messages[0];

      t.is(type, 'values');
      t.is(values.myColor2, 'blue');
      t.end();
    });
});
