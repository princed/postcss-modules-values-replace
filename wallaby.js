/* eslint-disable import/no-extraneous-dependencies, global-require */

module.exports = () => ({
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

  testFramework: 'ava',
});
