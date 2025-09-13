/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      url: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      os: false,
      path: false,
    }
    
    // Ignore node-specific modules in client bundle
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'node-fetch': false,
        'pino-pretty': require('path').resolve(__dirname, 'pino-pretty-stub.js')
      }
    } else {
      // Also alias on server to avoid module not found during SSR
      config.resolve.alias = {
        ...config.resolve.alias,
        'pino-pretty': require('path').resolve(__dirname, 'pino-pretty-stub.js')
      }
    }
    
    return config
  },
  // Disable static optimization for pages that use IPFS
  experimental: {
    serverComponentsExternalPackages: ['ipfs-http-client'],
  },
}

module.exports = nextConfig