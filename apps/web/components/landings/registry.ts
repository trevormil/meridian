import { Landing01 } from './Landing01';
import { Landing02 } from './Landing02';
import { Landing03 } from './Landing03';
import { Landing04 } from './Landing04';
import { Landing05 } from './Landing05';
import { Landing06 } from './Landing06';
import { Landing07 } from './Landing07';
import { Landing08 } from './Landing08';
import { Landing09 } from './Landing09';
import { Landing10 } from './Landing10';

/**
 * Index of landing variants. Single source of truth used by both the
 * `/landing/[id]` dispatch route and the `/preview` comparison grid.
 */
export const LANDINGS = [
  { id: '1', label: 'Bloomberg terminal', component: Landing01 },
  { id: '2', label: 'Single question', component: Landing02 },
  { id: '3', label: 'The clock', component: Landing03 },
  { id: '4', label: 'Editorial / NYT', component: Landing04 },
  { id: '5', label: 'Ledger split-screen', component: Landing05 },
  { id: '6', label: 'Marquee + explainer', component: Landing06 },
  { id: '7', label: 'Pyramid lifecycle', component: Landing07 },
  { id: '8', label: "Today's biggest movers", component: Landing08 },
  { id: '9', label: 'Glossy fintech', component: Landing09 },
  { id: '10', label: 'Asymmetric brutalist', component: Landing10 },
] as const;
