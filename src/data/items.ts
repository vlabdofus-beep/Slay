import type { ItemLibrary } from '../core/loadout.ts';
import type { ItemDef, ItemRarity, Stats } from '../core/types.ts';
import { DOFUS, itemIcon, type DofusItem } from './dofus.ts';

// Catalogue d'objets : 132 objets Dofus réels (22 par emplacement), sans panoplie.
// NOM, EMPLACEMENT, NIVEAU, ICÔNE viennent de Dofus ; la RARETÉ suit le niveau (1-40 commun, 41-100 rare,
// 101-160 mythique, 161-200 légendaire). La stat fixe est la stat principale de l'objet dans Dofus.
// Elle grandit avec le niveau dans la rareté, et une rareté dépasse toujours la précédente :
// on équipe un objet pour cette stat, pas seulement pour l'effet tiré au sort (core/effects.ts).
// Les dégâts s'ajoutent à chaque coup de l'élément. Voir docs/BALANCE.md.

const BAND: Record<ItemRarity, { min: number; max: number }> = {
  commun: { min: 1, max: 40 },
  rare: { min: 41, max: 100 },
  mythique: { min: 101, max: 160 },
  legendaire: { min: 161, max: 200 },
};

const STAT_RANGE: Record<ItemRarity, { dom: [number, number]; pv: [number, number]; armure: [number, number]; prospection: [number, number] }> = {
  commun: { dom: [2, 3], pv: [12, 18], armure: [2, 3], prospection: [30, 45] },
  rare: { dom: [4, 5], pv: [20, 28], armure: [4, 5], prospection: [50, 75] },
  mythique: { dom: [6, 8], pv: [32, 42], armure: [6, 8], prospection: [80, 100] },
  legendaire: { dom: [9, 12], pv: [46, 56], armure: [8, 10], prospection: [110, 140] },
};

function inBand(level: number, rarity: ItemRarity, [lo, hi]: [number, number]): number {
  const b = BAND[rarity];
  const t = Math.min(1, Math.max(0, (level - b.min) / (b.max - b.min)));
  return Math.round(lo + (hi - lo) * t);
}

function stats(it: DofusItem): Stats {
  const n = inBand(it.l, it.rarity, STAT_RANGE[it.rarity][it.stat === 'pv' || it.stat === 'armure' || it.stat === 'prospection' ? it.stat : 'dom']);
  switch (it.stat) {
    case 'pv': return { pv: n };
    case 'armure': return { armure: n };
    case 'prospection': return { prospection: n };
    default: return { dom: { [it.stat]: n } };
  }
}

export const ITEM_LIST: ItemDef[] = DOFUS.catalog.map((it) => ({
  id: `item_${it.id}`, name: it.n, slot: it.slot, rarity: it.rarity, stats: stats(it),
  dofusId: it.id, icon: itemIcon(it.icon), level: it.l,
}));

export const ITEMS: ItemLibrary = { items: Object.fromEntries(ITEM_LIST.map((i) => [i.id, i])) };
