// Mesure chaque bénédiction isolée : `node src/sim/boons.ts [N]`
//
// Le bot joue N runs par classe, sans autre dieu, avec une seule bénédiction forcée dès le départ.
// On compare l'étage moyen et les boss battus à la même série sans bénédiction (mêmes graines).
import { GODS } from '../data/gods.ts';
import type { ClassId } from '../core/types.ts';
import { botRun } from './bot.ts';

const N = Number(process.argv[2] ?? 40);
const CLASSES: ClassId[] = ['iop', 'cra'];

interface Row { floor: number; bosses: [number, number, number]; won: number }

function measure(boon?: string): Row {
  const row: Row = { floor: 0, bosses: [0, 0, 0], won: 0 };
  const runs = N * CLASSES.length;
  for (let i = 0; i < runs; i++) {
    const r = botRun(CLASSES[i % 2], i + 1, { noGods: true, ...(boon ? { forceBoon: boon } : {}) });
    row.floor += r.floor;
    for (let b = 0; b < r.bosses; b++) row.bosses[b]++;
    if (r.won) row.won++;
  }
  row.floor /= runs;
  return row;
}

const pct = (n: number, d: number) => `${Math.round(100 * n / d)}%`;
const base = measure();
const runs = N * CLASSES.length;
console.log(`Référence sans bénédiction, ${N} runs par classe : étage ${base.floor.toFixed(2)}, boss ${base.bosses.map((b) => pct(b, runs)).join(' / ')}`);
console.log('bénédiction              dieu        étage   écart   boss 1  boss 2  boss 3');
const rows: { id: string; name: string; god: string; floor: number; d: number; b: [number, number, number] }[] = [];
for (const g of GODS) {
  for (const b of g.boons) {
    const m = measure(b.id);
    const d = m.floor - base.floor;
    rows.push({ id: b.id, name: b.name, god: g.name, floor: m.floor, d, b: m.bosses });
    const flag = d >= 1.2 ? '  ↑' : d <= -0.4 ? '  ↓' : '';
    console.log(`${b.name.padEnd(24)} ${g.name.padEnd(10)} ${m.floor.toFixed(2).padStart(6)}  ${d >= 0 ? '+' : ''}${d.toFixed(2).padStart(5)}  ${m.bosses.map((x) => pct(x, runs).padStart(6)).join('  ')}${flag}`);
  }
}
rows.sort((a, b) => b.d - a.d);
console.log('\nPlus fortes : ' + rows.slice(0, 8).map((r) => `${r.name} (${r.d >= 0 ? '+' : ''}${r.d.toFixed(2)})`).join(', '));
console.log('Plus faibles : ' + rows.slice(-8).map((r) => `${r.name} (${r.d >= 0 ? '+' : ''}${r.d.toFixed(2)})`).join(', '));
