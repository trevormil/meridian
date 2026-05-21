export const env = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID ?? 'bitbadges-1',
  lcdUrl: process.env.NEXT_PUBLIC_LCD_URL ?? 'http://localhost:1317',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'http://localhost:26657',
  evmRpcUrl: process.env.NEXT_PUBLIC_EVM_RPC_URL ?? 'http://localhost:8545',
  evmChainId: Number(process.env.NEXT_PUBLIC_EVM_CHAIN_ID ?? 90123),
  evmChainName: process.env.NEXT_PUBLIC_EVM_CHAIN_NAME ?? 'BitBadges Local',
  evmCurrencySymbol: process.env.NEXT_PUBLIC_EVM_CURRENCY_SYMBOL ?? 'BADGE',
  aggregatorUrl: process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? 'http://localhost:4001',
  // The local devnet seeds USDC under this canonical IBC denom (see
  // bitbadgeschain/config.yml `accounts:`). Production/testnet may override
  // via NEXT_PUBLIC_USDC_DENOM, but defaulting here keeps `bun run dev` working
  // without an .env.local for fresh checkouts.
  usdcDenom: process.env.NEXT_PUBLIC_USDC_DENOM ?? 'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349',
  usdcDecimals: Number(process.env.NEXT_PUBLIC_USDC_DISPLAY_DECIMALS ?? 6),
  usdcSymbol: process.env.NEXT_PUBLIC_USDC_SYMBOL ?? 'USDC',
};
