# PostCSS Modules Values Inline Imported [![Build Status][ci-img]][ci]

[PostCSS] plugin to work around CSS Modules values limitations.

[PostCSS]: https://github.com/postcss/postcss
[ci-img]:  https://travis-ci.org/princed/postcss-modules-values-replace.svg
[ci]:      https://travis-ci.org/princed/postcss-modules-values-replace

```css
.foo {
    /* Input example */
}
```

```css
.foo {
  /* Output example */
}
```

## Usage

```js
postcss([ require('postcss-modules-values-replace') ])
```

### 

See [PostCSS] docs for examples for your environment.
