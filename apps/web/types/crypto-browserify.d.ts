declare module 'crypto-browserify' {
  // crypto-browserify mirrors Node's `crypto` module API for the browser.
  // Re-export Node's types as-is — they match the runtime shape we use
  // (createHash for sha256/ripemd160 in the SDK's converter).
  export * from 'crypto';
}
