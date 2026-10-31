// Importe depuis le dépôt Dofus Survivors les ressources visuelles du combat :
//   - animations des classes (squelette, peaux homme/femme, animations de sorts) → public/game/anims/
//   - décors d'Amakna (packs de cartes de donjons) → public/game/maps/
//   - effets d'impact et projectiles des sorts utilisés par nos cartes → public/game/fx/
//   - table sort → animation de lancer + effets → src/data/spellfx.json
// Usage : node tools/import-survivors-assets.mjs ../dofus-sirvovpr
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src || !existsSync(join(src, 'index.html'))) {
  console.error('Usage : node tools/import-survivors-assets.mjs <dossier du dépôt dofus-sirvovpr>');
  process.exit(1);
}

const BREEDS = [8, 9]; // Iop, Crâ
const MAP_PACKS = [
  1, 8, 9, 18, 32, 41, // acte 1, Amakna : camp des Bouftous, champs, sous-bois, prairie, œufs
  22, 46, 59, 89, 98, 117, 125, // acte 2 : grotte de cristal, jungle, forêt sombre, rocaille, ossuaire, bois maudit, marais
  55, 58, 60, 66, 84, 94, 97, 111, 133, 169, 177, // acte 3 : glaces, palais gelé, brume, désert, corail, labyrinthe, forge, ravins, Brâkmar
];
const FX_BUCKETS = 300; // même hachage que l'outil d'empaquetage de Survivors
const bucketOfN = (s, n) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; };
const bucketOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % FX_BUCKETS; };

const html = readFileSync(join(src, 'index.html'), 'utf8');
const SPELLFX = JSON.parse(html.match(/const SPELLFX=(\{.*?\});\n/)[1]);

const dest = (...p) => { const d = join(root, ...p); mkdirSync(dirname(d), { recursive: true }); return d; };
let bytes = 0;
const copy = (from, ...to) => { copyFileSync(from, dest(...to)); bytes += readFileSync(from).length; };

// Animations
copy(join(src, 'anims/base.js'), 'public/game/anims/base.js');
for (const b of BREEDS) {
  copy(join(src, `anims/sp_${b}.js`), `public/game/anims/sp_${b}.js`);
  for (const g of ['m', 'f']) copy(join(src, `anims/look_${b}${g}.js`), `public/game/anims/look_${b}${g}.js`);
}
// Décors
for (const id of MAP_PACKS) copy(join(src, `maps/${id}.js`), `public/game/maps/${id}.js`);

// Effets des sorts utilisés par nos cartes
const { ALL_CARDS } = await import(join(root, 'src/data/cards.ts'));
const ours = [...new Set(ALL_CARDS.map((c) => c.spellId).filter(Boolean).map(String))];
const table = {};
const gfx = new Set();
for (const id of ours) {
  const f = SPELLFX[id];
  if (!f) continue;
  table[id] = f;
  for (const [, g] of f[1]) gfx.add(g);
}
const buckets = new Set([...gfx].map(bucketOf));
for (const b of buckets) {
  const f = join(src, `fx/p${b}.js`);
  if (existsSync(f)) copy(f, `public/game/fx/p${b}.js`);
}
writeFileSync(dest('src/data/spellfx.json'), JSON.stringify({ buckets: FX_BUCKETS, spells: table }) + '\n');

// Apparences des coiffes et capes portées : table objet Dofus → peau (ITEM_SKIN de Survivors),
// puis paquets d'accessoires réduits aux seules peaux de nos objets (même hachage, 80 paquets).
const ACC_BK = 80;
const skinTable = (() => {
  const i = html.indexOf('ITEM_SKIN=') + 'ITEM_SKIN='.length;
  let depth = 0, k = i;
  for (; k < html.length; k++) { if (html[k] === '{') depth++; else if (html[k] === '}' && --depth === 0) break; }
  return JSON.parse(html.slice(i, k + 1));
})();
const DOFUS = JSON.parse(readFileSync(join(root, 'src/data/dofus.json'), 'utf8'));
const skins = {};
for (const it of DOFUS.catalog) {
  if (it.slot !== 'coiffe' && it.slot !== 'cape') continue;
  const sk = skinTable[it.id];
  if (sk) skins[it.id] = Math.abs(sk);
}
writeFileSync(dest('src/data/skins.json'), JSON.stringify(skins) + '\n');
const wanted = new Set(Object.values(skins).map((n) => `acc_${n}`));
const byBucket = {};
for (const k of wanted) (byBucket[bucketOfN(k, ACC_BK)] ??= []).push(k);
let accN = 0;
for (const [b, keys] of Object.entries(byBucket)) {
  const f = join(src, `anims/accp${b}.js`);
  if (!existsSync(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n').filter((l) => keys.some((k) => l.startsWith(`DSV_RT("${k}",`)));
  accN += lines.length;
  const out = lines.join('\n') + '\n';
  writeFileSync(dest(`public/game/anims/accp${b}.js`), out);
  bytes += out.length;
}
console.log(`Apparences : ${Object.keys(skins).length} coiffes et capes, ${accN} peaux dans ${Object.keys(byBucket).length} paquets.`);

console.log(`Import terminé : ${(bytes / 1048576).toFixed(1)} Mo, ${Object.keys(table).length} sorts avec animation/effets, ` +
  `${gfx.size} effets dans ${buckets.size} paquets.`);
