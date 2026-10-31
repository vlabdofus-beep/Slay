import { capRes } from '../core/types.ts';
// Bestiaire étendu : trois fois plus de monstres par acte, avec des mécaniques propres (types.ts, MonsterPower).
// Repères Slay the Spire 2 pour les valeurs (PV, coups) et les mécaniques (division des Slimes, enroulement des Louses,
// Rituel du Cultiste, Nob qui s'enrage sur les compétences, Lagavulin endormi, Gremlin Leader qui invoque, Heart qui
// plafonne les dégâts…), adaptées à Dofus et complétées : voleurs de kamas qui s'enfuient, résistance caméléon,
// garde royale, cartes de statut thématiques (toile d'Arakne, bave de Gelée, braise).
// Les valeurs sont « brutes » : chaque rencontre est ensuite mise à l'échelle par acte et par salle (TIER_SCALE).
import type { Effect, Element, MonsterDef, MonsterMove, MonsterPower, MovePattern } from '../core/types.ts';
import type { Act, EncounterTier } from './monsters.ts';
import { monster, monsterImage } from './dofus.ts';

const hit = (amount: number, element: Element, hits?: number): Effect =>
  hits ? { type: 'damage', amount, element, hits } : { type: 'damage', amount, element };
const block = (amount: number): Effect => ({ type: 'block', amount });
const buff = (amount: number): Effect => ({ type: 'status', status: 'puissance', amount, on: 'self' });
const deb = (status: 'faiblesse' | 'vulnerabilite' | 'brulure' | 'poison' | 'erosion', amount: number): Effect =>
  ({ type: 'status', status, amount, on: 'target' });
const heal = (amount: number): Effect => ({ type: 'heal', amount });
const drain = (amount: number, element: Element): Effect => ({ type: 'drain', amount, element });
const summon = (m: string, count = 1): Effect => ({ type: 'summon', monster: m, count });
const card = (c: 'toile' | 'bave' | 'braise' | 'blessure', count = 1, pile: 'discard' | 'draw' | 'hand' = 'discard'): Effect =>
  ({ type: 'addCard', card: `statut_${c}`, count, pile });
const mv = (name: string, ...effects: Effect[]): MonsterMove => ({ name, effects });
const cycle = (...order: string[]): MovePattern => ({ kind: 'cycle', order });
const random = (weights: Record<string, number>, maxRepeat = 2): MovePattern => ({ kind: 'random', weights, maxRepeat });

function m(id: string, dofusId: number, hp: [number, number], moves: Record<string, MonsterMove>, pattern: MovePattern,
  powers?: MonsterPower[], extra: Partial<MonsterDef> = {}): MonsterDef {
  const d = monster(dofusId);
  return { id, name: d.n, hp, res: Object.fromEntries(Object.entries(d.res).map(([el, v]) => [el, capRes(v as number)])) as typeof d.res, moves, pattern, dofusId, image: monsterImage(d.gfx), level: d.l, powers, ...extra };
}

/** Petite version d'un monstre qui se divise (même illustration, pas de division). */
function small(base: MonsterDef, id: string, name: string, moves: Record<string, MonsterMove>, pattern: MovePattern): MonsterDef {
  return { ...base, id, name, moves, pattern, powers: undefined, splitInto: undefined, hp: [1, 1] };
}

// ═════════════════════════════ ACTE 1 : Amakna ═════════════════════════════

const piou = (id: string, dofusId: number, el: Element) => m(id, dofusId, [12, 15], {
  picoree: mv('Picorée', hit(3, el, 2)),
  appel: mv('Appel de la nuée', summon(id), block(3)),
}, random({ picoree: 85, appel: 15 }, 1));

const gelee = (id: string, dofusId: number, el: Element, petite: string) => m(id, dofusId, [40, 44], {
  engluer: mv('Engluer', hit(7, el), card('bave')),
  masse: mv('Masse gélatineuse', hit(11, el)),
}, cycle('engluer', 'masse'), [{ kind: 'division' }], { splitInto: petite });

const GELEES = [
  gelee('gelee_bleuet', 55, 'eau', 'gelee_bleuet_petite'),
  gelee('gelee_menthe', 56, 'air', 'gelee_menthe_petite'),
  gelee('gelee_fraise', 57, 'feu', 'gelee_fraise_petite'),
];
const PETITES = GELEES.map((g) => small(g, `${g.id}_petite`, `Petite ${g.name}`, {
  gifle: mv('Gifle collante', hit(5, g.moves.masse.effects[0].type === 'damage' ? g.moves.masse.effects[0].element : 'neutre')),
  bave: mv('Bave', card('bave')),
}, random({ gifle: 70, bave: 30 })));

export const ACT1_EXTRA: MonsterDef[] = [
  piou('piou_rouge', 489, 'feu'), piou('piou_bleu', 491, 'eau'), piou('piou_vert', 490, 'terre'),
  piou('piou_jaune', 493, 'air'), piou('piou_violet', 236, 'neutre'),
  ...GELEES, ...PETITES,
  m('larve_verte', 34, [18, 22], { morsure: mv('Morsure', hit(6, 'terre')), bave: mv('Crachat', hit(3, 'terre'), deb('faiblesse', 1)) },
    random({ morsure: 70, bave: 30 }), [{ kind: 'enroulement', n: 5 }]),
  m('larve_orange', 46, [18, 22], { morsure: mv('Morsure', hit(6, 'air')), bave: mv('Crachat', hit(3, 'air'), deb('vulnerabilite', 1)) },
    random({ morsure: 70, bave: 30 }), [{ kind: 'enroulement', n: 5 }]),
  m('champa_explosif', 1178, [20, 24], { gonfle: mv('Gonfle', block(4)) }, cycle('gonfle'), [{ kind: 'explosion', turns: 3, dmg: 18 }]),
  m('chafer_invisible', 110, [22, 26], { frappe: mv('Frappe sournoise', hit(9, 'neutre')), fondu: mv('Fondu', block(6)) },
    cycle('frappe', 'fondu'), [{ kind: 'esquive', n: 2 }]),
  m('chafer_furtif', 4047, [16, 20], { dague: mv('Dague', hit(4, 'air', 2)) }, cycle('dague'), [{ kind: 'esquive', n: 1 }]),
  m('chafer_debutant', 4046, [14, 18], { coup: mv('Coup d\'os', hit(6, 'neutre')), garde: mv('Garde', block(5)) }, random({ coup: 65, garde: 35 })),
  m('boufton_blanc', 134, [22, 26], { morsure: mv('Morsure', hit(6, 'terre')), belement: mv('Bêlement', block(5)) },
    random({ morsure: 65, belement: 35 }), [{ kind: 'colere', n: 1, every: 3 }]),
  m('milimulou', 159, [24, 28], { griffes: mv('Griffes', hit(7, 'neutre')), hurle: mv('Petit hurlement', buff(2)) },
    cycle('griffes', 'hurle', 'griffes'), [{ kind: 'colere', n: 1, every: 3 }]),
  m('scelerat_strubien', 465, [24, 28], { vol: mv('Vol à la tire', hit(5, 'air')), esquive: mv('Esquive', block(8)) },
    cycle('vol', 'vol', 'esquive'), [{ kind: 'voleur', n: 8, turns: 4 }]),
  m('milirat_strubien', 475, [20, 24], { morsure: mv('Morsure infectée', hit(4, 'eau'), deb('poison', 2)) }, cycle('morsure')),
  m('arakne_egouts', 255, [20, 24], { morsure: mv('Morsure', hit(6, 'neutre')), toile: mv('Toile', card('toile', 2, 'draw')) },
    cycle('toile', 'morsure', 'morsure')),
  m('boo', 112, [24, 28], { hantise: mv('Hantise', hit(5, 'terre'), deb('faiblesse', 1)), frisson: mv('Frisson', hit(8, 'terre')) },
    cycle('hantise', 'frisson')),
  m('citwouille', 207, [30, 34], { coup: mv('Coup de citrouille', hit(8, 'feu')) }, cycle('coup'), [{ kind: 'carapace', n: 3 }]),
  m('tofu_malefique', 111, [16, 20], { bec: mv('Bec maléfique', hit(4, 'air', 2)) }, cycle('bec'), [{ kind: 'rituel', n: 1 }]),
  m('tofu_noir', 796, [16, 20], { picorer: mv('Picorer', hit(3, 'air', 3)) }, cycle('picorer'), [{ kind: 'esquive', n: 1 }]),
  m('abraknyde_chetif', 4000, [30, 34], { branche: mv('Branche frêle', hit(7, 'terre')), ecorce: mv('Écorce', block(6)) },
    cycle('branche', 'ecorce'), [{ kind: 'carapace', n: 2 }]),
  m('gob_trotteur', 62, [26, 30], { coup: mv('Coup de bâton', hit(7, 'neutre')) }, cycle('coup'), [{ kind: 'voleur', n: 6, turns: 4 }]),
  m('ecurouille', 4823, [18, 22], { noisette: mv('Lancer de noisette', hit(5, 'air')) }, cycle('noisette'), [{ kind: 'voleur', n: 5, turns: 3 }, { kind: 'esquive', n: 1 }]),
  m('campagnoll', 4819, [10, 12], { morsure: mv('Morsure', hit(5, 'terre')) }, cycle('morsure')),
  // ── élites ──
  m('gardienne_champetre', 4821, [54, 58], {
    appel: mv('Appel des champs', summon('campagnoll', 1), block(6)),
    fauche: mv('Coup de faux', hit(12, 'air')),
    sermon: mv('Sermon', deb('faiblesse', 2), block(10)),
  }, cycle('appel', 'fauche', 'sermon', 'fauche'), [{ kind: 'gardien' }]),
  m('rose_obscure', 467, [70, 76], {
    epines: mv('Épines ardentes', hit(9, 'feu'), card('braise', 1)),
    parfum: mv('Parfum vénéneux', deb('poison', 4), deb('faiblesse', 1)),
    ronces: mv('Ronces', hit(5, 'feu', 2)),
  }, cycle('epines', 'parfum', 'ronces'), [{ kind: 'regeneration', n: 4 }, { kind: 'artefact', n: 2 }]),
  m('sergent_chafer', 4050, [52, 56], {
    ordre: mv('En rang !', summon('chafer_debutant', 2)),
    lance: mv('Coup de lance', hit(11, 'eau')),
    cri: mv('Cri de guerre', buff(2), block(8)),
  }, cycle('ordre', 'lance', 'cri', 'lance'), [{ kind: 'rituel', n: 1 }]),
  // ── boss ──
  m('shin_larve', 457, [180, 188], {
    ponte: mv('Ponte', summon('larve_verte'), summon('larve_orange'), block(10)),
    morsure: mv('Morsure géante', hit(15, 'terre')),
    cocon: mv('Cocon', block(20), buff(2)),
    crachat: mv('Crachat acide', hit(6, 'terre', 2), deb('vulnerabilite', 2)),
  }, cycle('morsure', 'ponte', 'crachat', 'cocon', 'morsure'), [{ kind: 'enroulement', n: 10 }],
  { boss: true, phase2: { at: 0.5, puissance: 2, name: 'Mue furieuse', pattern: cycle('morsure', 'crachat', 'ponte') } }),
  m('coffre_maudit', 1078, [186, 194], {
    claque: mv('Couvercle claquant', hit(13, 'neutre')),
    pieces: mv('Pluie de pièces', hit(4, 'neutre', 3)),
    verrou: mv('Verrou', block(18)),
  }, cycle('verrou', 'claque', 'pieces'), [{ kind: 'carapace', n: 4 }, { kind: 'voleur', n: 6, turns: 99 }],
  { boss: true, phase2: { at: 0.5, puissance: 2, name: 'Avidité', pattern: cycle('pieces', 'claque') } }),
];

// ═════════════════════════════ ACTE 2 : forêt des Abraknydes ═════════════════════════════

const blop = (id: string, dofusId: number, el: Element, child: string) => m(id, dofusId, [56, 62], {
  ecrase: mv('Écrasement', hit(13, el)),
  englue: mv('Engluement', hit(7, el), card('bave')),
}, cycle('englue', 'ecrase'), [{ kind: 'division' }], { splitInto: child });
const biblop = (id: string, dofusId: number, el: Element) => m(id, dofusId, [1, 1], {
  rebond: mv('Rebond', hit(6, el)),
}, cycle('rebond'));

export const ACT2_EXTRA: MonsterDef[] = [
  m('scarafeuille_rouge', 194, [30, 34], { mandibules: mv('Mandibules', hit(5, 'feu', 2)) }, cycle('mandibules'), [{ kind: 'carapace', n: 4 }]),
  m('scarafeuille_vert', 240, [30, 34], { mandibules: mv('Mandibules', hit(5, 'terre', 2)) }, cycle('mandibules'), [{ kind: 'carapace', n: 4 }]),
  m('scarafeuille_blanc', 241, [30, 34], { mandibules: mv('Mandibules', hit(5, 'air', 2)) }, cycle('mandibules'), [{ kind: 'carapace', n: 4 }]),
  m('kwak_vent', 81, [30, 34], { bourrasque: mv('Bourrasque', hit(9, 'air')), plumage: mv('Plumage', block(8)) },
    cycle('bourrasque', 'plumage'), [{ kind: 'esquive', n: 1 }]),
  m('kwak_terre', 235, [30, 34], { eboulis: mv('Éboulis', hit(10, 'terre')), plumage: mv('Plumage', block(8)) },
    cycle('eboulis', 'plumage'), [{ kind: 'esquive', n: 1 }]),
  m('kwakere_flamme', 269, [44, 48], { brasier: mv('Brasier', hit(10, 'feu'), card('braise', 1)), plumage: mv('Plumage ardent', block(10), buff(1)) },
    cycle('brasier', 'plumage')),
  blop('blop_coco', 273, 'air', 'biblop_coco'), blop('blop_indigo', 274, 'eau', 'biblop_indigo'),
  blop('blop_griotte', 275, 'feu', 'biblop_griotte'), blop('blop_reinette', 276, 'terre', 'biblop_reinette'),
  biblop('biblop_coco', 278, 'air'), biblop('biblop_indigo', 277, 'eau'), biblop('biblop_griotte', 279, 'feu'), biblop('biblop_reinette', 280, 'terre'),
  m('champa_vert', 652, [34, 38], { spores: mv('Spores', hit(8, 'air')), chapeau: mv('Chapeau', block(9)) }, cycle('spores', 'chapeau'), [{ kind: 'spores', n: 2 }]),
  m('champa_bleu', 654, [34, 38], { spores: mv('Spores', hit(8, 'eau')), chapeau: mv('Chapeau', block(9)) }, cycle('spores', 'chapeau'), [{ kind: 'spores', n: 2 }]),
  m('champa_marron', 655, [34, 38], { spores: mv('Spores', hit(8, 'terre')), chapeau: mv('Chapeau', block(9)) }, cycle('spores', 'chapeau'), [{ kind: 'spores', n: 2 }]),
  m('tortue_rouge', 220, [36, 40], { morsure: mv('Morsure', hit(11, 'feu')) }, cycle('morsure'), [{ kind: 'carapace', n: 7 }]),
  m('tortue_bleue', 221, [36, 40], { morsure: mv('Morsure', hit(11, 'eau')) }, cycle('morsure'), [{ kind: 'carapace', n: 7 }]),
  m('kanniboul_eth', 212, [40, 44], { danse: mv('Danse rituelle', block(8)), lance: mv('Lance', hit(9, 'air')) },
    cycle('danse', 'lance', 'lance'), [{ kind: 'rituel', n: 2 }]),
  m('kanniboul_jav', 213, [40, 44], { javelot: mv('Javelot', hit(15, 'eau')), visee: mv('Visée', buff(2)) }, cycle('visee', 'javelot')),
  m('kanniboul_sarbak', 214, [34, 38], { flechette: mv('Fléchette empoisonnée', hit(4, 'terre'), deb('poison', 4)) }, cycle('flechette')),
  m('fantome_hicide', 380, [36, 40], { lame: mv('Lame spectrale', hit(12, 'terre')), voile: mv('Voile', block(10)) },
    cycle('lame', 'voile'), [{ kind: 'artefact', n: 1 }, { kind: 'esquive', n: 1 }]),
  m('fantome_egerie', 379, [36, 40], { chant: mv('Chant funèbre', deb('faiblesse', 2), deb('vulnerabilite', 1)), toucher: mv('Toucher glacé', hit(10, 'air')) },
    cycle('chant', 'toucher'), [{ kind: 'artefact', n: 1 }]),
  m('crabe', 63, [36, 40], { pince: mv('Pince', hit(10, 'eau')) }, cycle('pince'), [{ kind: 'carapace', n: 4 }, { kind: 'epines', n: 2 }]),
  m('black_wabbit', 65, [38, 42], { carottes: mv('Carottes noires', hit(5, 'air', 3)), bond: mv('Bond', block(8), buff(1)) },
    random({ carottes: 60, bond: 40 })),
  m('wabbit_squelette', 179, [40, 44], { os: mv('Lancer d\'os', hit(13, 'terre')), cliquetis: mv('Cliquetis', deb('faiblesse', 2)) },
    cycle('os', 'cliquetis', 'os'), [{ kind: 'colere', n: 1, every: 3 }]),
  m('tiwabbit', 96, [24, 28], { carotte: mv('Carotte', hit(6, 'terre')) }, cycle('carotte'), [{ kind: 'voleur', n: 10, turns: 3 }, { kind: 'esquive', n: 1 }]),
  m('bandit_roublard', 155, [40, 44], { surin: mv('Coup de surin', hit(9, 'neutre')), fumigene: mv('Fumigène', block(12)) },
    cycle('surin', 'surin', 'fumigene'), [{ kind: 'voleur', n: 12, turns: 4 }]),
  m('bwork_archer', 74, [34, 38], { volee: mv('Volée de flèches', hit(4, 'air', 3)) }, cycle('volee')),
  m('cochon_de_lait', 123, [40, 44], { charge: mv('Charge', hit(11, 'air')) }, cycle('charge'), [{ kind: 'colere', n: 2, every: 3 }]),
  m('dragoeuf_ardoise', 88, [48, 52], { souffle: mv('Souffle d\'ardoise', hit(14, 'eau')), coquille: mv('Coquille', block(12)) },
    cycle('coquille', 'souffle'), [{ kind: 'carapace', n: 3 }]),
  m('dragoeuf_calcaire', 76, [48, 52], { souffle: mv('Souffle de calcaire', hit(14, 'terre')), coquille: mv('Coquille', block(12)) },
    cycle('coquille', 'souffle'), [{ kind: 'carapace', n: 3 }]),
  m('abrakne', 650, [32, 36], { morsure: mv('Morsure', hit(9, 'feu')), toile: mv('Grande toile', card('toile', 2, 'draw'), deb('faiblesse', 1)) },
    cycle('toile', 'morsure', 'morsure')),
  m('larve_saphir', 412, [34, 38], { morsure: mv('Morsure', hit(11, 'eau')) }, cycle('morsure'), [{ kind: 'enroulement', n: 9 }]),
  m('larve_rubis', 413, [34, 38], { morsure: mv('Morsure', hit(11, 'feu')) }, cycle('morsure'), [{ kind: 'enroulement', n: 9 }]),
  m('larve_emeraude', 414, [34, 38], { morsure: mv('Morsure', hit(11, 'air')) }, cycle('morsure'), [{ kind: 'enroulement', n: 9 }]),
  // ── élites ──
  m('chef_crocodaille', 263, [100, 106], {
    appel: mv('Appel du marais', summon('crocodaille')),
    machoires: mv('Mâchoires d\'acier', hit(18, 'eau')),
    vase: mv('Vase', deb('vulnerabilite', 2), block(14)),
  }, cycle('appel', 'machoires', 'vase', 'machoires'), [{ kind: 'rage', n: 1, every: 4 }]),
  m('chafer_elite', 292, [150, 158], {
    rituel: mv('Rituel des os', buff(3)),
    taille: mv('Taille', hit(8, 'feu', 2)),
    garde: mv('Garde d\'élite', block(16)),
  }, cycle('rituel', 'taille', 'garde', 'taille'), [{ kind: 'artefact', n: 2 }, { kind: 'rituel', n: 2 }]),
  m('branche_invocatrice', 258, [40, 44], { appel: mv('Appel des racines', summon('tronknyde')), fouet: mv('Fouet', hit(9, 'terre')) },
    cycle('fouet', 'appel', 'fouet')),
  m('branche_soignante', 260, [40, 44], { seve: mv('Sève', heal(10), block(8)), fouet: mv('Fouet', hit(8, 'eau')) }, cycle('seve', 'fouet')),
  // ── boss ──
  m('blop_griotte_royal', 1185, [300, 310], {
    ecrase: mv('Écrasement royal', hit(24, 'feu')),
    gelee: mv('Gelée royale', hit(10, 'feu'), card('bave', 2)),
    appel: mv('Appel des Blops', summon('blop_griotte')),
  }, cycle('gelee', 'ecrase', 'appel'), [{ kind: 'division' }], { boss: true, splitInto: 'blop_griotte' }),
  m('chene_mou', 257, [330, 340], {
    racines: mv('Racines', hit(9, 'terre', 2), deb('faiblesse', 1)),
    ecorce: mv('Écorce millénaire', block(30)),
    branches: mv('Branches', hit(26, 'terre')),
  }, cycle('racines', 'ecorce', 'branches'), [{ kind: 'plafond', n: 45 }, { kind: 'regeneration', n: 8 }], { boss: true }),
];

// ═════════════════════════════ ACTE 3 : landes de Brâkmar ═════════════════════════════

export const ACT3_EXTRA: MonsterDef[] = [
  m('rat_hyoactif', 449, [44, 48], { morsure: mv('Morsure radioactive', hit(8, 'eau'), deb('poison', 5)) }, cycle('morsure')),
  m('ramane_egoutant', 447, [44, 48], { griffe: mv('Griffe', hit(12, 'feu')), fuite: mv('Fuite', block(14)) },
    cycle('griffe', 'griffe', 'fuite'), [{ kind: 'voleur', n: 15, turns: 4 }]),
  m('corbac_chef', 4579, [56, 60], { ordre: mv('Ordre', buff(2), block(10)), bec: mv('Bec', hit(8, 'air', 2)) },
    cycle('ordre', 'bec', 'bec'), [{ kind: 'rituel', n: 1 }]),
  m('corbac_dresse', 4580, [46, 50], { plongeon: mv('Plongeon', hit(16, 'air')) }, cycle('plongeon'), [{ kind: 'esquive', n: 1 }]),
  m('koalak_coco', 752, [58, 62], { griffes: mv('Griffes', hit(9, 'air', 2)), cri: mv('Cri', buff(2)) }, cycle('griffes', 'griffes', 'cri')),
  m('koalak_griotte', 753, [58, 62], { morsure: mv('Morsure', hit(18, 'feu')), cri: mv('Cri', block(14)) }, cycle('morsure', 'cri')),
  m('warko_marron', 746, [60, 66], { charge: mv('Charge', hit(17, 'air')) }, cycle('charge'), [{ kind: 'colere', n: 2, every: 3 }]),
  m('mama_koalak', 755, [70, 76], { appel: mv('Appel des petits', summon('koalak_coco')), gifle: mv('Gifle', hit(16, 'terre')) },
    cycle('gifle', 'appel', 'gifle', 'gifle'), [{ kind: 'gardien' }]),
  m('koalak_forestier', 785, [60, 66], { hache: mv('Hache', hit(19, 'eau')), bois: mv('Fagot', block(16)) }, cycle('hache', 'bois')),
  m('dragoss_ardoise', 905, [70, 76], { souffle: mv('Souffle', hit(18, 'eau')) }, cycle('souffle'), [{ kind: 'carapace', n: 6 }]),
  m('dragoss_charbon', 858, [66, 72], { braise: mv('Crache-braise', hit(12, 'feu'), card('braise', 2)), griffes: mv('Griffes', hit(8, 'feu', 2)) },
    cycle('braise', 'griffes')),
  m('sanglacier', 2845, [66, 72], { charge: mv('Charge glacée', hit(20, 'air')) }, cycle('charge'), [{ kind: 'enroulement', n: 14 }]),
  m('mansobese', 2856, [90, 96], { ventre: mv('Coup de ventre', hit(22, 'feu')), sieste: mv('Sieste', block(20)) },
    cycle('ventre', 'sieste'), [{ kind: 'carapace', n: 5 }]),
  m('fricochere', 2846, [56, 60], { bec: mv('Bec gelé', hit(7, 'eau', 3)) }, cycle('bec'), [{ kind: 'esquive', n: 1 }]),
  m('kaniglou', 2847, [62, 66], { crocs: mv('Crocs', hit(10, 'air', 2)), hurle: mv('Hurlement', deb('vulnerabilite', 2)) },
    cycle('crocs', 'hurle', 'crocs'), [{ kind: 'colere', n: 2, every: 3 }]),
  m('yokai_givrefoux', 2888, [60, 64], { feux: mv('Feux follets', hit(7, 'air', 3)), voile: mv('Voile', block(14)) },
    cycle('feux', 'voile'), [{ kind: 'esquive', n: 2 }, { kind: 'artefact', n: 1 }]),
  m('boufcoul', 672, [72, 78], { charge: mv('Charge', hit(19, 'feu')), beugle: mv('Beuglement', buff(3)) },
    cycle('beugle', 'charge', 'charge'), [{ kind: 'colere', n: 1, every: 3 }]),
  m('muloubard', 4866, [64, 70], { griffes: mv('Griffes', hit(20, 'eau')), blessure: mv('Lacération', hit(10, 'eau'), card('blessure', 1)) },
    cycle('griffes', 'blessure')),
  m('bitouf_sombre', 1041, [64, 70], { ailes: mv('Ailes sombres', hit(9, 'air', 2), deb('faiblesse', 1)) }, cycle('ailes'), [{ kind: 'regeneration', n: 5 }]),
  m('bitouf_aerien', 1020, [54, 58], { pique: mv('Piqué', hit(18, 'air')) }, cycle('pique'), [{ kind: 'esquive', n: 2 }]),
  m('timansot', 2849, [30, 34], { bec: mv('Petit bec', hit(9, 'eau')) }, cycle('bec')),
  // ── élites ──
  m('mansot_royal', 2848, [200, 210], {
    couvee: mv('Couvée royale', summon('timansot', 2)),
    glissade: mv('Glissade', hit(24, 'eau')),
    banquise: mv('Banquise', block(24), buff(2)),
  }, cycle('couvee', 'glissade', 'banquise', 'glissade'), [{ kind: 'artefact', n: 3 }, { kind: 'gardien' }]),
  m('dok_alako', 747, [220, 230], {
    rage: mv('Rage du Dok', buff(3)),
    griffes: mv('Griffes', hit(12, 'air', 2)),
    massacre: mv('Massacre', hit(32, 'air')),
  }, cycle('rage', 'griffes', 'massacre'), [{ kind: 'rage', n: 3, every: 4 }]),
  m('gardienne_egouts', 450, [190, 200], {
    appel: mv('Appel des égouts', summon('rat_egoutant', 2)),
    peste: mv('Peste', deb('poison', 8), deb('faiblesse', 1)),
    queue: mv('Coup de queue', hit(26, 'terre')),
  }, cycle('appel', 'peste', 'queue', 'queue'), [{ kind: 'gardien' }, { kind: 'regeneration', n: 6 }]),
  // ── boss ──
  m('meulou', 232, [450, 470], {
    meute: mv('Appel de la meute', summon('mulou')),
    griffes: mv('Griffes', hit(14, 'eau', 2)),
    hurlement: mv('Hurlement lunaire', buff(4), deb('vulnerabilite', 2)),
    devore: mv('Dévorer', drain(28, 'eau')),
  }, cycle('meute', 'griffes', 'hurlement', 'devore'), [{ kind: 'colere', n: 1, every: 3 }],
  { boss: true, phase2: { at: 0.5, puissance: 4, name: 'Pleine lune', pattern: cycle('griffes', 'devore', 'griffes', 'meute') } }),
  m('tofu_royal', 382, [430, 450], {
    nuee: mv('Nuée de Tofus', summon('tofu', 2)),
    bec: mv('Bec royal', hit(10, 'air', 3)),
    plumes: mv('Plumes dorées', block(26)),
    pique: mv('Piqué royal', hit(34, 'air')),
  }, cycle('nuee', 'bec', 'plumes', 'pique'), [{ kind: 'esquive', n: 3 }, { kind: 'rituel', n: 1 }],
  { boss: true, phase2: { at: 0.5, puissance: 2, name: 'Envol royal', pattern: cycle('bec', 'pique', 'nuee') } }),
];

type Enc = { tier: EncounterTier; act: Act; monsters: string[]; pack?: number };
const enc = (act: Act, tier: EncounterTier, pack: number, ...monsters: string[]): Enc => ({ act, tier, monsters, pack });

/** Rencontres ajoutées (décor = pack de carte de Dofus Survivors). */
export const EXTRA_ENCOUNTERS: Record<string, Enc> = {
  // Acte 1
  pious: enc(1, 'faible', 18, 'piou_rouge', 'piou_bleu'),
  larves: enc(1, 'faible', 18, 'larve_verte', 'larve_orange'),
  chafers_debutants: enc(1, 'faible', 9, 'chafer_furtif', 'chafer_debutant'),
  ecurouille: enc(1, 'faible', 32, 'ecurouille', 'tofu'),
  gelee_bleuet: enc(1, 'normal', 8, 'gelee_bleuet'),
  gelees: enc(1, 'normal', 8, 'gelee_menthe', 'piou_jaune'),
  nuee_pious: enc(1, 'normal', 18, 'piou_vert', 'piou_violet', 'tofu'),
  champa_explosif: enc(1, 'normal', 8, 'champa_explosif', 'champ_champ', 'moskito'),
  strubiens: enc(1, 'normal', 41, 'scelerat_strubien', 'milirat_strubien'),
  egouts_amakna: enc(1, 'normal', 9, 'arakne_egouts', 'milirat_strubien'),
  nuit_hantee: enc(1, 'normal', 9, 'boo', 'citwouille'),
  tofus_malefiques: enc(1, 'normal', 32, 'tofu_malefique', 'tofu_noir'),
  bouftons: enc(1, 'normal', 1, 'boufton_blanc', 'boufton_noir', 'tofu'),
  milimulous: enc(1, 'normal', 41, 'milimulou', 'gob_trotteur'),
  chafer_invisible: enc(1, 'normal', 9, 'chafer_invisible', 'abraknyde_chetif'),
  gelee_fraise: enc(1, 'normal', 8, 'gelee_fraise', 'larve_orange'),
  gardienne_champetre: enc(1, 'elite', 8, 'gardienne_champetre', 'campagnoll'),
  rose_obscure: enc(1, 'elite', 8, 'rose_obscure'),
  sergent_chafer: enc(1, 'elite', 9, 'sergent_chafer', 'chafer_debutant'),
  shin_larve: enc(1, 'boss', 18, 'shin_larve'),
  coffre_maudit: enc(1, 'boss', 41, 'coffre_maudit'),
  // Acte 2
  scarafeuilles: enc(2, 'faible', 46, 'scarafeuille_rouge', 'scarafeuille_vert'),
  biblops: enc(2, 'faible', 125, 'blop_coco'),
  tortues: enc(2, 'faible', 125, 'tortue_rouge', 'kwak_vent'),
  larves_precieuses: enc(2, 'faible', 22, 'larve_saphir', 'larve_rubis'),
  blops: enc(2, 'normal', 125, 'blop_indigo', 'blop_reinette'),
  champas: enc(2, 'normal', 59, 'champa_vert', 'champa_bleu', 'champa_marron'),
  kanniboul_village: enc(2, 'normal', 46, 'kanniboul_eth', 'kanniboul_jav', 'kanniboul_sarbak'),
  fantomes: enc(2, 'normal', 117, 'fantome_hicide', 'fantome_egerie'),
  plage: enc(2, 'normal', 46, 'crabe', 'kwak_terre'),
  terrier: enc(2, 'normal', 98, 'black_wabbit', 'wabbit_squelette', 'tiwabbit'),
  roublards: enc(2, 'normal', 89, 'bandit_roublard', 'bwork_archer'),
  dragoeufs: enc(2, 'normal', 89, 'dragoeuf_ardoise', 'dragoeuf_calcaire'),
  porcherie: enc(2, 'normal', 98, 'cochon_de_lait', 'kwakere_flamme'),
  abraknes: enc(2, 'normal', 59, 'abrakne', 'larve_emeraude', 'scarafeuille_blanc'),
  chef_crocodaille: enc(2, 'elite', 125, 'chef_crocodaille', 'crocodaille'),
  chafer_elite: enc(2, 'elite', 98, 'chafer_elite', 'chafer_archer'),
  blop_griotte_royal: enc(2, 'boss', 125, 'blop_griotte_royal'),
  chene_mou: enc(2, 'boss', 59, 'chene_mou', 'branche_soignante'),
  // Acte 3
  rats_radioactifs: enc(3, 'faible', 111, 'rat_hyoactif', 'rat_egoutant'),
  koalaks: enc(3, 'faible', 89, 'koalak_coco', 'koalak_griotte'),
  fricocheres: enc(3, 'faible', 55, 'fricochere', 'timansot', 'timansot'),
  bitoufs: enc(3, 'faible', 133, 'bitouf_aerien', 'kolerat'),
  ramanes: enc(3, 'normal', 111, 'ramane_egoutant', 'rat_hyoactif', 'rat_egoutant'),
  corbacs_dresses: enc(3, 'normal', 133, 'corbac_chef', 'corbac_dresse'),
  famille_koalak: enc(3, 'normal', 89, 'mama_koalak', 'koalak_coco'),
  bucherons: enc(3, 'normal', 89, 'koalak_forestier', 'warko_marron'),
  dragoss: enc(3, 'normal', 97, 'dragoss_ardoise', 'dragoss_charbon'),
  banquise: enc(3, 'normal', 58, 'sanglacier', 'mansobese'),
  givrefoux: enc(3, 'normal', 60, 'yokai_givrefoux', 'kaniglou'),
  cavernes: enc(3, 'normal', 169, 'boufcoul', 'muloubard'),
  landes_sombres: enc(3, 'normal', 169, 'bitouf_sombre', 'mulou'),
  mansot_royal: enc(3, 'elite', 58, 'mansot_royal'),
  dok_alako: enc(3, 'elite', 89, 'dok_alako'),
  gardienne_egouts: enc(3, 'elite', 111, 'gardienne_egouts'),
  meulou: enc(3, 'boss', 169, 'meulou', 'mulou'),
  tofu_royal: enc(3, 'boss', 66, 'tofu_royal'),
};
