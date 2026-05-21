/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['bitbadges'],
  webpack: (config, { isServer, webpack }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      // The SDK uses Node's `crypto` for sha256+ripemd160 address derivation;
      // alias it to crypto-browserify so the browser build resolves.
      crypto: isServer ? 'crypto' : 'crypto-browserify',
      stream: false,
    };
    config.resolve.mainFields = ['module', 'browser', 'main'];
    // Inject Buffer global — needed by the bech32 + crypto polyfills.
    if (!isServer) {
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
      );
    }
    return config;
  },
};
export default nextConfig;
