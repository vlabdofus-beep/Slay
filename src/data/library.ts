import type { CardInstance, ClassId, Library } from '../core/types.ts';
import { ALL_CARDS } from './cards.ts';
import { MONSTERS } from './monsters.ts';
import { STATUS_CARDS } from './statusCards.ts';

export const LIBRARY: Library = {
  cards: Object.fromEntries([...ALL_CARDS, ...STATUS_CARDS].map((c) => [c.id, c])),
  monsters: Object.fromEntries(MONSTERS.map((m) => [m.id, m])),
};

export { CLASS_START_HP, STARTERS } from './classStart.ts';
import { CLASS_START_HP, STARTERS } from './classStart.ts';
import { applyBalance } from './balance.ts';
import { GODS } from './gods.ts';
import { RELICS } from './relics.ts';
import { EVENTS } from './events.ts';
import { PASSIVE_VALUES } from '../core/classes.ts';
import { TIER_SCALE } from './monsters.ts';
import BALANCE from '../../equilibrage.json' with { type: 'json' };

/** Le fichier d'équilibrage (equilibrage.json) fait foi : il s'applique dès le chargement des données. */
export const BALANCE_TARGETS = { cards: LIBRARY.cards, monsters: LIBRARY.monsters, classHp: CLASS_START_HP, starters: STARTERS, passives: PASSIVE_VALUES, scale: TIER_SCALE, gods: GODS, relics: RELICS, events: EVENTS };
export const balanceWarnings = applyBalance(BALANCE, BALANCE_TARGETS);

let uidCounter = 1;
export function newCard(id: string, upgraded = false): CardInstance {
  return { uid: uidCounter++, id, upgraded };
}

export function starterDeck(classe: ClassId): CardInstance[] {
  const spec = STARTERS[classe];
  if (!spec) throw new Error(`Classe sans deck de départ : ${classe}`);
  return Object.entries(spec).flatMap(([id, n]) => Array.from({ length: n }, () => newCard(id)));
}

/** Cartes proposées en récompense (hors cartes de base). */
export function rewardPool(classe: ClassId): string[] {
  return ALL_CARDS.filter((c) => (c.classe === classe || c.classe === 'neutre') && c.rarity !== 'base' && !c.token).map((c) => c.id);
}
