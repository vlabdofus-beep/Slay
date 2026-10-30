import type { CardInstance, ClassId, Library } from '../core/types.ts';
import { ALL_CARDS } from './cards.ts';
import { MONSTERS } from './monsters.ts';
import { STATUS_CARDS } from './statusCards.ts';

export const LIBRARY: Library = {
  cards: Object.fromEntries([...ALL_CARDS, ...STATUS_CARDS].map((c) => [c.id, c])),
  monsters: Object.fromEntries(MONSTERS.map((m) => [m.id, m])),
};

// Cra : 70 → 75 quand il était derrière l'Iop, puis retour à 70 avec les vrais sorts (drain, cartes à 0 PA),
// qui l'ont fait passer devant. Voir docs/BALANCE.md.
export const CLASS_START_HP: Partial<Record<ClassId, number>> = { iop: 80, cra: 70 };

const STARTERS: Partial<Record<ClassId, Record<string, number>>> = {
  iop: { iop_coup_epee: 5, iop_vitalite: 4, iop_pression: 1 },
  cra: { cra_coup_arc: 5, cra_tir_repli: 4, cra_fleche_glacee: 1 },
};

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
  return ALL_CARDS.filter((c) => (c.classe === classe || c.classe === 'neutre') && c.rarity !== 'base').map((c) => c.id);
}
