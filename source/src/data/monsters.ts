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
/** Réglage fin de chaque acte (les valeurs des monstres des actes 2 et 3 sont écrites à leur échelle). */
export const ACT_SCALE: Record<1 | 2 | 3, MonsterScale> = {
  1: ACT1_SCALE,
  2: { hp: 0.92, damage: 0.92 },
  3: { hp: 0.76, damage: 0.8 },
};

const hit = (amount: number, element: Element, hits?: number): Effect =>
  hits ? { type: 'damage', amount, element, hits } : { type: 'damage', amount, element };
const block = (amount: number): Effect => ({ type: 'block', amount });
const buff = (amount: number): Effect => ({ type: 'status', status: 'puissance', amount, on: 'self' });
const debuff = (status: 'faiblesse' | 'vulnerabilite' | 'brulure' | 'poison' | 'erosion', amount: number): Effect =>
  ({ type: 'status', status, amount, on: 'target' });
const heal = (amount: number): Effect => ({ type: 'heal', amount });
const drain = (amount: number, element: Element): Effect => ({ type: 'drain', amount, element });

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

  // ═════════ Acte 2 : forêt des Abraknydes, plaines de Cania, marais (PV ≈ ×1,7, coups ≈ ×1,5) ═════════
  fromDofus('abraknyde', 47, [44, 50], {
    branche: { name: 'Coup de branche', effects: [hit(12, 'terre')] },
    ecorce: { name: 'Écorce', effects: [block(12), buff(1)] },
  }, cycle('branche', 'branche', 'ecorce')),
  fromDofus('tronknyde', 256, [36, 40], {
    racines: { name: 'Racines', effects: [hit(6, 'terre'), debuff('faiblesse', 1)] },
    seve: { name: 'Sève', effects: [heal(8), block(4)] },
  }, random({ racines: 65, seve: 35 })),
  fromDofus('arakne_majeure', 259, [30, 34], {
    morsure: { name: 'Morsure', effects: [hit(9, 'neutre')] },
    toile: { name: 'Toile collante', effects: [debuff('faiblesse', 2), debuff('vulnerabilite', 1)] },
  }, random({ morsure: 65, toile: 35 })),
  fromDofus('chafer', 54, [32, 36], {
    coup: { name: 'Coup d\'os', effects: [hit(11, 'neutre')] },
    os: { name: 'Bouclier d\'os', effects: [block(9)] },
  }, cycle('coup', 'os', 'coup')),
  fromDofus('chafer_archer', 291, [26, 30], {
    fleche: { name: 'Flèche', effects: [hit(5, 'air', 2)] },
    visee: { name: 'Visée', effects: [buff(2)] },
  }, cycle('fleche', 'visee', 'fleche')),
  fromDofus('kwak_flamme', 83, [30, 34], {
    flamme: { name: 'Flammèche', effects: [hit(7, 'feu'), debuff('brulure', 2)] },
    plumage: { name: 'Plumage', effects: [block(8)] },
  }, cycle('flamme', 'plumage')),
  fromDofus('kwak_glace', 84, [30, 34], {
    glace: { name: 'Éclat de glace', effects: [hit(9, 'eau'), debuff('faiblesse', 1)] },
    plumage: { name: 'Plumage', effects: [block(8)] },
  }, cycle('glace', 'plumage')),
  fromDofus('wabbit', 64, [28, 32], {
    carottes: { name: 'Lancer de carottes', effects: [hit(4, 'terre', 3)] },
    bond: { name: 'Bond', effects: [block(6), buff(1)] },
  }, random({ carottes: 60, bond: 40 })),
  fromDofus('bwork', 876, [46, 52], {
    rage: { name: 'Rage bwork', effects: [buff(3)] },
    massue: { name: 'Coup de massue', effects: [hit(14, 'terre')] },
  }, cycle('rage', 'massue', 'massue')),
  fromDofus('bwork_mage', 53, [34, 38], {
    boule: { name: 'Boule de feu', effects: [hit(10, 'feu'), debuff('brulure', 2)] },
    barriere: { name: 'Barrière', effects: [block(10)] },
  }, cycle('boule', 'barriere')),
  fromDofus('craqueleur', 106, [56, 62], {
    carapace: { name: 'Carapace', effects: [block(14)] },
    poing: { name: 'Poing de pierre', effects: [hit(16, 'terre')] },
  }, cycle('carapace', 'poing')),
  fromDofus('scarafeuille_bleu', 198, [30, 34], {
    mandibules: { name: 'Mandibules', effects: [hit(5, 'eau', 2)] },
    carapace: { name: 'Carapace', effects: [block(10)] },
  }, random({ mandibules: 65, carapace: 35 })),
  fromDofus('crocodaille', 261, [44, 48], {
    machoires: { name: 'Mâchoires', effects: [hit(13, 'eau')] },
    vase: { name: 'Coup de vase', effects: [hit(5, 'eau'), debuff('vulnerabilite', 2)] },
  }, cycle('vase', 'machoires')),
  fromDofus('kanniboul_ark', 211, [40, 44], {
    lance: { name: 'Lance', effects: [hit(6, 'air', 2)] },
    transe: { name: 'Transe', effects: [buff(2), block(6)] },
  }, cycle('lance', 'transe', 'lance')),
  // élites
  fromDofus('abraknyde_sombre', 253, [130, 140], {
    ecorce: { name: 'Écorce sombre', effects: [block(16), buff(2)] },
    branches: { name: 'Branches', effects: [hit(9, 'terre', 2)] },
    seve: { name: 'Sève vampirique', effects: [drain(12, 'eau')] },
  }, cycle('ecorce', 'branches', 'seve')),
  fromDofus('craqueleur_legendaire', 669, [150, 160], {
    carapace: { name: 'Carapace légendaire', effects: [block(20), buff(2)] },
    seisme: { name: 'Séisme', effects: [hit(22, 'terre')] },
    eboulis: { name: 'Éboulis', effects: [hit(7, 'terre', 3)] },
  }, cycle('carapace', 'seisme', 'eboulis')),
  fromDofus('wa_wabbit', 180, [120, 130], {
    carottes: { name: 'Pluie de carottes', effects: [hit(5, 'terre', 4)] },
    ordre: { name: 'Ordre royal', effects: [buff(3), block(10)] },
    coup: { name: 'Coup de sceptre', effects: [hit(18, 'neutre')] },
  }, cycle('carottes', 'ordre', 'coup')),
  fromDofus('bworkette', 792, [125, 135], {
    fouet: { name: 'Fouet ardent', effects: [hit(10, 'feu'), debuff('brulure', 3)] },
    cri: { name: 'Cri strident', effects: [debuff('faiblesse', 2), debuff('vulnerabilite', 2)] },
    massue: { name: 'Massue', effects: [hit(20, 'terre')] },
  }, cycle('fouet', 'cri', 'massue')),
  // boss
  fromDofus('abraknyde_ancestral', 173, [320, 330], {
    racines: { name: 'Racines ancestrales', effects: [hit(10, 'terre', 2), debuff('faiblesse', 1)] },
    foret: { name: 'Appel de la forêt', effects: [block(25), buff(3)] },
    colere: { name: 'Colère millénaire', effects: [hit(30, 'terre')] },
    seve: { name: 'Sève ancienne', effects: [heal(15), debuff('vulnerabilite', 2)] },
  }, cycle('racines', 'foret', 'colere', 'seve')),

  // ═════════ Acte 3 : landes de Brâkmar, Frigost, côtes (PV ≈ ×2,6, coups ≈ ×2) ═════════
  fromDofus('kolerat', 300, [52, 58], {
    griffes: { name: 'Griffes', effects: [hit(8, 'air', 2)] },
    cri: { name: 'Cri', effects: [buff(2)] },
  }, random({ griffes: 65, cri: 35 })),
  fromDofus('croc_gland', 299, [56, 62], {
    morsure: { name: 'Morsure', effects: [hit(16, 'terre')] },
    ecorce: { name: 'Écorce', effects: [block(14)] },
  }, cycle('morsure', 'ecorce')),
  fromDofus('rat_egoutant', 442, [40, 46], {
    morsure: { name: 'Morsure infectée', effects: [hit(10, 'eau'), debuff('poison', 3)] },
    fuite: { name: 'Fuite', effects: [block(10)] },
  }, random({ morsure: 65, fuite: 35 })),
  fromDofus('craqueboule', 483, [64, 70], {
    roulade: { name: 'Roulade', effects: [hit(20, 'neutre')] },
    carapace: { name: 'Carapace', effects: [block(18)] },
  }, cycle('carapace', 'roulade')),
  fromDofus('kanigrou', 287, [54, 60], {
    crocs: { name: 'Crocs', effects: [hit(9, 'feu', 2)] },
    hurlement: { name: 'Hurlement', effects: [buff(3), debuff('faiblesse', 1)] },
  }, cycle('crocs', 'hurlement', 'crocs')),
  fromDofus('piralak', 784, [58, 64], {
    morsure: { name: 'Morsure', effects: [hit(18, 'eau')] },
    frenesie: { name: 'Frénésie', effects: [hit(6, 'eau', 2), buff(1)] },
  }, random({ morsure: 55, frenesie: 45 })),
  fromDofus('corbac', 281, [50, 56], {
    bec: { name: 'Coups de bec', effects: [hit(7, 'air', 3)] },
    plumes: { name: 'Plumes', effects: [block(12)] },
  }, cycle('bec', 'plumes')),
  fromDofus('mulou', 102, [70, 76], {
    griffes: { name: 'Griffes', effects: [hit(22, 'neutre')] },
    hurlement: { name: 'Hurlement', effects: [debuff('vulnerabilite', 2), buff(2)] },
  }, cycle('hurlement', 'griffes', 'griffes')),
  fromDofus('fecorce', 1075, [76, 82], {
    branches: { name: 'Branches gelées', effects: [hit(12, 'eau', 2)] },
    ecorce: { name: 'Écorce de givre', effects: [block(20)] },
  }, cycle('branches', 'ecorce')),
  fromDofus('poolay', 1043, [60, 66], {
    coups: { name: 'Coups de bec brûlants', effects: [hit(14, 'feu'), debuff('brulure', 3)] },
    ponte: { name: 'Ponte', effects: [heal(12), block(10)] },
  }, cycle('coups', 'coups', 'ponte')),
  fromDofus('kaskargo', 1044, [80, 88], {
    coquille: { name: 'Coquille', effects: [block(24)] },
    bave: { name: 'Bave corrosive', effects: [hit(18, 'eau'), debuff('erosion', 2)] },
  }, cycle('coquille', 'bave')),
  // élites
  fromDofus('maitre_corbac', 289, [210, 224], {
    nuee: { name: 'Nuée', effects: [hit(8, 'air', 4)] },
    ordre: { name: 'Ordre du Maître', effects: [buff(4), block(16)] },
    bec: { name: 'Bec d\'acier', effects: [hit(30, 'air')] },
  }, cycle('nuee', 'ordre', 'bec')),
  fromDofus('dragon_cochon', 113, [240, 256], {
    souffle: { name: 'Souffle ardent', effects: [hit(18, 'feu'), debuff('brulure', 4)] },
    groin: { name: 'Groin cuirassé', effects: [block(24), buff(3)] },
    charge: { name: 'Charge porcine', effects: [hit(34, 'terre')] },
  }, cycle('souffle', 'groin', 'charge')),
  fromDofus('koulosse', 670, [250, 265], {
    carapace: { name: 'Carapace', effects: [block(30)] },
    poing: { name: 'Poing colossal', effects: [hit(36, 'terre')] },
    seisme: { name: 'Séisme', effects: [hit(12, 'terre', 3)] },
  }, cycle('carapace', 'poing', 'seisme')),
  // boss
  fromDofus('minotoror', 121, [470, 490], {
    rage: { name: 'Rage du labyrinthe', effects: [buff(5), block(30)] },
    corne: { name: 'Coups de corne', effects: [hit(14, 'terre', 3)] },
    charge: { name: 'Charge', effects: [hit(40, 'terre')] },
    labyrinthe: { name: 'Labyrinthe', effects: [hit(12, 'terre'), debuff('faiblesse', 2), debuff('vulnerabilite', 2)] },
  }, cycle('rage', 'corne', 'charge', 'labyrinthe')),
];
const BOSSES = ['bouftou_royal', 'abraknyde_ancestral', 'minotoror'];
for (const m of MONSTERS) if (BOSSES.includes(m.id)) m.boss = true;

export type EncounterTier = 'faible' | 'normal' | 'elite' | 'boss';
export type Act = 1 | 2 | 3;
export const ACTS: { act: Act; name: string; boss: string }[] = [
  { act: 1, name: 'Amakna', boss: 'Bouftou Royal' },
  { act: 2, name: 'Forêt des Abraknydes', boss: 'Abraknyde Ancestral' },
  { act: 3, name: 'Landes de Brâkmar', boss: 'Minotoror' },
];

type Enc = { tier: EncounterTier; act: Act; monsters: string[] };
const enc = (act: Act, tier: EncounterTier, ...monsters: string[]): Enc => ({ act, tier, monsters });

/** Rencontres des trois actes. */
export const ENCOUNTERS: Record<string, Enc> = {
  // Acte 1 : Amakna
  bouftou_seul: enc(1, 'faible', 'bouftou'),
  tofus: enc(1, 'faible', 'tofu', 'tofu'),
  larve_moskito: enc(1, 'faible', 'larve_bleue', 'moskito'),
  arakne_moskito: enc(1, 'faible', 'arakne', 'moskito'),
  rose_seule: enc(1, 'faible', 'rose_demoniaque', 'moskito'),
  bouftous: enc(1, 'normal', 'bouftou', 'boufton_noir'),
  champs: enc(1, 'normal', 'pissenlit', 'rose_demoniaque'),
  foret: enc(1, 'normal', 'arakne', 'larve_bleue', 'moskito'),
  prespic_tofus: enc(1, 'normal', 'prespic', 'tofu', 'tofu'),
  lisiere: enc(1, 'normal', 'sanglier', 'champ_champ'),
  chef_guerre: enc(1, 'elite', 'chef_guerre_bouftou'),
  tournesol: enc(1, 'elite', 'tournesol_affame'),
  bouftou_royal: enc(1, 'boss', 'bouftou_royal'),
  // Acte 2 : forêt des Abraknydes
  chafers: enc(2, 'faible', 'chafer', 'chafer_archer'),
  wabbits: enc(2, 'faible', 'wabbit', 'wabbit'),
  kwaks: enc(2, 'faible', 'kwak_flamme', 'kwak_glace'),
  sous_bois: enc(2, 'faible', 'tronknyde', 'arakne_majeure'),
  abraknydes: enc(2, 'normal', 'abraknyde', 'tronknyde', 'arakne_majeure'),
  bworks: enc(2, 'normal', 'bwork', 'bwork_mage'),
  craqueleurs: enc(2, 'normal', 'craqueleur', 'scarafeuille_bleu'),
  marais: enc(2, 'normal', 'crocodaille', 'kanniboul_ark'),
  clairiere: enc(2, 'normal', 'abraknyde', 'kwak_flamme', 'chafer_archer'),
  abraknyde_sombre: enc(2, 'elite', 'abraknyde_sombre'),
  craqueleur_legendaire: enc(2, 'elite', 'craqueleur_legendaire'),
  wa_wabbit: enc(2, 'elite', 'wa_wabbit'),
  bworkette: enc(2, 'elite', 'bworkette'),
  abraknyde_ancestral: enc(2, 'boss', 'abraknyde_ancestral'),
  // Acte 3 : landes de Brâkmar
  egouts: enc(3, 'faible', 'rat_egoutant', 'rat_egoutant'),
  kolerats: enc(3, 'faible', 'kolerat', 'croc_gland'),
  kanigrous: enc(3, 'faible', 'kanigrou', 'kolerat'),
  craqueboules: enc(3, 'faible', 'craqueboule', 'rat_egoutant'),
  corbacs: enc(3, 'normal', 'corbac', 'corbac', 'kolerat'),
  mulous: enc(3, 'normal', 'mulou', 'kanigrou'),
  piralaks: enc(3, 'normal', 'piralak', 'piralak', 'rat_egoutant'),
  frigost: enc(3, 'normal', 'fecorce', 'poolay'),
  kaskargo: enc(3, 'normal', 'kaskargo', 'craqueboule'),
  maitre_corbac: enc(3, 'elite', 'maitre_corbac'),
  dragon_cochon: enc(3, 'elite', 'dragon_cochon'),
  koulosse: enc(3, 'elite', 'koulosse'),
  minotoror: enc(3, 'boss', 'minotoror'),
};

export function encountersOfTier(tier: EncounterTier, act: Act = 1): string[] {
  return Object.keys(ENCOUNTERS).filter((id) => ENCOUNTERS[id].tier === tier && ENCOUNTERS[id].act === act);
}
