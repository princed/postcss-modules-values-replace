/* eslint-disable import/no-extraneous-dependencies, global-require */

module.exports = wallaby => ({
  files: [
    'index.js',
  ],

  tests: [
    'test.js',
    { pattern: 'fixtures/*.css', load: false },
  ],

  env: {
    type: 'node',
  },

  compilers: {
    '*.js': wallaby.compilers.babel(),
  },

  testFramework: 'ava',

  setup() {
    require('babel-polyfill');
  },

  debug: true,
});
