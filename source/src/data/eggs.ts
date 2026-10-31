// Les Dofus : récompenses des boss des actes 1 et 2 (un parmi trois). Effets puissants et fixes,
// écrits à la main d'après l'esprit du Dofus dans le jeu (Ocre = PA, Pourpre = dommages, Ivoire = résistances…).
// Visuel : l'icône officielle de l'objet dans Dofus 3 (iconId, relevé dans les données du client publiées par
// dofusdude/dofus3-main), servie par DofusDB comme les autres objets. L'icône locale `icon` sert de repli hors ligne.
import { itemIcon } from './dofus.ts';
import type { EffectPart, ItemEffect, RuleId } from '../core/effects.ts';
import type { Stats } from '../core/types.ts';

export interface EggDef {
  id: string;
  name: string;
  icon: string;
  /** Icône de l'objet dans Dofus (identifiant d'image). */
  iconId: number;
  stats?: Stats;
  effects: ItemEffect[];
}

const roll = (...parts: EffectPart[]): ItemEffect => ({ kind: 'roll', parts });
const p = (trigger: string, reward: string, amount: number): EffectPart => ({ trigger, reward, amount });
const rule = (r: RuleId): ItemEffect => ({ kind: 'rule', rule: r });

export const EGGS: EggDef[] = [
  { id: 'emeraude', name: 'Dofus Émeraude', icon: 'emeraude', iconId: 23002, stats: { pv: 18 }, effects: [roll(p('victoire', 'soin', 6))] },
  { id: 'pourpre', name: 'Dofus Pourpre', icon: 'pourpre', iconId: 23001, effects: [roll(p('debut_combat', 'puissance', 2))] },
  { id: 'turquoise', name: 'Dofus Turquoise', icon: 'turquoise', iconId: 23003, effects: [roll(p('toutes_3_cartes', 'degats', 6))] },
  { id: 'ocre', name: 'Dofus Ocre', icon: 'ocre', iconId: 23012, effects: [rule('ocre')] },
  { id: 'ivoire', name: 'Dofus Ivoire', icon: 'ivoire', iconId: 23011, effects: [rule('ivoire')] },
  { id: 'ebene', name: 'Dofus Ébène', icon: 'ebene', iconId: 23007, effects: [roll(p('debut_tour', 'poison_zone', 2))] },
  { id: 'cawotte', name: 'Dofus Cawotte', icon: 'cawotte', iconId: 23006, effects: [roll(p('debut_combat', 'esquive', 1)), roll(p('tous_3_tours', 'esquive', 1))] },
  { id: 'vulbis', name: 'Dofus Vulbis', icon: 'vulbis', iconId: 23004, effects: [rule('pioche_plus')] },
  { id: 'dokoko', name: 'Dokoko', icon: 'dokoko', iconId: 23022, effects: [rule('resurrection')] },
  { id: 'cauchemar', name: 'Dofus Cauchemar', icon: 'cauchemar', iconId: 23034, effects: [rule('cauchemar')] },
  { id: 'abyssal', name: 'Dofus Abyssal', icon: 'abyssal', iconId: 23023, effects: [roll(p('debut_combat', 'bouclier', 12))] },
  { id: 'domakuro', name: 'Domakuro', icon: 'domakuro', iconId: 23032, effects: [roll(p('pv_perdus', 'renvoi', 2))] },
  { id: 'glaces', name: 'Dofus des Glaces', icon: 'glaces', iconId: 23005, effects: [roll(p('debut_combat', 'etourdi', 1))] },
  { id: 'tachete', name: 'Dofus Tacheté', icon: 'tachete', iconId: 23008, effects: [roll(p('premier_tour', 'pioche', 2), p('premier_tour', 'pa', 1))] },
  { id: 'sylvestre', name: 'Dofus Sylvestre', icon: 'sylvestre', iconId: 23036, effects: [roll(p('debut_tour', 'soin', 2))] },
  { id: 'nebuleux', name: 'Dofus Nébuleux', icon: 'nebuleux', iconId: 23016, stats: { prospection: 60 }, effects: [roll(p('victoire', 'prospection_run', 8))] },
  { id: 'forgelave', name: 'Dofus Forgelave', icon: 'forgelave', iconId: 23024, effects: [roll(p('carte_feu', 'brulure_zone', 1))] },
  { id: 'dolmanax', name: 'Dolmanax', icon: 'dolmanax', iconId: 23018, effects: [roll(p('gratuite', 'degats', 3))] },
];

export const EGG_BY_ID: Record<string, EggDef> = Object.fromEntries(EGGS.map((e) => [e.id, e]));

/** Adresse de l'icône officielle d'un Dofus. */
export const eggImage = (e: EggDef) => itemIcon(e.iconId);
