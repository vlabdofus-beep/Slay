// Choix d'objets du bot : maximise une valeur approximative de l'équipement complet
// (stats pondérées par la composition du deck + puissance chiffrée des effets).
import { resolveCard } from '../core/combat.ts';
import { effectPower, TRIGGER_BY_ID } from '../core/effects.ts';
import { computeLoadout, deckElements, type EffectTable, type Equipment, type ItemLibrary } from '../core/loadout.ts';
import type { CardInstance, Element, Library } from '../core/types.ts';

/** Part des coups d'attaque du deck par élément. */
export function attackShare(cards: Library, deck: CardInstance[]): Record<Element, number> {
  const share: Record<Element, number> = { terre: 0, feu: 0, eau: 0, air: 0, neutre: 0 };
  let total = 0;
  for (const inst of deck) {
    const def = resolveCard(cards, inst);
    if (def.type !== 'attaque') continue;
    for (const fx of def.effects) {
      if (fx.type === 'damage' || fx.type === 'drain') {
        const n = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
        share[def.element] += n;
        total += n;
      }
    }
  }
  if (total) for (const el of Object.keys(share) as Element[]) share[el] /= total;
  return share;
}

export function loadoutValue(cards: Library, items: ItemLibrary, table: EffectTable, deck: CardInstance[], eq: Equipment): number {
  const l = computeLoadout(eq, items, table);
  const share = attackShare(cards, deck);
  const els = deckElements(cards, deck);
  const total = Math.max(1, deck.length);
  let v = l.pvBonus * 0.6 + l.blockBonus * 4 + l.prospection * 0.04;
  for (const el of Object.keys(share) as Element[]) v += l.dom[el] * share[el] * 12;
  for (const fx of l.effects) {
    let p = effectPower(fx);
    // Un effet élémentaire ne vaut que si le deck joue cet élément (fréquences chiffrées pour un deck orienté).
    if (fx.kind === 'roll') {
      const el = TRIGGER_BY_ID[fx.parts[0].trigger]?.el;
      if (el) p *= Math.min(1.2, (els[el] / total) * 3);
    }
    v += p;
  }
  return v;
}

export function equip(items: ItemLibrary, eq: Equipment, id: string): Equipment {
  return { ...eq, [items.items[id].slot]: id };
}

/** Meilleur objet de l'offre, ou null si aucun n'améliore l'équipement. */
export function chooseItem(
  cards: Library,
  items: ItemLibrary,
  table: EffectTable,
  deck: CardInstance[],
  eq: Equipment,
  offer: string[],
): string | null {
  const base = loadoutValue(cards, items, table, deck, eq);
  let best: string | null = null;
  let bestGain = 0;
  for (const id of offer) {
    const gain = loadoutValue(cards, items, table, deck, equip(items, eq, id)) - base;
    if (gain > bestGain) {
      bestGain = gain;
      best = id;
    }
  }
  return best;
}
