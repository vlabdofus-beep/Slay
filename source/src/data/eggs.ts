// Les Dofus : récompenses des boss des actes 1 et 2 (un parmi trois). Effets puissants et fixes,
// écrits à la main d'après l'esprit du Dofus dans le jeu (Ocre = PA, Pourpre = dommages, Ivoire = résistances…).
// Icônes : les quatre primordiaux viennent de Dofus Survivors, les autres en sont des variantes recolorées.
import type { EffectPart, ItemEffect, RuleId } from '../core/effects.ts';
import type { Stats } from '../core/types.ts';

export interface EggDef {
  id: string;
  name: string;
  icon: string;
  stats?: Stats;
  effects: ItemEffect[];
}

const roll = (...parts: EffectPart[]): ItemEffect => ({ kind: 'roll', parts });
const p = (trigger: string, reward: string, amount: number): EffectPart => ({ trigger, reward, amount });
const rule = (r: RuleId): ItemEffect => ({ kind: 'rule', rule: r });

export const EGGS: EggDef[] = [
  { id: 'emeraude', name: 'Dofus Émeraude', icon: 'emeraude', stats: { pv: 18 }, effects: [roll(p('victoire', 'soin', 6))] },
  { id: 'pourpre', name: 'Dofus Pourpre', icon: 'pourpre', effects: [roll(p('debut_combat', 'puissance', 2))] },
  { id: 'turquoise', name: 'Dofus Turquoise', icon: 'turquoise', effects: [roll(p('toutes_3_cartes', 'degats', 6))] },
  { id: 'ocre', name: 'Dofus Ocre', icon: 'ocre', effects: [rule('ocre')] },
  { id: 'ivoire', name: 'Dofus Ivoire', icon: 'ivoire', effects: [rule('ivoire')] },
  { id: 'ebene', name: 'Dofus Ébène', icon: 'ebene', effects: [roll(p('debut_tour', 'poison_zone', 2))] },
  { id: 'cawotte', name: 'Dofus Cawotte', icon: 'cawotte', effects: [roll(p('debut_combat', 'esquive', 1)), roll(p('tous_3_tours', 'esquive', 1))] },
  { id: 'vulbis', name: 'Dofus Vulbis', icon: 'vulbis', effects: [rule('pioche_plus')] },
  { id: 'dokoko', name: 'Dokoko', icon: 'dokoko', effects: [rule('resurrection')] },
  { id: 'cauchemar', name: 'Dofus Cauchemar', icon: 'cauchemar', effects: [rule('cauchemar')] },
  { id: 'abyssal', name: 'Dofus Abyssal', icon: 'abyssal', effects: [roll(p('debut_combat', 'bouclier', 12))] },
  { id: 'domakuro', name: 'Domakuro', icon: 'domakuro', effects: [roll(p('pv_perdus', 'renvoi', 2))] },
  { id: 'glaces', name: 'Dofus des Glaces', icon: 'glaces', effects: [roll(p('debut_combat', 'etourdi', 1))] },
  { id: 'tachete', name: 'Dofus Tacheté', icon: 'tachete', effects: [roll(p('premier_tour', 'pioche', 2), p('premier_tour', 'pa', 1))] },
  { id: 'sylvestre', name: 'Dofus Sylvestre', icon: 'sylvestre', effects: [roll(p('debut_tour', 'soin', 2))] },
  { id: 'nebuleux', name: 'Dofus Nébuleux', icon: 'nebuleux', stats: { prospection: 60 }, effects: [roll(p('victoire', 'prospection_run', 8))] },
  { id: 'forgelave', name: 'Dofus Forgelave', icon: 'forgelave', effects: [roll(p('carte_feu', 'brulure_zone', 1))] },
  { id: 'dolmanax', name: 'Dolmanax', icon: 'dolmanax', effects: [roll(p('gratuite', 'degats', 3))] },
];

export const EGG_BY_ID: Record<string, EggDef> = Object.fromEntries(EGGS.map((e) => [e.id, e]));
