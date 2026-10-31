// Crée ou complète equilibrage.json à partir des valeurs du code.
//  node tools/export-balance.ts          → ajoute seulement ce qui manque (cartes, monstres, classes nouveaux)
//  node tools/export-balance.ts --reset  → réécrit tout le fichier avec les valeurs du code
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ALL_CARDS } from '../src/data/cards.ts';
import { MONSTERS, TIER_SCALE } from '../src/data/monsters.ts';
import { CLASS_START_HP, STARTERS } from '../src/data/classStart.ts';
import { PASSIVE_VALUES } from '../src/core/classes.ts';
import { HELP, exportBalance, formatBalance, type BalanceFile } from '../src/data/balance.ts';
import { GODS } from '../src/data/gods.ts';

const FILE = new URL('../equilibrage.json', import.meta.url);
const cards = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));
const monsters = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));
const fresh = exportBalance({ cards, monsters, classHp: CLASS_START_HP, starters: STARTERS, passives: PASSIVE_VALUES, scale: TIER_SCALE, gods: GODS }, ALL_CARDS, MONSTERS);

let out: BalanceFile = fresh;
let added = 0;
if (existsSync(FILE) && !process.argv.includes('--reset')) {
  const cur = JSON.parse(readFileSync(FILE, 'utf8')) as BalanceFile;
  for (const sec of ['classes', 'cartes', 'monstres'] as const) {
    const have = (cur[sec] ??= {} as never) as Record<string, unknown>;
    for (const [k, v] of Object.entries(fresh[sec])) if (!(k in have)) { have[k] = v; added++; }
  }
  cur.passifs ??= fresh.passifs;
  cur.echelle_monstres ??= fresh.echelle_monstres;
  // Dieux : un dieu ou une bénédiction absents sont ajoutés, ceux déjà présents restent tels quels.
  const gods = (cur.dieux ??= {});
  for (const [gid, g] of Object.entries(fresh.dieux ?? {})) {
    if (!gods[gid]) { gods[gid] = g; added += Object.keys(g.benedictions).length; continue; }
    for (const [bid, b] of Object.entries(g.benedictions)) if (!(bid in gods[gid].benedictions)) { gods[gid].benedictions[bid] = b; added++; }
  }
  cur._aide = HELP;
  out = { _aide: cur._aide, classes: cur.classes, passifs: cur.passifs, echelle_monstres: cur.echelle_monstres, dieux: cur.dieux, cartes: cur.cartes, monstres: cur.monstres };
}
writeFileSync(FILE, formatBalance(out) + '\n');
console.log(`equilibrage.json : ${Object.keys(out.cartes).length} cartes, ${Object.keys(out.monstres).length} monstres${added ? `, ${added} entrées ajoutées` : ''}.`);
