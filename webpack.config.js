/* eslint-env node */
/* global __dirname */

const path = require('path');
const createExpoWebpackConfigAsync = require('@expo/webpack-config');

// Packages that need to be transpiled for web (they contain `require()` or native code)
const transpileModules = [
  'react-native-safe-area-context',
  '@react-navigation/elements',
  'use-latest-callback',
  'use-sync-external-store',
];

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // find babel-loader in the generated rules and extend its include to transpile specific node_modules
  const oneOf = config.module.rules.find((r) => Array.isArray(r.oneOf))?.oneOf;
  if (oneOf) {
    for (const rule of oneOf) {
      if (rule.loader && rule.loader.includes('babel-loader')) {
        const existingInclude = rule.include || [];
        const includes = Array.isArray(existingInclude) ? existingInclude.slice() : [existingInclude];

        // add node_modules packages to include list
        for (const mod of transpileModules) {
          includes.push(path.resolve(__dirname, 'node_modules', mod));
        }

        rule.include = includes;
        break;
      }
    }
  }

  return config;
};
