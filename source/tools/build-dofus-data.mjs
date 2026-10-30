// Extrait le sous-ensemble de données Dofus utilisé par le jeu, depuis les fichiers de Dofdle
// (eux-mêmes construits depuis DofusDB). Usage :
//   node tools/build-dofus-data.mjs ../dofdle/data
// Écrit src/data/dofus.json (petit fichier versionné). Les valeurs d'équilibrage restent dans src/data/*.ts :
// on ne prend à Dofus que les noms, éléments, coûts en PA, résistances, panoplies et icônes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage : node tools/build-dofus-data.mjs <dossier data de Dofdle>');
  process.exit(1);
}
const load = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const spellsDb = load('spells.json');
const monstersDb = load('monsters.json');
const itemsDb = load('items.json');

// ── Sélection ──
const BREEDS = { 8: 'iop', 9: 'cra' };
const MONSTER_IDS = [
  31, 52, 61, 79, 59, 78, 101, 149, 103, 104, 98, // monstres d'Amakna
  148, 799, // élites : Chef de Guerre Bouftou, Tournesol Affamé
  147, // boss : Bouftou Royal
  // Acte 2 : Abraknydes, Cania, marais
  47, 256, 259, 54, 291, 83, 84, 64, 876, 53, 106, 198, 261, 211,
  253, 669, 180, 792, // élites
  173, // boss : Abraknyde Ancestral
  // Acte 3 : Frigost, Brâkmar, landes
  300, 299, 442, 483, 287, 784, 281, 102, 1075, 1043, 1044,
  289, 113, 670, // élites
  121, // boss : Minotoror
  // Bestiaire étendu (src/data/bestiary.ts)
  34, 46, 55, 56, 57, 62, 63, 65, 74, 76, 81, 88, 96, 110, 111, 112, 123, 134, 155, 159, 179, 194, 207, 212, 213, 214, 220, 221, 232, 235, 236, 240, 241, 255, 257, 258, 260, 263, 269, 273, 274, 275, 276, 277, 278, 279, 280, 292, 379, 380, 382, 412, 413, 414, 447, 449, 450, 457, 465, 467, 475, 489, 490, 491, 493, 650, 652, 654, 655, 672, 746, 747, 752, 753, 755, 785, 796, 858, 905, 1020, 1041, 1078, 1178, 1185, 2845, 2846, 2847, 2848, 2849, 2856, 2888, 4000, 4046, 4047, 4050, 4579, 4580, 4819, 4821, 4823, 4866,
];
// Catalogue d'objets : par emplacement, des objets réels répartis en 4 raretés selon leur niveau Dofus.
const BANDS = [
  { rarity: 'commun', min: 1, max: 40, n: 7 },
  { rarity: 'rare', min: 41, max: 100, n: 6 },
  { rarity: 'mythique', min: 101, max: 160, n: 5 },
  { rarity: 'legendaire', min: 161, max: 200, n: 4 },
];

// ── Conversions ──
const SLOT = { Chapeau: 'coiffe', Cape: 'cape', Amulette: 'amulette', Anneau: 'anneau', Ceinture: 'ceinture', Bottes: 'bottes' };
// Caractéristiques et dommages élémentaires → élément du jeu
const EL_FX = { 118: 'terre', 422: 'terre', 126: 'feu', 424: 'feu', 123: 'eau', 426: 'eau', 119: 'air', 428: 'air' };
const DMG_FX = { 422: 'terre', 424: 'feu', 426: 'eau', 428: 'air' };
const VITA = 125;
const GENERIC_DMG = [112, 138]; // Dommages, Puissance

// Stat principale d'un objet : celle que l'objet pousse le plus (valeurs ramenées à une échelle commune).
const CHAR = { 118: 'terre', 126: 'feu', 123: 'eau', 119: 'air' };
const RES = [210, 211, 212, 213, 214, 240, 241, 242, 243, 244];
function primaryStat(it) {
  const score = { terre: 0, feu: 0, eau: 0, air: 0, pv: 0, prospection: 0, armure: 0 };
  for (const [id, a, b] of it.fx) {
    const v = Math.max(a, b);
    if (CHAR[id]) score[CHAR[id]] += v;
    else if (DMG_FX[id]) score[DMG_FX[id]] += v * 6;
    else if (id === VITA) score.pv += v * 0.45;
    else if (id === 176) score.prospection += v * 1.6;
    else if (id === 124) score.armure += v * 0.8;
    else if (RES.includes(id)) score.armure += v * (id >= 240 ? 0.6 : 2.5);
  }
  const best = Object.entries(score).sort((x, y) => y[1] - x[1])[0];
  return best[1] > 0 ? best[0] : null;
}

function itemInfo(it) {
  const type = itemsDb.types[String(it.t)];
  const els = [...new Set(it.fx.map((f) => EL_FX[f[0]]).filter(Boolean))].sort();
  return {
    id: it.id,
    n: it.n,
    slot: SLOT[type] ?? null,
    l: it.l,
    icon: it.i,
    set: it.s || null,
    els,
    dmgEls: [...new Set(it.fx.map((f) => DMG_FX[f[0]]).filter(Boolean))].sort(),
    vita: it.fx.some((f) => f[0] === VITA),
    genericDmg: it.fx.some((f) => GENERIC_DMG.includes(f[0])),
  };
}

const out = { v: 1, source: { spells: spellsDb.builtAt, monsters: monstersDb.builtAt, items: itemsDb.builtAt },
  breeds: {}, spells: {}, monsters: {}, catalog: [] };

for (const [id, key] of Object.entries(BREEDS)) out.breeds[key] = { id: Number(id), n: spellsDb.breeds[id] };
for (const s of spellsDb.spells) {
  if (BREEDS[s.b]) out.spells[s.id] = { n: s.n, b: BREEDS[s.b], pa: s.pa, el: s.el, icon: s.i, de: s.de };
}

const RES_ORDER = ['neutre', 'terre', 'feu', 'eau', 'air'];
for (const id of MONSTER_IDS) {
  const m = monstersDb.monsters.find((x) => x.id === id);
  if (!m) throw new Error(`Monstre ${id} introuvable`);
  const res = Object.fromEntries(RES_ORDER.map((el, i) => [el, m.res[i]]));
  const sub = (m.zs ?? []).map((z) => monstersDb.subareas[String(z)]?.n).filter(Boolean).slice(0, 3);
  out.monsters[id] = { n: m.n, l: m.l, k: m.k, res, gfx: m.g, zones: sub };
}

// Sélection : dans chaque emplacement et chaque bande de niveau, on alterne les stats principales pour que
// chaque rareté propose de tout (éléments, PV, prospection, armure). Tirage déterministe (ordre des ids).
const ORDER = ['terre', 'feu', 'eau', 'air', 'pv', 'prospection', 'armure'];
out.catalog = [];
for (const slot of Object.values(SLOT)) {
  for (const band of BANDS) {
    const cands = itemsDb.items
      .filter((it) => SLOT[itemsDb.types[String(it.t)]] === slot && it.l >= band.min && it.l <= band.max)
      .map((it) => ({ it, stat: primaryStat(it) }))
      .filter((x) => x.stat)
      .sort((a, b) => ((a.it.id * 2654435761) >>> 0) - ((b.it.id * 2654435761) >>> 0));
    const picked = [];
    for (let round = 0; picked.length < band.n && round < 10; round++) {
      for (const stat of ORDER) {
        if (picked.length >= band.n) break;
        const c = cands.find((x) => x.stat === stat && !picked.includes(x));
        if (c && picked.filter((p) => p.stat === stat).length <= round) picked.push(c);
      }
    }
    for (const { it, stat } of picked) out.catalog.push({ id: it.id, n: it.n, slot, l: it.l, icon: it.i, rarity: band.rarity, stat });
  }
}

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'dofus.json');
writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`Écrit ${dest} : ${Object.keys(out.spells).length} sorts, ${Object.keys(out.monsters).length} monstres, ` +
  `${out.catalog.length} objets`);
