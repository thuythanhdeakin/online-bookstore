'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'reports/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: {
      complexity: ['warn', 10],
      'max-depth': ['warn', 3],
      'max-lines-per-function': ['warn', { max: 60, skipComments: true, skipBlankLines: true }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    // Front-end scripts run in the browser and define globals shared between files
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...globals.browser, bootstrap: 'readonly' } },
    rules: { 'no-unused-vars': 'off' },
  },
  {
    files: ['tests/**/*.js'],
    rules: { 'max-lines-per-function': 'off' },
  },
];
