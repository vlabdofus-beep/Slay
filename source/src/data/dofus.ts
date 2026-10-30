// Accès typé aux données Dofus extraites (src/data/dofus.json, généré par tools/build-dofus-data.mjs).
import raw from './dofus.json' with { type: 'json' };
import type { ClassId, Element, Slot } from '../core/types.ts';

type DofusEl = 'terre' | 'feu' | 'eau' | 'air';

export interface DofusSpell { n: string; b: ClassId; pa: number; el: DofusEl[]; icon: number; de: string }
export interface DofusMonster {
  n: string; l: [number, number]; k: string; gfx: number; zones: string[];
  res: Record<'neutre' | DofusEl, number>;
}
export interface DofusItem {
  id: number; n: string; slot: Slot | null; l: number; icon: number; set: number | null;
  els: DofusEl[]; dmgEls: DofusEl[]; vita: boolean; genericDmg: boolean;
}
export interface DofusData {
  breeds: Record<string, { id: number; n: string }>;
  spells: Record<string, DofusSpell>;
  monsters: Record<string, DofusMonster>;
  sets: Record<string, { n: string; items: number[] }>;
  items: Record<string, DofusItem>;
}

export const DOFUS = raw as unknown as DofusData;

const IMG = 'https://api.dofusdb.fr/img';
export const spellIcon = (icon: number) => `${IMG}/spells/sort_${icon}.png`;
export const monsterImage = (gfx: number) => `${IMG}/monsters/${gfx}.png`;
export const itemIcon = (icon: number) => `${IMG}/items/${icon}.png`;
export const breedSymbol = (breedId: number) => `${IMG}/breeds/symbol_${breedId}.png`;

/** Coût en PA de Dofus → coût de la carte : 1-2 PA → 0, 3 PA → 1, 4-5 PA → 2, 6+ PA → 3. */
export function paToCost(pa: number): number {
  if (pa <= 2) return 0;
  if (pa === 3) return 1;
  if (pa <= 5) return 2;
  return 3;
}

export function spell(id: number): DofusSpell {
  const s = DOFUS.spells[String(id)];
  if (!s) throw new Error(`Sort Dofus ${id} absent de dofus.json`);
  return s;
}

/** Élément d'un sort : son premier élément, ou neutre s'il n'en a pas. */
export function spellElement(id: number): Element {
  return spell(id).el[0] ?? 'neutre';
}

export function monster(id: number): DofusMonster {
  const m = DOFUS.monsters[String(id)];
  if (!m) throw new Error(`Monstre Dofus ${id} absent de dofus.json`);
  return m;
}

/** Résistances Dofus → faiblesse(s) et résistance(s) du jeu.
 *  Si l'écart entre la meilleure et la pire résistance élémentaire est d'au moins 15 points,
 *  le ou les éléments les plus bas deviennent des faiblesses (×1,5) et les plus hauts des résistances (×0,5). */
export function weakResist(res: DofusMonster['res']): { weak: Element[]; resist: Element[] } {
  const els: DofusEl[] = ['terre', 'feu', 'eau', 'air'];
  const vals = els.map((e) => res[e]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max - min < 15) return { weak: [], resist: [] };
  return { weak: els.filter((e) => res[e] === min), resist: els.filter((e) => res[e] === max) };
}

export function item(id: number): DofusItem {
  const it = DOFUS.items[String(id)];
  if (!it) throw new Error(`Item Dofus ${id} absent de dofus.json`);
  return it;
}
