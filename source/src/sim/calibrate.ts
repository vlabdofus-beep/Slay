// Chiffrage des effets d'objets par simulation : `node src/sim/calibrate.ts [N]`
//
// Le bot joue N runs (moitié Iop, moitié Crâ, mêmes graines pour toutes les configurations) sans objets,
// avec un seul effet ajouté. On mesure l'étage moyen atteint et on le compare à la référence :
//   1. Étalon : « au début de chaque tour, inflige n dégâts » → combien d'étages vaut 1 point.
//   2. Déclencheurs : déclencheur + « inflige 3 dégâts » → fréquence mesurée.
//   3. Récompenses : « au début de chaque tour » + récompense → valeur mesurée.
//   4. Prospection : +50 et +100 de prospection → points de prospection par point de budget.
// Le script affiche les valeurs actuelles et mesurées ; les écarts importants se corrigent dans core/effects.ts.
import { BUDGET, REWARDS, RULE_IDS, TRIGGERS, rollEffect, type ItemEffect } from '../core/effects.ts';
import { Rng } from '../core/rng.ts';
import type { ClassId } from '../core/types.ts';
import { botRun, type BotOptions } from './bot.ts';

const N = Number(process.argv[2] ?? 2000);
const ONLY = process.argv[3]; // 'triggers' | 'rewards' | 'prosp'
const CLASSES: ClassId[] = ['iop', 'cra'];

function score(o: BotOptions): number {
  let s = 0;
  for (let i = 1; i <= N; i++) s += botRun(CLASSES[i % 2], i, { noItems: true, ...o }).floor;
  return s / N;
}
const fx = (trigger: string, reward: string, amount: number): ItemEffect => ({ kind: 'roll', parts: [{ trigger, reward, amount }] });

const base = score({});
const slopes = [2, 4].map((n) => (score({ extra: [fx('debut_tour', 'degats', n)] }) - base) / (4.5 * n));
const slope = (slopes[0] + slopes[1]) / 2;
console.log(`Référence : étage moyen ${base.toFixed(2)} ; 1 point ≈ ${slope.toFixed(4)} étage (${slopes.map((x) => x.toFixed(4)).join(' / ')})`);
// Base propre à chaque élément privilégié : orienter le deck change déjà le score.
const baseFavor: Record<string, number> = {};
const points = (o: BotOptions) => {
  const b = o.favor ? (baseFavor[o.favor] ??= score({ favor: o.favor })) : base;
  return (score(o) - b) / slope;
};

if (!ONLY || ONLY === 'triggers') {
console.log('\n── Déclencheurs (avec « inflige 3 dégâts », ou « soigne 3 » pour les fins de combat) ──');
console.log('déclencheur              fréquence actuelle  mesurée');
for (const t of TRIGGERS) {
  const won = t.kind === 'won';
  const p = points({ extra: [fx(t.id, won ? 'soin' : 'degats', 3)], favor: t.el });
  const measured = p / (3 * (won ? 0.9 : 1));
  const flag = Math.abs(measured - t.freq) > Math.max(0.6, t.freq * 0.35) ? '  ←' : '';
  console.log(`${t.id.padEnd(24)} ${t.freq.toFixed(1).padStart(18)}  ${measured.toFixed(2).padStart(7)}${flag}`);
}

}
if (!ONLY || ONLY === 'rewards') {
console.log('\n── Récompenses (avec « au début de chaque tour ») ──');
console.log('récompense        quantité  valeur actuelle  mesurée');
for (const r of REWARDS) {
  if (r.loot) continue;
  const a = Math.max(1, Math.min(r.max ?? 99, Math.round(7 / (4.5 * r.value))));
  const p = points({ extra: [fx('debut_tour', r.id, a)] });
  const measured = p / (4.5 * a);
  const flag = Math.abs(measured - r.value) > Math.max(0.4, r.value * 0.35) ? '  ←' : '';
  console.log(`${r.id.padEnd(17)} ${String(a).padStart(8)}  ${r.value.toFixed(2).padStart(15)}  ${measured.toFixed(2).padStart(7)}${flag}`);
}

}
if (!ONLY || ONLY === 'prosp') {
console.log('\n── Prospection (avec objets : la prospection ne sert qu\'au butin) ──');
const baseItems = score({ noItems: false });
for (const p of [50, 100]) {
  const pts = (score({ noItems: false, extraProspection: p }) - baseItems) / slope;
  console.log(`+${p} prospection ≈ ${pts.toFixed(1)} points → ${(pts > 0 ? p / pts : Infinity).toFixed(1)} prospection par point`);
}
}
if (!ONLY || ONLY === 'rules') {
  console.log('\n── Règles légendaires (points mesurés ; un mythique vise ' + BUDGET.mythique + ') ──');
  for (const r of RULE_IDS) {
    const p = points({ extra: [{ kind: 'rule', rule: r }] });
    console.log(`${r.padEnd(20)} ${p.toFixed(1).padStart(6)}`);
  }
}
if (!ONLY || ONLY === 'rarity') {
  console.log('\n── Effets tirés : points moyens mesurés par rareté (30 effets chacun) ──');
  const rng = new Rng(77);
  for (const r of ['commun', 'rare', 'mythique'] as const) {
    let sum = 0;
    for (let i = 0; i < 30; i++) sum += points({ extra: [rollEffect(r, rng)] });
    console.log(`${r.padEnd(10)} budget ${String(BUDGET[r]).padStart(3)}  mesuré ${(sum / 30).toFixed(1)}`);
  }
}
console.log('');
