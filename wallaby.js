/* eslint-disable import/no-extraneous-dependencies, global-require */

module.exports = wallaby => ({
  files: [
    'index.js',
    { pattern: 'fixtures/**', load: false, instrument: false },
  ],

  tests: [
    'test.js',
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
