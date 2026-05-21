export const env = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID ?? 'bitbadges-1',
  lcdUrl: process.env.NEXT_PUBLIC_LCD_URL ?? 'http://localhost:1317',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'http://localhost:26657',
  evmRpcUrl: process.env.NEXT_PUBLIC_EVM_RPC_URL ?? 'http://localhost:8545',
  evmChainId: Number(process.env.NEXT_PUBLIC_EVM_CHAIN_ID ?? 90123),
  evmChainName: process.env.NEXT_PUBLIC_EVM_CHAIN_NAME ?? 'BitBadges Local',
  evmCurrencySymbol: process.env.NEXT_PUBLIC_EVM_CURRENCY_SYMBOL ?? 'BADGE',
  aggregatorUrl: process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? 'http://localhost:4001',
  usdcDenom: process.env.NEXT_PUBLIC_USDC_DENOM ?? 'ibc/uusdc',
  usdcDecimals: Number(process.env.NEXT_PUBLIC_USDC_DISPLAY_DECIMALS ?? 6),
  usdcSymbol: process.env.NEXT_PUBLIC_USDC_SYMBOL ?? 'USDC',
};
