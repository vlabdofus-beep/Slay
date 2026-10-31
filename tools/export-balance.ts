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
import { RELICS } from '../src/data/relics.ts';
import { EVENTS } from '../src/data/events.ts';

const FILE = new URL('../equilibrage.json', import.meta.url);
const cards = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));
const monsters = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));
const fresh = exportBalance({ cards, monsters, classHp: CLASS_START_HP, starters: STARTERS, passives: PASSIVE_VALUES, scale: TIER_SCALE, gods: GODS, relics: RELICS, events: EVENTS }, ALL_CARDS, MONSTERS);

let out: BalanceFile = fresh;
let added = 0;
if (existsSync(FILE) && !process.argv.includes('--reset')) {
  const cur = JSON.parse(readFileSync(FILE, 'utf8')) as BalanceFile;
  for (const sec of ['classes', 'cartes', 'monstres'] as const) {
    const have = (cur[sec] ??= {} as never) as Record<string, unknown>;
    for (const [k, v] of Object.entries(fresh[sec])) if (!(k in have)) { have[k] = v; added++; }
  }
  // Passifs : un passif absent (nouvelle classe) est ajouté, ceux déjà présents restent tels quels.
  const pas = (cur.passifs ??= fresh.passifs) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(fresh.passifs)) if (!(k in pas)) { pas[k] = v; added++; }
  cur.echelle_monstres ??= fresh.echelle_monstres;
  // Dieux : un dieu ou une bénédiction absents sont ajoutés, ceux déjà présents restent tels quels.
  const gods = (cur.dieux ??= {});
  for (const [gid, g] of Object.entries(fresh.dieux ?? {})) {
    if (!gods[gid]) { gods[gid] = g; added += Object.keys(g.benedictions).length; continue; }
    for (const [bid, b] of Object.entries(g.benedictions)) if (!(bid in gods[gid].benedictions)) { gods[gid].benedictions[bid] = b; added++; }
  }
  const relics = (cur.reliques ??= {});
  for (const [id, r] of Object.entries(fresh.reliques ?? {})) if (!(id in relics)) { relics[id] = r; added++; }
  const events = (cur.evenements ??= {});
  for (const [id, e] of Object.entries(fresh.evenements ?? {})) if (!(id in events)) { events[id] = e; added++; }
  cur._aide = HELP;
  out = { _aide: cur._aide, classes: cur.classes, passifs: cur.passifs, echelle_monstres: cur.echelle_monstres, dieux: cur.dieux, reliques: cur.reliques, evenements: cur.evenements, cartes: cur.cartes, monstres: cur.monstres };
}
writeFileSync(FILE, formatBalance(out) + '\n');
console.log(`equilibrage.json : ${Object.keys(out.cartes).length} cartes, ${Object.keys(out.monstres).length} monstres, ${Object.keys(out.reliques ?? {}).length} reliques, ${Object.keys(out.evenements ?? {}).length} événements${added ? `, ${added} entrées ajoutées` : ''}.`);
