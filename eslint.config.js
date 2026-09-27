'use strict';
const js = require('@eslint/js');
const globals = require('globals');
// Registered (rules off) so inline security/* suppressions resolve; rules run in eslint.security.config.js
const security = require('eslint-plugin-security');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'reports/**', 'data/**'] },
  // security/* suppressions are evaluated by eslint.security.config.js, not here
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    plugins: { security },
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
