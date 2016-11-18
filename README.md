# PostCSS Modules Values Replace [![Build Status][ci-img]][ci]

[PostCSS] plugin to work around CSS Modules values limitations.

[ci]: https://travis-ci.org/princed/postcss-modules-values-replace
[ci-img]:  https://travis-ci.org/princed/postcss-modules-values-replace.svg
[PostCSS]: https://github.com/postcss/postcss
[css-loader]: https://github.com/webpack/css-loader 
[postcss-calc]: https://github.com/postcss/postcss-calc 
[postcss-cssnext]: https://github.com/MoOx/postcss-cssnext
[postcss-color-function]: https://github.com/postcss/postcss-color-function
[postcss-modules-values]: https://github.com/css-modules/postcss-modules-values 

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

To make it faster in webpack pass its file system to plugin:
```js
{
  postcss: webpack => [
    require('postcss-modules-values-replace')({fs: webpack._compiler.inputFileSystem}),
    require('postcss-calc')
  ]
}
```

See [PostCSS] docs for examples for your environment.

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
  
[postcss-color-function] and other plugins probably won't work *inside* **@value** as they don't traverse media queries.  
  
## Environment

Node.js 6.5 or above is recomended.

## License

ISC

## With thanks

Code is mostly taken from [postcss-modules-values] by Glen Maddern, Mark Dalgleish and other contributors.
