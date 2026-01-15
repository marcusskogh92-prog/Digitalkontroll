// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'web-build/**',
      'maintenance-build/**',
      'BACKUP FILER/**',
      'eslint-report.json',
      'eslint-full.json',
    ],
  },
]);
