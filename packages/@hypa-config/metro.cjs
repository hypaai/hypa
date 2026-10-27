const path = require("path");

const reactPackages = ["react", "react-dom"];

function withAppReactResolution(config, projectRoot) {
  const appNodeModules = path.join(projectRoot, "node_modules");
  const originalResolveRequest = config.resolver?.resolveRequest;

  config.resolver = {
    ...config.resolver,
    resolveRequest(context, moduleName, platform) {
      const packageName = reactPackages.find(
        (name) => moduleName === name || moduleName.startsWith(`${name}/`),
      );

      if (packageName) {
        try {
          const filePath = require.resolve(moduleName, {
            paths: [appNodeModules],
          });
          const relativePath = path.relative(
            path.join(appNodeModules, packageName),
            filePath,
          );

          if (
            !relativePath.startsWith("..") &&
            !path.isAbsolute(relativePath)
          ) {
            return { type: "sourceFile", filePath };
          }
        } catch {}
      }

      if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform);
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  };

  return config;
}

module.exports = { withAppReactResolution };
