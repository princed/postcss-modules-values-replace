# PostCSS Modules Values Replace

[PostCSS] plugin to work around CSS Modules values limitations.

[PostCSS]: https://github.com/postcss/postcss
[css-loader]: https://github.com/webpack/css-loader
[postcss-calc]: https://github.com/postcss/postcss-calc
[postcss-cssnext]: https://github.com/MoOx/postcss-cssnext
[postcss-color-function]: https://github.com/postcss/postcss-color-function
[postcss-modules-tilda]: https://github.com/princed/postcss-modules-tilda
[postcss-modules-values]: https://github.com/css-modules/postcss-modules-values
[modules-values-extract]: https://github.com/alexhisen/modules-values-extract
[enhanced-resolve]: https://github.com/webpack/enhanced-resolve/#contributing
Replaces CSS Modules @values just as [postcss-modules-values] does, but without help of [css-loader],
so it could be used before other [PostCSS] plugins like [postcss-calc].

Example:

```css
/* constants.css */
@value unit: 8px;
@value footer-height: calc(unit * 5);

/* my-components.css */
@value unit, footer-height from "./constants.css";
@value component-height: calc(unit * 10);

.my-component {
  padding: unit;
  margin-top: footer-height;
  height: component-height;
}
```

yields `my-components.css`:

```css
 @value unit, footer-height from "./constants.css";
 @value component-height: calc(8px * 10);

 .my-component {
   padding: 8px;
   margin-top: calc(8px * 5);
   height: calc(8px * 10);
 }
 ```

and leads to export of following values to JS:

```js
{
    "unit": "8px",
    "footer-height": "calc(8px * 5)",
    "component-height": "calc(8px * 10)",
    ...
}
```

See how to export computed values in usage with `calc` example [below](#calc-and-value).

## Usage

Place it before other plugins:
```js
postcss([ require('postcss-modules-values-replace'), require('postcss-calc') ]);
```

When using from webpack, pass its file system in `postcss.config.js` form:

```js
module.exports = (ctx) => ({
   plugins: [
     require('postcss-modules-values-replace')({fs: ctx.webpack._compiler.inputFileSystem}),
     require('postcss-calc'),
  ]
});
```
See [PostCSS] docs for other examples for your environment.

### Configuration params

#### fs `Object`

File system to use. To make it faster in webpack pass its file system to plugin.
Cached Node's file system is used by default.

#### resolve `Object`

[enhanced-resolve]'s configuration object, see there for possible options and defaults.


#### noEmitExports `boolean`

When enabled @value rules/declarations will be removed from the emitted output

**Input:**
```css
@value myBrandColor blue;
@font-face {}

body { background: myBrandColor }
```

**Output:**
```css
@font-face {}

body { background: blue }
```

#### preprocessValues `boolean`

When enabled, permit plugins defined earlier in the PostCSS pipeline to modify `@value` declarations before they are recorded by this plugin.

#### importsAsModuleRequests `boolean`

When enabled, value imports will be resolved as module requests, in line with `css-loader`'s resolution logic [as of 2.0.0](https://github.com/webpack-contrib/css-loader/blob/master/CHANGELOG.md#200-2018-12-07).
If your code is written with pre-2.0 import syntax, and utilises [postcss-modules-tilda] for compatibility, this option is not required.

#### replaceInSelectors `boolean`

When enabled, value usage within rule selectors will also be replaced by this plugin.

#### atRules `Array<string>`

You can pass a list of at-rules in which `@value`'s should be replaced. Only `@media` rules will be processed by default.
Note that passed array isn't merged with default `['media']` but overwrites it, so you'll need to include all the rules you want to be processed.

```js
postcss([
  require('postcss-modules-values-replace')({ atRules: ['media', 'container']  })
]);
```
**Input:**
```css
@value $tables from './breakpoints.css';

@container (width >= $tablet) {}
```

**Output:**
```css
@container (width >= 768px) {}
```

### calc() and @value

To enable calculations *inside* **@value**, enable media queries support in [postcss-calc]:

```js
postcss([
  require('postcss-modules-values-replace'),
  require('postcss-calc')({mediaQueries: true})
])
```

or via [postcss-cssnext]:

```js
postcss([
  require('postcss-modules-values-replace'),
  require('postcss-cssnext')({features: {calc: {mediaQueries: true}}})
])
```

Example with `calc` enabled:

```css
/* constants.css */
@value unit: 8px;
@value footer-height: calc(unit * 5);

/* my-components.css */
@value unit, footer-height from "./constants.css";
@value component-height: calc(unit * 10);

.my-component {
  padding: unit;
  margin-top: footer-height;
  height: component-height;
}
```

yields `my-components.css`:

```css
 @value unit, footer-height from "./constants.css";
 @value component-height: 80px;

 .my-component {
   padding: 8px;
   margin-top: 40px;
   height: 80px;
 }
 ```

and leads to export of following values to JS:

```js
{
    "unit": "8px",
    "footer-height": "40px",
    "component-height": "80px",
    ...
}
```

### Other computations and @value

[postcss-calc] and [postcss-color-function] are known to work *inside* **@value** as they traverse media queries.
Experience with other plugins may differ if they ignore media queries.

### Extracting values for programmatic use
This plugin provides to postcss a custom [messages](http://api.postcss.org/Result.html#messages) object with `type: 'values'`.
The `values` property of that object will contain all the extracted values with all substitution performed (i.e. for values that reference other values).

See [modules-values-extract] for an example of how this can be used.

## Environment

Node.js 6.5 or above is recomended.

## License

ISC

## With thanks

Code is mostly taken from [postcss-modules-values] by Glen Maddern, Mark Dalgleish and other contributors.
