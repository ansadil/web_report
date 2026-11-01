import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@reports-web/core', '@reports-web/react'],
  webpack: (config, { isServer }) => {
    config.plugins.push({
      apply(compiler: { hooks: { normalModuleFactory: { tap: Function } } }) {
        compiler.hooks.normalModuleFactory.tap('strip-node-scheme', (nmf: { hooks: { beforeResolve: { tap: Function } } }) => {
          nmf.hooks.beforeResolve.tap('strip-node-scheme', (data: { request?: string }) => {
            if (data.request?.startsWith('node:')) data.request = data.request.slice(5);
          });
        });
      },
    });
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        url: false,
        module: false,
      };
    }
    return config;
  },
};

export default nextConfig;
