const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// This is an npm workspaces monorepo — let Metro see the shared package and
// hoisted root node_modules, not just mobile/node_modules.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// packages/shared uses Node-ESM-style ".js" extensions on relative imports
// (required by the server's `moduleResolution: NodeNext`, and tolerated by
// Vite/tsx), e.g. `export * from "./types/user.js"` where only user.ts
// exists. Metro's resolver doesn't do that ".js" -> ".ts" mapping, so retry
// with the extension stripped before falling through to the default error.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
    } catch {
      return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName.slice(0, -3), platform);
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
