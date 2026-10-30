import type { ItemLibrary } from '../core/loadout.ts';
import type { ItemDef, ItemRarity, Stats } from '../core/types.ts';
import { DOFUS, itemIcon, type DofusItem } from './dofus.ts';

// Catalogue d'objets : 132 objets Dofus réels (22 par emplacement), sans panoplie.
// NOM, EMPLACEMENT, NIVEAU, ICÔNE viennent de Dofus ; la RARETÉ suit le niveau (1-40 commun, 41-100 rare,
// 101-160 mythique, 161-200 légendaire) ; la STAT est la stat principale de l'objet dans Dofus,
// convertie selon la rareté. Elle est fixe ; l'effet, lui, est tiré au sort à chaque run (core/effects.ts).

const STAT_BY_RARITY: Record<ItemRarity, { dom: number; pv: number; armure: number; prospection: number }> = {
  commun: { dom: 1, pv: 6, armure: 1, prospection: 20 },
  rare: { dom: 1, pv: 9, armure: 1, prospection: 30 },
  mythique: { dom: 2, pv: 12, armure: 2, prospection: 40 },
  legendaire: { dom: 2, pv: 15, armure: 2, prospection: 50 },
};

function stats(it: DofusItem): Stats {
  const k = STAT_BY_RARITY[it.rarity];
  switch (it.stat) {
    case 'pv': return { pv: k.pv };
    case 'armure': return { armure: k.armure };
    case 'prospection': return { prospection: k.prospection };
    default: return { dom: { [it.stat]: k.dom } };
  }
}

export const ITEM_LIST: ItemDef[] = DOFUS.catalog.map((it) => ({
  id: `item_${it.id}`, name: it.n, slot: it.slot, rarity: it.rarity, stats: stats(it),
  dofusId: it.id, icon: itemIcon(it.icon), level: it.l,
}));

export const ITEMS: ItemLibrary = { items: Object.fromEntries(ITEM_LIST.map((i) => [i.id, i])) };
