// Butin : chance d'objet après un combat, rareté des objets proposés, et offre « 1 objet parmi 3 ».
//
// La prospection augmente les deux : plus d'objets après les combats normaux, et des raretés plus hautes.
// Rendement décroissant (p / (p + 100)) pour éviter l'effet boule de neige ; le légendaire reste
// quasi inaccessible hors élites.
import type { EffectTable, Equipment, ItemLibrary } from './loadout.ts';
import { deckElements, rankedElements } from './loadout.ts';
import { TRIGGER_BY_ID } from './effects.ts';
import { Rng } from './rng.ts';
import type { CardInstance, ItemDef, ItemRarity, Library } from './types.ts';
import { ITEM_RARITIES } from './types.ts';

export type LootSource = 'normal' | 'elite';

/** Poids de rareté sans prospection. */
export const LOOT_WEIGHTS: Record<LootSource, Record<ItemRarity, number>> = {
  normal: { commun: 72, rare: 24, mythique: 4, legendaire: 0.25 },
  elite: { commun: 0, rare: 55, mythique: 35, legendaire: 10 },
};

/** Part « utile » de la prospection, de 0 à 1 (rendement décroissant). */
export const prospFactor = (p: number) => Math.max(0, p) / (Math.max(0, p) + 100);

/** Chance qu'un combat normal donne un objet : 45 % sans prospection, jusqu'à 90 %. Les élites en donnent toujours. */
export function lootChance(source: LootSource, prospection: number): number {
  return source === 'elite' ? 1 : 0.45 + 0.45 * prospFactor(prospection);
}

/** Poids de rareté avec prospection : les raretés au-dessus de commun sont multipliées (jusqu'à ×3). */
export function rarityWeights(source: LootSource, prospection: number): Record<ItemRarity, number> {
  const m = 1 + 2 * prospFactor(prospection);
  const w = LOOT_WEIGHTS[source];
  return { commun: w.commun, rare: w.rare * m, mythique: w.mythique * m * m, legendaire: w.legendaire * m * m };
}

export function rollRarity(source: LootSource, prospection: number, rng: Rng): ItemRarity {
  const w = rarityWeights(source, prospection);
  const total = ITEM_RARITIES.reduce((s, r) => s + w[r], 0);
  let roll = rng.next() * total;
  for (const r of ITEM_RARITIES) {
    roll -= w[r];
    if (roll < 0) return r;
  }
  return 'commun';
}

export interface OfferContext {
  cards: Library;
  items: ItemLibrary;
  deck: CardInstance[];
  equipment: Equipment;
  table: EffectTable;
}

/** Élément dont parle l'effet tiré d'un objet (déclencheur élémentaire), s'il y en a un. */
export function effectElement(ctx: OfferContext, it: ItemDef): string | null {
  const fx = ctx.table[it.id];
  if (!fx || fx.kind !== 'roll') return null;
  return TRIGGER_BY_ID[fx.parts[0].trigger]?.el ?? null;
}

/**
 * Trois objets, chacun avec sa rareté tirée à part. Emplacements différents autant que possible.
 * Si le deck a un élément dominant (3 cartes ou plus), une chance sur deux qu'un des trois en parle :
 * l'offre accompagne la voie sans l'imposer.
 */
export function itemOffer(ctx: OfferContext, source: LootSource, prospection: number, rng: Rng, count = 3): string[] {
  const equipped = new Set(Object.values(ctx.equipment));
  const all = Object.values(ctx.items.items).filter((it) => !equipped.has(it.id));
  const els = deckElements(ctx.cards, ctx.deck);
  const [dom] = rankedElements(els);
  const lean = els[dom] >= 3 && rng.next() < 0.5;
  const chosen: ItemDef[] = [];
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(source, prospection, rng);
    let pool = all.filter((it) => it.rarity === rarity && !chosen.includes(it));
    const freshSlot = pool.filter((it) => !chosen.some((c) => c.slot === it.slot));
    if (freshSlot.length) pool = freshSlot;
    if (lean && i === 0) {
      const onPath = pool.filter((it) => effectElement(ctx, it) === dom);
      if (onPath.length) pool = onPath;
    }
    if (!pool.length) pool = all.filter((it) => !chosen.includes(it));
    if (!pool.length) break;
    chosen.push(rng.pick(pool));
  }
  return rng.shuffle(chosen).map((it) => it.id);
}
