// Ce que l'équipement donne au joueur : la somme des stats fixes des objets, et leurs effets tirés pour la run.
import { resolveCard } from './combat.ts';
import type { ItemEffect, RuleId } from './effects.ts';
import type { CardInstance, Element, ItemDef, Library, Slot } from './types.ts';
import { ELEMENTS } from './types.ts';

export interface ItemLibrary {
  items: Record<string, ItemDef>;
}

/** Un objet par emplacement (id d'objet). */
export type Equipment = Partial<Record<Slot, string>>;

/** Effet tiré de chaque objet pour la run en cours. */
export type EffectTable = Record<string, ItemEffect>;

export type ElementalElement = Exclude<Element, 'neutre'>;

export function equippedItems(equipment: Equipment, items: ItemLibrary): ItemDef[] {
  return Object.values(equipment)
    .filter((id): id is string => !!id)
    .map((id) => {
      const it = items.items[id];
      if (!it) throw new Error(`Objet inconnu : ${id}`);
      return it;
    });
}

export interface Loadout {
  pvBonus: number;
  dom: Record<Element, number>;
  blockBonus: number;
  /** Prospection des objets (stats et règle « prospecteur »), hors gains de la run. */
  prospection: number;
  effects: ItemEffect[];
}

/** Prospection donnée par la règle légendaire « prospecteur ». */
export const PROSPECTEUR_BONUS = 60;

export function computeLoadout(equipment: Equipment, items: ItemLibrary, table: EffectTable): Loadout {
  const l: Loadout = { pvBonus: 0, dom: { terre: 0, feu: 0, eau: 0, air: 0, neutre: 0 }, blockBonus: 0, prospection: 0, effects: [] };
  for (const it of equippedItems(equipment, items)) {
    l.pvBonus += it.stats.pv ?? 0;
    l.blockBonus += it.stats.armure ?? 0;
    l.prospection += it.stats.prospection ?? 0;
    for (const [el, v] of Object.entries(it.stats.dom ?? {})) l.dom[el as Element] += v ?? 0;
    const fx = table[it.id];
    if (fx) {
      l.effects.push(fx);
      if (fx.kind === 'rule' && fx.rule === ('prospecteur' satisfies RuleId)) l.prospection += PROSPECTEUR_BONUS;
    }
  }
  return l;
}

/** Nombre de cartes du deck par élément (hors neutre). */
export function deckElements(cards: Library, deck: CardInstance[]): Record<ElementalElement, number> {
  const a = { terre: 0, feu: 0, eau: 0, air: 0 };
  for (const inst of deck) {
    const el = resolveCard(cards, inst).element;
    if (el !== 'neutre') a[el]++;
  }
  return a;
}

/** Éléments triés du plus présent au moins présent dans le deck. */
export function rankedElements(a: Record<ElementalElement, number>): ElementalElement[] {
  return (ELEMENTS as ElementalElement[]).slice().sort((x, y) => a[y] - a[x]);
}
