/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Increase body size limit to 50MB for large context windows and tool call sequences.
  // Without this, Next.js silently truncates bodies >1MB (default) causing 400 errors
  // from upstream providers (Kiro CONTENT_LENGTH_EXCEEDS_THRESHOLD, Antigravity INVALID_ARGUMENT).
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb"
    }
  },
  images: {
    unoptimized: true
  },
  env: {},
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Stop watching logs directory to prevent HMR during streaming
    config.watchOptions = { ...config.watchOptions, ignored: /[\\/](logs|\.next)[\\/]/ };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
