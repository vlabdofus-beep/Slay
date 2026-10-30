import type { MonsterScale } from '../core/combat.ts';
import type { Effect, Element, MonsterDef, MonsterMove, MovePattern } from '../core/types.ts';
import { monster, monsterImage, weakResist } from './dofus.ts';

// Monstres reliés aux vrais monstres Dofus (src/data/dofus.json) : NOM, NIVEAU, IMAGE et
// FAIBLESSES / RÉSISTANCES (dérivées des résistances Dofus, voir weakResist) viennent de Dofus.
// PV et attaques sont les nôtres, calés sur l'acte 1 de StS2 (docs/BALANCE.md) :
//   rencontre faible ≈ 30-45 PV, normale ≈ 50-75, élite ≈ 75-85, boss ≈ 200.

/** Coefficient de difficulté de l'acte 1 : 0,75 sans items → 0,9 avec items → 1 avec le vrai contenu Dofus.
 *  Les monstres sont donc aux valeurs StS2. Voir docs/BALANCE.md. */
export const ACT1_SCALE: MonsterScale = { hp: 1, damage: 1 };

const hit = (amount: number, element: Element, hits?: number): Effect =>
  hits ? { type: 'damage', amount, element, hits } : { type: 'damage', amount, element };
const block = (amount: number): Effect => ({ type: 'block', amount });
const buff = (amount: number): Effect => ({ type: 'status', status: 'puissance', amount, on: 'self' });
const debuff = (status: 'faiblesse' | 'vulnerabilite' | 'brulure', amount: number): Effect =>
  ({ type: 'status', status, amount, on: 'target' });

function fromDofus(id: string, dofusId: number, hp: [number, number], moves: Record<string, MonsterMove>, pattern: MovePattern): MonsterDef {
  const m = monster(dofusId);
  const { weak, resist } = weakResist(m.res);
  return { id, name: m.n, hp, weak, resist, moves, pattern, dofusId, image: monsterImage(m.gfx), level: m.l };
}

const cycle = (...order: string[]): MovePattern => ({ kind: 'cycle', order });
const random = (weights: Record<string, number>, maxRepeat = 2): MovePattern => ({ kind: 'random', weights, maxRepeat });

export const MONSTERS: MonsterDef[] = [
  // ── Monstres d'Amakna ──
  fromDofus('larve_bleue', 31, [22, 26], {
    morsure: { name: 'Morsure', effects: [hit(8, 'eau')] },
    cocon: { name: 'Cocon', effects: [block(7), buff(1)] },
  }, cycle('morsure', 'cocon')),
  fromDofus('arakne', 52, [18, 22], {
    morsure: { name: 'Morsure', effects: [hit(6, 'neutre')] },
    toile: { name: 'Toile', effects: [debuff('faiblesse', 2)] },
  }, random({ morsure: 70, toile: 30 })),
  fromDofus('moskito', 61, [12, 15], {
    piqure: { name: 'Piqûre', effects: [hit(2, 'air', 3)] },
    aspiration: { name: 'Aspiration', effects: [{ type: 'drain', amount: 5, element: 'eau' }] },
  }, random({ piqure: 60, aspiration: 40 })),
  fromDofus('pissenlit', 79, [30, 34], {
    graines: { name: 'Pluie de graines', effects: [hit(4, 'air', 2)] },
    enracinement: { name: 'Enracinement', effects: [block(8), buff(2)] },
  }, cycle('graines', 'enracinement', 'graines')),
  fromDofus('champ_champ', 59, [26, 30], {
    spores: { name: 'Spores', effects: [hit(4, 'terre'), debuff('vulnerabilite', 1)] },
    coup: { name: 'Coup de chapeau', effects: [hit(9, 'terre')] },
  }, cycle('spores', 'coup')),
  fromDofus('rose_demoniaque', 78, [24, 28], {
    epines: { name: 'Épines', effects: [hit(5, 'feu'), debuff('brulure', 2)] },
    parfum: { name: 'Parfum envoûtant', effects: [debuff('faiblesse', 1), block(5)] },
  }, cycle('epines', 'parfum')),
  fromDofus('bouftou', 101, [28, 32], {
    charge: { name: 'Charge', effects: [hit(7, 'terre')] },
    beuglement: { name: 'Beuglement', effects: [buff(2), block(5)] },
  }, cycle('charge', 'charge', 'beuglement')),
  fromDofus('boufton_noir', 149, [22, 26], {
    morsure: { name: 'Morsure', effects: [hit(6, 'feu')] },
    belement: { name: 'Bêlement', effects: [block(4), buff(1)] },
  }, random({ morsure: 65, belement: 35 })),
  fromDofus('prespic', 103, [32, 36], {
    charge: { name: 'Charge épineuse', effects: [hit(10, 'terre')] },
    herisse: { name: 'Hérissement', effects: [block(10)] },
  }, cycle('charge', 'herisse')),
  fromDofus('sanglier', 104, [34, 38], {
    charge: { name: 'Charge', effects: [hit(11, 'terre')] },
    grognement: { name: 'Grognement', effects: [buff(2)] },
  }, cycle('grognement', 'charge', 'charge')),
  fromDofus('tofu', 98, [14, 18], {
    picorer: { name: 'Picorer', effects: [hit(3, 'air', 2)] },
    envol: { name: 'Envol', effects: [block(6)] },
  }, random({ picorer: 65, envol: 35 })),

  // ── Élites ──
  fromDofus('chef_guerre_bouftou', 148, [80, 86], {
    balayage: { name: 'Balayage', effects: [hit(6, 'terre', 2)] },
    cri: { name: 'Cri de guerre', effects: [buff(3)] },
    masse: { name: 'Coup de masse', effects: [hit(15, 'terre')] },
  }, cycle('balayage', 'cri', 'masse')),
  fromDofus('tournesol_affame', 799, [74, 80], {
    graines: { name: 'Mitraille de graines', effects: [hit(4, 'air', 3)] },
    photosynthese: { name: 'Photosynthèse', effects: [{ type: 'heal', amount: 8 }, block(8)] },
    petale: { name: 'Coup de pétale', effects: [hit(14, 'terre')] },
  }, cycle('graines', 'photosynthese', 'petale')),

  // ── Boss ──
  fromDofus('bouftou_royal', 147, [190, 200], {
    pietinement: { name: 'Piétinement', effects: [hit(8, 'terre', 2)] },
    appel_troupeau: { name: 'Appel du troupeau', effects: [buff(2), block(12)] },
    coup_de_tete: { name: 'Coup de tête', effects: [hit(16, 'terre')] },
  }, cycle('pietinement', 'appel_troupeau', 'coup_de_tete')),
];

export type EncounterTier = 'faible' | 'normal' | 'elite' | 'boss';

/** Rencontres de l'Acte 1 (Amakna). */
export const ENCOUNTERS: Record<string, { tier: EncounterTier; monsters: string[] }> = {
  bouftou_seul: { tier: 'faible', monsters: ['bouftou'] },
  tofus: { tier: 'faible', monsters: ['tofu', 'tofu'] },
  larve_moskito: { tier: 'faible', monsters: ['larve_bleue', 'moskito'] },
  arakne_moskito: { tier: 'faible', monsters: ['arakne', 'moskito'] },
  rose_seule: { tier: 'faible', monsters: ['rose_demoniaque', 'moskito'] },
  bouftous: { tier: 'normal', monsters: ['bouftou', 'boufton_noir'] },
  champs: { tier: 'normal', monsters: ['pissenlit', 'rose_demoniaque'] },
  foret: { tier: 'normal', monsters: ['arakne', 'larve_bleue', 'moskito'] },
  prespic_tofus: { tier: 'normal', monsters: ['prespic', 'tofu', 'tofu'] },
  lisiere: { tier: 'normal', monsters: ['sanglier', 'champ_champ'] },
  chef_guerre: { tier: 'elite', monsters: ['chef_guerre_bouftou'] },
  tournesol: { tier: 'elite', monsters: ['tournesol_affame'] },
  bouftou_royal: { tier: 'boss', monsters: ['bouftou_royal'] },
};

export function encountersOfTier(tier: EncounterTier): string[] {
  return Object.keys(ENCOUNTERS).filter((id) => ENCOUNTERS[id].tier === tier);
}
