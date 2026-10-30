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
];
const SET_IDS = [72, 60, 23, 50, 364, 150, 1]; // Piou Vert, Piou Rouge, Moskito, Tofu, Microplie, Intrépide, Bouftou
const RARE_ITEM_IDS = [2438, 2445, 1662, 2441, 17506, 2442];

// ── Conversions ──
const SLOT = { Chapeau: 'coiffe', Cape: 'cape', Amulette: 'amulette', Anneau: 'anneau', Ceinture: 'ceinture', Bottes: 'bottes' };
// Caractéristiques et dommages élémentaires → élément du jeu
const EL_FX = { 118: 'terre', 422: 'terre', 126: 'feu', 424: 'feu', 123: 'eau', 426: 'eau', 119: 'air', 428: 'air' };
const DMG_FX = { 422: 'terre', 424: 'feu', 426: 'eau', 428: 'air' };
const VITA = 125;
const GENERIC_DMG = [112, 138]; // Dommages, Puissance

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
  breeds: {}, spells: {}, monsters: {}, sets: {}, items: {} };

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

for (const sid of SET_IDS) {
  const pieces = itemsDb.items.filter((it) => it.s === sid).map(itemInfo).filter((it) => it.slot);
  if (!pieces.length) throw new Error(`Panoplie ${sid} vide`);
  out.sets[sid] = { n: itemsDb.sets[String(sid)], items: pieces.map((p) => p.id) };
  for (const p of pieces) out.items[p.id] = p;
}
for (const id of RARE_ITEM_IDS) {
  const it = itemsDb.items.find((x) => x.id === id);
  if (!it) throw new Error(`Item ${id} introuvable`);
  out.items[id] = itemInfo(it);
}

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'dofus.json');
writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`Écrit ${dest} : ${Object.keys(out.spells).length} sorts, ${Object.keys(out.monsters).length} monstres, ` +
  `${Object.keys(out.sets).length} panoplies, ${Object.keys(out.items).length} items`);
