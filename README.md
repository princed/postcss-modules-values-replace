# PostCSS Modules Values Replace [![Build Status][ci-img]][ci]

[PostCSS] plugin to work around CSS Modules values limitations.

[ci]: https://travis-ci.org/princed/postcss-modules-values-replace
[ci-img]:  https://travis-ci.org/princed/postcss-modules-values-replace.svg
[PostCSS]: https://github.com/postcss/postcss
[css-loader]: https://github.com/webpack/css-loader 
[postcss-calc]: https://github.com/postcss/postcss-calc 
[postcss-modules-values]: https://github.com/css-modules/postcss-modules-values 

Replaces CSS Modules @values just as [postcss-modules-values] does, but without help of [css-loader],
so could it used before other [PostCSS] plugins like [postcss-calc]. 

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

### 

See [PostCSS] docs for examples for your environment.

## License

ISC

## With thanks

Code is mostly taken from [postcss-modules-values] by Glen Maddern, Mark Dalgleish and other contributors.
