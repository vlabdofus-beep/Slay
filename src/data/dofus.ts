// Accès typé aux données Dofus extraites (src/data/dofus.json, généré par tools/build-dofus-data.mjs).
import raw from './dofus.json' with { type: 'json' };
import type { ClassId, Element, ItemRarity, Slot } from '../core/types.ts';

type DofusEl = 'terre' | 'feu' | 'eau' | 'air';

export interface DofusSpell { n: string; b: ClassId; pa: number; el: DofusEl[]; icon: number; de: string }
export interface DofusMonster {
  n: string; l: [number, number]; k: string; gfx: number; zones: string[];
  res: Record<'neutre' | DofusEl, number>;
}
/** Objet du catalogue : rareté selon le niveau Dofus, stat principale selon ses effets Dofus. */
export interface DofusItem {
  id: number; n: string; slot: Slot; l: number; icon: number;
  rarity: ItemRarity; stat: DofusEl | 'pv' | 'prospection' | 'armure';
}
export interface DofusData {
  breeds: Record<string, { id: number; n: string }>;
  spells: Record<string, DofusSpell>;
  monsters: Record<string, DofusMonster>;
  catalog: DofusItem[];
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


