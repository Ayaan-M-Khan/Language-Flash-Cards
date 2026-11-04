import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function config(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    // Isolate dev server artifacts from `next build` so compiling never wipes active dev manifests or chunks
    distDir: isDevServer ? '.next-dev' : '.next',
    reactStrictMode: true,
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: false,
    },
    serverExternalPackages: [
      'firebase',
      '@firebase/app',
      '@firebase/auth',
      '@firebase/firestore',
      '@firebase/util',
      '@firebase/component',
      '@firebase/logger',
      '@google/genai',
    ],
    // Allow access to remote images
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: '*.googleusercontent.com',
          port: '',
          pathname: '/**',
        },
      ],
    },
    transpilePackages: ['motion'],
    experimental: {
      devtoolSegmentExplorer: false,
      optimizePackageImports: ['lucide-react', 'recharts'],
    },
    webpack: (webpackConfig, { dev }) => {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      if (dev && process.env.DISABLE_HMR === 'true') {
        webpackConfig.watchOptions = {
          ignored: /.*/,
        };
      }
      return webpackConfig;
    },
  };
}
