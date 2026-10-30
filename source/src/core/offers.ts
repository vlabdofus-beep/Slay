// Génération des offres « 1 item parmi 3 », orientées par la voie du joueur.
//
//   Phase découverte (aucun élément au palier 1) : 3 items de familles différentes, au hasard.
//   Ensuite :
//     A. un item de la voie dominante (pièces de panoplies déjà commencées favorisées) ;
//     B. deux voies proches (top 2 au palier 1 et écart ≤ 2) → un item de la 2e voie ;
//        sinon → 2e élément ou multi (Piou, prismatiques), et à partir du palier 2 une chance sur deux
//        de renforcer encore la voie dominante (l'offre « s'accentue ») ;
//     C. un joker hors voie dominante, pour toujours pouvoir pivoter.
import { Rng } from './rng.ts';
import type { ElementalElement, Equipment, ItemLibrary } from './loadout.ts';
import { PALIERS, affinity, palierOf, rankedElements, setCounts } from './loadout.ts';
import type { CardInstance, ItemDef, ItemRarity, Library } from './types.ts';

export interface OfferContext {
  cards: Library;
  items: ItemLibrary;
  deck: CardInstance[];
  equipment: Equipment;
}

const has = (el: ElementalElement) => (it: ItemDef) => it.elements.includes(el);

function weightedPick(rng: Rng, items: ItemDef[], weight: (it: ItemDef) => number): ItemDef | undefined {
  const total = items.reduce((s, it) => s + weight(it), 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= weight(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}

export function itemOffer(ctx: OfferContext, rarity: ItemRarity, rng: Rng, count = 3): string[] {
  // Multi = item à plusieurs éléments, ou pièce d'une panoplie multi / duo (la Microplie a 1 élément par pièce).
  const setKind = (it: ItemDef) => (it.panoplie ? ctx.items.panoplies[it.panoplie]?.kind : undefined);
  const isMulti = (it: ItemDef) => it.elements.length > 1 || setKind(it) === 'multi' || setKind(it) === 'duo';
  const family = (it: ItemDef) => (it.elements.length === 0 ? 'neutre' : isMulti(it) ? 'multi' : it.elements[0]);
  const equipped = new Set(Object.values(ctx.equipment));
  const pool = Object.values(ctx.items.items).filter((it) => it.rarity === rarity && !equipped.has(it.id));
  const aff = affinity(ctx.cards, ctx.deck, ctx.equipment, ctx.items);
  const [dom, second] = rankedElements(aff);
  const sets = setCounts(ctx.equipment, ctx.items);
  // Pièces d'une panoplie commencée : poids x3, l'offre pousse à la compléter.
  const weight = (it: ItemDef) => (it.panoplie && sets[it.panoplie] ? 3 : 1);

  const chosen: ItemDef[] = [];
  const take = (candidates: ItemDef[], w: (it: ItemDef) => number = weight) => {
    const it = weightedPick(rng, candidates.filter((x) => !chosen.includes(x)), w);
    if (it) chosen.push(it);
    return !!it;
  };

  if (aff[dom] < PALIERS[0]) {
    // Découverte : familles différentes
    const families = rng.shuffle([...new Set(pool.map(family))]);
    for (const f of families) {
      if (chosen.length >= count) break;
      take(pool.filter((it) => family(it) === f));
    }
  } else {
    const twoPaths = aff[second] >= PALIERS[0] && aff[dom] - aff[second] <= 2;
    take(pool.filter(has(dom)));
    if (twoPaths) take(pool.filter(has(second)));
    else if (palierOf(aff[dom]) >= 2 && rng.next() < 0.5) take(pool.filter(has(dom)));
    else take(pool.filter((it) => has(second)(it) || isMulti(it)));
    take(pool.filter((it) => !has(dom)(it)));
  }
  // Compléments si une catégorie était vide
  while (chosen.length < Math.min(count, pool.length)) take(pool);
  return chosen.map((it) => it.id);
}
