// Choix d'items du bot : maximise une valeur approximative de l'équipement complet
// (stats pondérées par la composition du deck, bonus de panoplie, paliers, actifs).
import { resolveCard } from '../core/combat.ts';
import { computeLoadout, type Equipment, type ItemLibrary } from '../core/loadout.ts';
import type { CardInstance, Element, Library } from '../core/types.ts';
import { ELEMENTS } from '../core/types.ts';

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

export function loadoutValue(cards: Library, items: ItemLibrary, deck: CardInstance[], eq: Equipment): number {
  const l = computeLoadout(cards, deck, eq, items);
  const share = attackShare(cards, deck);
  let v = l.pvBonus * 0.6 + l.blockBonus * 4 + l.actives.length * 5;
  for (const el of Object.keys(share) as Element[]) v += l.dom[el] * share[el] * 12;
  const used = ELEMENTS.filter((el) => share[el] > 0.15).length;
  v += l.passives.prisme * Math.max(0, used - 1) * 3;
  v += l.passives.terreArmure * 1.5 + l.passives.feuBrulure * 3 + l.passives.eauSoin * 2 + l.passives.airPioche * 3;
  return v;
}

export function equip(items: ItemLibrary, eq: Equipment, id: string): Equipment {
  return { ...eq, [items.items[id].slot]: id };
}

/** Meilleur item de l'offre, ou null si aucun n'améliore l'équipement. */
export function chooseItem(
  cards: Library,
  items: ItemLibrary,
  deck: CardInstance[],
  eq: Equipment,
  offer: string[],
): string | null {
  const base = loadoutValue(cards, items, deck, eq);
  let best: string | null = null;
  let bestGain = 0;
  for (const id of offer) {
    const gain = loadoutValue(cards, items, deck, equip(items, eq, id)) - base;
    if (gain > bestGain) {
      bestGain = gain;
      best = id;
    }
  }
  return best;
}
