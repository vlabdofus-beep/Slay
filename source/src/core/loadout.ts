// Calcul de ce que l'équipement et le deck donnent au joueur :
// stats (items + bonus de panoplie), affinité par élément, paliers et effets secondaires.
import { resolveCard } from './combat.ts';
import type {
  ActiveDef,
  CardInstance,
  Element,
  ItemDef,
  Library,
  PanoplieDef,
  Passives,
  Slot,
  Stats,
} from './types.ts';
import { ELEMENTS } from './types.ts';

export interface ItemLibrary {
  items: Record<string, ItemDef>;
  panoplies: Record<string, PanoplieDef>;
}

/** Un item par emplacement (id d'item). */
export type Equipment = Partial<Record<Slot, string>>;

export type ElementalElement = Exclude<Element, 'neutre'>;
export type Affinity = Record<ElementalElement, number>;

/** Seuils d'affinité (cartes + items de l'élément) pour les paliers 1, 2 et 3. */
export const PALIERS = [4, 8, 12] as const;

/** Valeur de l'effet secondaire selon le palier (index 0 = aucun palier). */
export const PASSIVE_BY_PALIER: Record<ElementalElement, readonly number[]> = {
  terre: [0, 2, 4, 6], // armure par carte Terre jouée
  feu: [0, 1, 2, 3], // brûlure par cible touchée par une attaque Feu
  eau: [0, 1, 2, 3], // soin par attaque Eau
  air: [0, 1, 2, 3], // nombre de cartes Air par tour qui piochent 1
};

export function palierOf(points: number): number {
  return PALIERS.filter((t) => points >= t).length;
}

export function equippedItems(equipment: Equipment, items: ItemLibrary): ItemDef[] {
  return Object.values(equipment)
    .filter((id): id is string => !!id)
    .map((id) => {
      const it = items.items[id];
      if (!it) throw new Error(`Item inconnu : ${id}`);
      return it;
    });
}

export function affinity(
  cards: Library,
  deck: CardInstance[],
  equipment: Equipment,
  items: ItemLibrary,
): Affinity {
  const a: Affinity = { terre: 0, feu: 0, eau: 0, air: 0 };
  for (const inst of deck) {
    const el = resolveCard(cards, inst).element;
    if (el !== 'neutre') a[el]++;
  }
  for (const it of equippedItems(equipment, items)) {
    for (const el of it.elements) if (el !== 'neutre') a[el]++;
  }
  return a;
}

/** Nombre de pièces équipées par panoplie. */
export function setCounts(equipment: Equipment, items: ItemLibrary): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of equippedItems(equipment, items)) {
    if (it.panoplie) counts[it.panoplie] = (counts[it.panoplie] ?? 0) + 1;
  }
  return counts;
}

function addStats(total: Required<Omit<Stats, 'dom'>> & { dom: Record<Element, number> }, s: Stats): void {
  total.pv += s.pv ?? 0;
  total.armure += s.armure ?? 0;
  total.prisme += s.prisme ?? 0;
  for (const [el, v] of Object.entries(s.dom ?? {})) total.dom[el as Element] += v ?? 0;
}

export interface Loadout {
  pvBonus: number;
  dom: Record<Element, number>;
  blockBonus: number;
  passives: Passives;
  actives: ActiveDef[];
  affinity: Affinity;
  paliers: Record<ElementalElement, number>;
  sets: Record<string, number>;
}

export function computeLoadout(
  cards: Library,
  deck: CardInstance[],
  equipment: Equipment,
  items: ItemLibrary,
): Loadout {
  const total = { pv: 0, armure: 0, prisme: 0, dom: { terre: 0, feu: 0, eau: 0, air: 0, neutre: 0 } };
  const equipped = equippedItems(equipment, items);
  for (const it of equipped) addStats(total, it.stats);

  const sets = setCounts(equipment, items);
  for (const [setId, n] of Object.entries(sets)) {
    const set = items.panoplies[setId];
    if (!set) continue;
    for (const [threshold, bonus] of Object.entries(set.bonuses)) {
      if (n >= Number(threshold)) addStats(total, bonus);
    }
  }

  const aff = affinity(cards, deck, equipment, items);
  const paliers = {
    terre: palierOf(aff.terre),
    feu: palierOf(aff.feu),
    eau: palierOf(aff.eau),
    air: palierOf(aff.air),
  };

  return {
    pvBonus: total.pv,
    dom: total.dom,
    blockBonus: total.armure,
    passives: {
      terreArmure: PASSIVE_BY_PALIER.terre[paliers.terre],
      feuBrulure: PASSIVE_BY_PALIER.feu[paliers.feu],
      eauSoin: PASSIVE_BY_PALIER.eau[paliers.eau],
      airPioche: PASSIVE_BY_PALIER.air[paliers.air],
      prisme: total.prisme,
    },
    actives: equipped.filter((it) => it.active).map((it) => it.active as ActiveDef),
    affinity: aff,
    paliers,
    sets,
  };
}

/** Éléments triés par affinité décroissante. */
export function rankedElements(a: Affinity): ElementalElement[] {
  return (ELEMENTS as ElementalElement[]).slice().sort((x, y) => a[y] - a[x]);
}
