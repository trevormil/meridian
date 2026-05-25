import { env } from '@/lib/env';

/**
 * Browser-openable links into the chain's own LCD (Cosmos REST). On the live
 * devnet this is `lcd.meridian.trevormil.com` (NEXT_PUBLIC_LCD_URL) — public
 * block explorers point at mainnet/testnet and can't resolve devnet state, so
 * the chain's REST is the canonical "verify it on-chain" surface.
 */

export const lcdCollectionUrl = (collectionId: string): string =>
  `${env.lcdUrl}/bitbadges/bitbadgeschain/tokenization/get_collection/${collectionId}`;

export const lcdBalanceUrl = (collectionId: string, address: string): string =>
  `${env.lcdUrl}/bitbadges/bitbadgeschain/tokenization/get_balance/${collectionId}/${address}`;
