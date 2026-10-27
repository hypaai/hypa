const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withAppReactResolution } = require('@hypa/config/metro');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});

const originalResolveRequest =
  uniwindConfig.resolver?.resolveRequest ?? config.resolver?.resolveRequest;

uniwindConfig.resolver = {
  ...uniwindConfig.resolver,
  resolveRequest(context, moduleName, platform) {
    const normalizedContext =
      context.originModulePath.endsWith('/.') || context.originModulePath.endsWith('\\.')
        ? {
            ...context,
            originModulePath: context.originModulePath.slice(0, -2),
          }
        : context;

    const projectEntryRequest = `./${path.relative(normalizedContext.originModulePath, path.join(__dirname, 'index.ts'))}`;
    const repoRootEntryRequest = `./${path.relative(path.join(__dirname, '../..'), path.join(__dirname, 'index.ts'))}`;

    if (moduleName === repoRootEntryRequest || moduleName === projectEntryRequest) {
      return {
        type: 'sourceFile',
        filePath: path.join(__dirname, 'index.ts'),
      };
    }

    if (moduleName === './node_modules/expo-router/entry') {
      return {
        type: 'sourceFile',
        filePath: require.resolve('expo-router/entry', { paths: [__dirname] }),
      };
    }

    if (
      moduleName === 'hypa-keyboard-input-method-picker' ||
      moduleName.startsWith('hypa-keyboard-input-method-picker/')
    ) {
      const relativeModulePath =
        moduleName === 'hypa-keyboard-input-method-picker'
          ? 'index.ts'
          : moduleName.replace('hypa-keyboard-input-method-picker/', '');

      return {
        type: 'sourceFile',
        filePath: path.join(
          __dirname,
          'n-modules/hypa-keyboard-input-method-picker',
          relativeModulePath
        ),
      };
    }

    return originalResolveRequest(normalizedContext, moduleName, platform);
  },
};

module.exports = withAppReactResolution(uniwindConfig, __dirname);
