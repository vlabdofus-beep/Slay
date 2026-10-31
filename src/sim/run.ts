// Simulations headless : `npm run sim [N]`
// Le bot joue des runs complètes avec le vrai déroulé (carte, butin, Zaap) : base de comparaison entre réglages.
import { Combat } from '../core/combat.ts';
import { poolSize } from '../core/effects.ts';
import type { ClassId } from '../core/types.ts';
import { ACT1_SCALE, ENCOUNTERS } from '../data/monsters.ts';
import { CLASS_START_HP, LIBRARY, starterDeck } from '../data/library.ts';
import { botRun } from './bot.ts';
import { playGreedy } from './policy.ts';

const N = Number(process.argv[2] ?? 500);
const CLASSES: ClassId[] = ['iop', 'cra', 'xelor'];
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const f1 = (x: number) => x.toFixed(1);

// ── 1. Chaque rencontre, deck de départ, PV pleins ──
console.log(`\n=== Deck de départ, sans objets, PV pleins (${N} combats par case) ===`);
console.log('rencontre        palier   ' + CLASSES.map((c) => `${c}: victoires / PV perdus / tours`.padEnd(36)).join(''));
for (const enc of Object.keys(ENCOUNTERS).filter((e) => ENCOUNTERS[e].act === 1)) {
  const cols = CLASSES.map((classe) => {
    const maxHp = CLASS_START_HP[classe] as number;
    let wins = 0, lost = 0, turns = 0;
    for (let s = 1; s <= N; s++) {
      const c = new Combat(LIBRARY, starterDeck(classe), { hp: maxHp, maxHp, classe }, ENCOUNTERS[enc].monsters, s, ACT1_SCALE);
      playGreedy(c);
      const r = c.result();
      turns += r.turns;
      if (r.outcome === 'won') { wins++; lost += maxHp - r.hp; }
    }
    return `${pct(wins / N).padStart(5)} / ${f1(wins ? lost / wins : 0).padStart(5)} / ${f1(turns / N).padStart(4)}`.padEnd(36);
  });
  console.log(`${enc.padEnd(16)} ${ENCOUNTERS[enc].tier.padEnd(8)} ${cols.join('')}`);
}

// ── 2. Runs complètes ──
console.log(`\n=== Run complète (3 actes), ${N} runs par ligne (bot glouton, chemin au hasard, Zaap si PV bas) ===`);
console.log('objets  classe  étages  boss 1  boss 2  boss 3  PV avant boss 1  objets portés  prospection  raretés trouvées');
for (const noItems of [true, false]) {
  for (const classe of CLASSES) {
    let floor = 0, hp = 0, hpN = 0, items = 0, prosp = 0;
    const bosses = [0, 0, 0];
    const rar: Record<string, number> = {};
    for (let s = 1; s <= N; s++) {
      const r = botRun(classe, s, { noItems });
      floor += r.floor; items += r.items; prosp += r.prospection;
      for (let b = 0; b < r.bosses; b++) bosses[b]++;
      if (r.hpBeforeBoss !== null) { hp += r.hpBeforeBoss; hpN++; }
      for (const [k, v] of Object.entries(r.rarities)) rar[k] = (rar[k] ?? 0) + v;
    }
    const rs = ['commun', 'rare', 'mythique', 'legendaire'].map((k) => `${k} ${f1((rar[k] ?? 0) / N)}`).join(', ');
    console.log(`${(noItems ? 'non' : 'oui').padEnd(7)} ${classe.padEnd(7)} ${f1(floor / N).padStart(6)}  ${bosses.map((b) => pct(b / N).padStart(6)).join('  ')}  ` +
      `${f1(hpN ? hp / hpN : 0).padStart(15)}  ${f1(items / N).padStart(13)}  ${f1(prosp / N).padStart(11)}  ${noItems ? '' : rs}`);
  }
}

const size = poolSize();
console.log(`\nBase d'effets : ${size.commun} communs, ${size.rare} rares, ${size.mythique} mythiques (paires), ${size.legendaire} légendaires.\n`);
