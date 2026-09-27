'use strict';
/**
 * SAST (Static Application Security Testing) profile, separate from the
 * style/maintainability lint so the Security stage has its own gate.
 *  - eslint-plugin-security: Node.js risks (eval, child_process, unsafe regex, fs paths, timing attacks)
 *  - eslint-plugin-no-unsanitized (Mozilla): DOM XSS sinks such as innerHTML / insertAdjacentHTML
 */
const globals = require('globals');
const security = require('eslint-plugin-security');
const noUnsanitized = require('eslint-plugin-no-unsanitized');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'reports/**', 'tests/**', '*.config.js'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // Our object-index lookups use Maps / fixed keys; this rule is ~100% false positives here.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: globals.browser },
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      'no-unsanitized/property': 'error',
      'no-unsanitized/method': 'error',
    },
  },
];
