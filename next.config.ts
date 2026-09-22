import type {NextConfig} from 'next';
import fs from 'fs';
import path from 'path';

// Self-healing check for firebase-applet-config.json
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCvu-Qd3kZjif7hWybPLN2kS47BntM8D5k',
          authDomain: 'ai-studio-languageflashcar-85ef0af6.firebaseapp.com',
          projectId: 'ai-studio-languageflashcar-85ef0af6',
          storageBucket: 'ai-studio-languageflashcar-85ef0af6.appspot.com',
          messagingSenderId: '379939558071',
          appId: '1:379939558071:web:55498dc6f4a348c7a2af97',
          firestoreDatabaseId: 'ai-studio-languageflashcar-85ef0af6-671a-4052-8c02-7a7bf7d374bc',
        },
        null,
        2
      )
    );
  } catch (err) {
    console.warn('Could not auto-create firebase-applet-config.json:', err);
  }
}

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || 'AIzaSyCvu-Qd3kZjif7hWybPLN2kS47BntM8D5k',
  },
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
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
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
