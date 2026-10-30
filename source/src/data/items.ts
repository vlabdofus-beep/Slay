import type { ItemLibrary } from '../core/loadout.ts';
import type { ActiveDef, Element, ItemDef, PanoplieDef, Slot, Stats } from '../core/types.ts';
import { DOFUS, item as dofusItem, itemIcon, type DofusItem } from './dofus.ts';

// Items reliés aux vraies panoplies Dofus (src/data/dofus.json) : NOM, EMPLACEMENT, NIVEAU, ICÔNE et
// ÉLÉMENTS viennent de Dofus (éléments déduits des effets : Force / Dommage Terre → Terre, etc.).
// Les STATS sont converties selon notre gabarit, une stat par pièce :
//   Dommage élémentaire → +1 dommage de l'élément ; sinon (panoplie multi) élément → +1 dommage ; sinon Vitalité → +6 PV ;
//   sinon caractéristique élémentaire → +1 dommage ; sinon → +1 armure.
// 4 pièces par panoplie (emplacements distincts), bonus à 2 et 4 pièces selon la famille de la panoplie.

type ElementalEl = Exclude<Element, 'neutre'>;
type Family =
  | { kind: 'mono'; el: ElementalEl }
  | { kind: 'duo'; els: [ElementalEl, ElementalEl] }
  | { kind: 'multi' }
  | { kind: 'neutre' };

const SETS: { id: string; dofusId: number; family: Family }[] = [
  { id: 'piou_vert', dofusId: 72, family: { kind: 'mono', el: 'terre' } },
  { id: 'piou_rouge', dofusId: 60, family: { kind: 'mono', el: 'feu' } },
  { id: 'moskito', dofusId: 23, family: { kind: 'mono', el: 'eau' } },
  { id: 'tofu', dofusId: 50, family: { kind: 'mono', el: 'air' } },
  { id: 'bouftou', dofusId: 1, family: { kind: 'duo', els: ['terre', 'feu'] } },
  { id: 'microplie', dofusId: 364, family: { kind: 'multi' } },
  { id: 'intrepide', dofusId: 150, family: { kind: 'neutre' } },
];

function bonuses(f: Family): Record<number, Stats> {
  switch (f.kind) {
    case 'mono':
      return { 2: { dom: { [f.el]: 1 } }, 4: { dom: { [f.el]: 1 }, armure: 1, pv: 8 } };
    case 'duo':
      return { 2: { pv: 6 }, 4: { dom: { [f.els[0]]: 1, [f.els[1]]: 1 }, armure: 1, pv: 8 } };
    case 'multi':
      return { 2: { prisme: 1 }, 4: { prisme: 1, dom: { terre: 1, feu: 1, eau: 1, air: 1 } } };
    case 'neutre':
      return { 2: { armure: 1 }, 4: { armure: 1, pv: 10 } };
  }
}

/** Éléments retenus pour une pièce : pour une panoplie mono, on ne garde que l'élément de la panoplie. */
function pieceElements(it: DofusItem, f: Family): ElementalEl[] {
  if (f.kind === 'neutre') return [];
  if (f.kind === 'mono') return it.els.includes(f.el) ? [f.el] : [];
  if (f.kind === 'duo') return it.els.filter((e) => f.els.includes(e));
  return it.els;
}

function pieceStats(it: DofusItem, els: ElementalEl[], f: Family): Stats {
  const dmg = it.dmgEls.filter((e) => els.includes(e));
  if (dmg.length) return { dom: Object.fromEntries(dmg.map((e) => [e, 1])) };
  // Panoplie multi : chaque pièce renforce son propre élément.
  if (f.kind === 'multi' && els.length) return { dom: Object.fromEntries(els.map((e) => [e, 1])) };
  if (it.vita) return { pv: 6 };
  if (els.length) return { dom: Object.fromEntries(els.map((e) => [e, 1])) };
  return { armure: 1 };
}

/** 4 pièces d'emplacements distincts, en privilégiant celles qui portent un élément de la panoplie. */
function pickPieces(set: (typeof SETS)[number]): DofusItem[] {
  const all = DOFUS.sets[String(set.dofusId)].items.map(dofusItem).filter((it) => it.slot);
  const ranked = [...all].sort((a, b) => pieceElements(b, set.family).length - pieceElements(a, set.family).length);
  const chosen: DofusItem[] = [];
  for (const it of ranked) {
    if (chosen.length === 4) break;
    if (!chosen.some((c) => c.slot === it.slot)) chosen.push(it);
  }
  return chosen;
}

export const PANOPLIES: PanoplieDef[] = [];
export const COMMON_ITEMS: ItemDef[] = [];

for (const set of SETS) {
  const pieces = pickPieces(set);
  PANOPLIES.push({ id: set.id, name: DOFUS.sets[String(set.dofusId)].n, kind: set.family.kind, items: pieces.map((p) => `item_${p.id}`), bonuses: bonuses(set.family) });
  for (const p of pieces) {
    const els = pieceElements(p, set.family);
    COMMON_ITEMS.push({
      id: `item_${p.id}`, name: p.n, slot: p.slot as Slot, rarity: 'commun', elements: els,
      stats: pieceStats(p, els, set.family), panoplie: set.id, dofusId: p.id, icon: itemIcon(p.icon), level: p.l,
    });
  }
}

/** Items rares (élites, events) : objets Dofus réels, stats renforcées, actif une fois par combat. */
function rare(dofusId: number, stats: Stats, active: ActiveDef): ItemDef {
  const it = dofusItem(dofusId);
  return {
    id: `item_${dofusId}`, name: it.n, slot: it.slot as Slot, rarity: 'rare', elements: it.els, stats, active,
    dofusId, icon: itemIcon(it.icon), level: it.l,
  };
}

export const RARE_ITEMS: ItemDef[] = [
  rare(2438, { dom: { terre: 1, feu: 1 } },
    { name: 'Cri royal', target: 'self', effects: [{ type: 'status', status: 'puissance', amount: 2, on: 'self' }] }),
  rare(2445, { dom: { terre: 2 } },
    { name: 'Carapace', target: 'self', effects: [{ type: 'block', amount: 12 }] }),
  rare(1662, { dom: { eau: 1, feu: 1 } },
    { name: 'Embrasement', target: 'all_enemies', effects: [{ type: 'status', status: 'brulure', amount: 4, on: 'all_enemies' }] }),
  rare(2441, { pv: 10 },
    { name: 'Régénération', target: 'self', effects: [{ type: 'heal', amount: 8 }] }),
  rare(17506, { dom: { air: 2 } },
    { name: 'Envol', target: 'self', effects: [{ type: 'draw', amount: 2 }, { type: 'block', amount: 4 }] }),
  rare(2442, { prisme: 1 },
    { name: 'Élan', target: 'self', effects: [{ type: 'energy', amount: 1 }] }),
];

export const ITEMS: ItemLibrary = {
  items: Object.fromEntries([...COMMON_ITEMS, ...RARE_ITEMS].map((i) => [i.id, i])),
  panoplies: Object.fromEntries(PANOPLIES.map((p) => [p.id, p])),
};
