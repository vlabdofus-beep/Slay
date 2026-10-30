// Simulations headless : `npm run sim [N]`
// Base de comparaison entre réglages (joueur glouton, cartes au hasard, items choisis par valeur).
import { Combat, type MonsterScale } from '../core/combat.ts';
import { computeLoadout, type Equipment } from '../core/loadout.ts';
import { itemOffer } from '../core/offers.ts';
import { Rng } from '../core/rng.ts';
import type { CardInstance, ClassId } from '../core/types.ts';
import { ELEMENTS } from '../core/types.ts';
import { ITEMS } from '../data/items.ts';
import { ACT1_SCALE, ENCOUNTERS, encountersOfTier, type EncounterTier } from '../data/monsters.ts';
import { CLASS_START_HP, LIBRARY, newCard, rewardPool, starterDeck } from '../data/library.ts';
import { chooseItem, equip } from './itemPolicy.ts';
import { playGreedy } from './policy.ts';

const N = Number(process.argv[2] ?? 500);
const CLASSES: ClassId[] = ['iop', 'cra'];
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const f1 = (x: number) => x.toFixed(1);

function fight(deck: CardInstance[], eq: Equipment, hp: number, maxHp: number, encounter: string, seed: number, scale: MonsterScale) {
  const l = computeLoadout(LIBRARY, deck, eq, ITEMS);
  const c = new Combat(
    LIBRARY, deck,
    { hp, maxHp, dom: l.dom, blockBonus: l.blockBonus, passives: l.passives, actives: l.actives },
    ENCOUNTERS[encounter].monsters, seed, scale,
  );
  playGreedy(c);
  return c.result();
}

// ── 1. Chaque rencontre, deck de départ, PV pleins ──
console.log(`\n=== Deck de départ, sans items, PV pleins, coef. monstres x${ACT1_SCALE.hp} (${N} combats par case) ===`);
console.log('rencontre        palier   ' + CLASSES.map((c) => `${c}: victoires / PV perdus / tours`.padEnd(36)).join(''));
for (const enc of Object.keys(ENCOUNTERS)) {
  const cols = CLASSES.map((classe) => {
    const maxHp = CLASS_START_HP[classe] as number;
    let wins = 0, lost = 0, turns = 0;
    for (let s = 1; s <= N; s++) {
      const r = fight(starterDeck(classe), {}, maxHp, maxHp, enc, s, ACT1_SCALE);
      turns += r.turns;
      if (r.outcome === 'won') { wins++; lost += maxHp - r.hp; }
    }
    return `${pct(wins / N).padStart(5)} / ${f1(wins ? lost / wins : 0).padStart(5)} / ${f1(turns / N).padStart(4)}`.padEnd(36);
  });
  console.log(`${enc.padEnd(16)} ${ENCOUNTERS[enc].tier.padEnd(8)} ${cols.join('')}`);
}

// ── 2. Acte 1 complet ──
type Stage = EncounterTier | 'repos';
const ACT: Stage[] = ['faible', 'faible', 'normal', 'normal', 'elite', 'repos', 'normal', 'normal', 'elite', 'repos', 'boss'];

interface ActStats {
  maxHp: number;
  survivedElite1: number;
  reachedBoss: number;
  hpBeforeBoss: number;
  beatBoss: number;
  // diagnostics items (mesurés à l'arrivée au boss)
  items: number;
  fullSet: number;
  palier2: number;
  twoPaths: number;
  multi: number;
  sets: Record<string, number>;
}

function simulateAct(classe: ClassId, scale: MonsterScale, withItems: boolean): ActStats {
  const baseHp = CLASS_START_HP[classe] as number;
  const st: ActStats = { maxHp: baseHp, survivedElite1: 0, reachedBoss: 0, hpBeforeBoss: 0, beatBoss: 0,
    items: 0, fullSet: 0, palier2: 0, twoPaths: 0, multi: 0, sets: {} };
  const iElite = ACT.indexOf('elite');
  for (let s = 1; s <= N; s++) {
    const rng = new Rng(s * 7919 + 1);
    const deck = starterDeck(classe);
    const pool = rewardPool(classe);
    let eq: Equipment = {};
    let hp = baseHp;
    let hallway = 0;
    const maxHpOf = () => baseHp + computeLoadout(LIBRARY, deck, eq, ITEMS).pvBonus;
    const offerItem = (rarity: 'commun' | 'rare') => {
      const offer = itemOffer({ cards: LIBRARY, items: ITEMS, deck, equipment: eq }, rarity, rng);
      const pick = chooseItem(LIBRARY, ITEMS, deck, eq, offer);
      if (!pick) return;
      const before = maxHpOf();
      eq = equip(ITEMS, eq, pick);
      const after = maxHpOf();
      hp = after > before ? hp + (after - before) : Math.min(hp, after);
    };
    for (let i = 0; i < ACT.length; i++) {
      const stage = ACT[i];
      const maxHp = maxHpOf();
      if (stage === 'repos') {
        if (hp < maxHp * 0.6) hp = Math.min(maxHp, hp + Math.round(maxHp * 0.3));
        else {
          const candidates = deck.filter((c) => !c.upgraded);
          if (candidates.length) rng.pick(candidates).upgraded = true;
        }
        continue;
      }
      if (stage === 'boss') {
        st.reachedBoss++;
        st.hpBeforeBoss += hp;
        const l = computeLoadout(LIBRARY, deck, eq, ITEMS);
        st.items += Object.keys(eq).length;
        const full = Object.entries(l.sets).filter(([, n]) => n >= 4).map(([id]) => id);
        if (full.length) st.fullSet++;
        for (const id of full) st.sets[id] = (st.sets[id] ?? 0) + 1;
        if (ELEMENTS.some((el) => l.paliers[el as 'terre'] >= 2)) st.palier2++;
        if (ELEMENTS.filter((el) => l.paliers[el as 'terre'] >= 1).length >= 2) st.twoPaths++;
        if ((l.sets.microplie ?? 0) >= 2 || l.passives.prisme >= 1) st.multi++;
      }
      const enc = rng.pick(encountersOfTier(stage));
      const r = fight(deck, eq, hp, maxHp, enc, s * 31 + i, scale);
      if (r.outcome === 'lost') break;
      hp = r.hp;
      if (i === iElite) st.survivedElite1++;
      if (stage === 'boss') { st.beatBoss++; break; }
      deck.push(newCard(rng.pick(rng.shuffle([...pool]).slice(0, 3))));
      if (withItems) {
        if (stage === 'elite') offerItem('rare');
        else if (++hallway % 2 === 0) offerItem('commun');
      }
    }
  }
  return st;
}

console.log(`\n=== Acte 1 complet (${N} runs par ligne) ===`);
console.log('Étapes : ' + ACT.join(' → '));
console.log('Récompenses : 1 carte au hasard parmi 3 après chaque combat ; avec items : 1 item parmi 3');
console.log('tous les 2 combats de couloir, 1 item rare parmi 3 après chaque élite.');
console.log('\ncoef.  items  classe  survie 1er élite  atteint boss  PV arrivée  bat le boss');
for (const k of [1.1, 1, 0.9]) {
  for (const withItems of [false, true]) {
    for (const classe of CLASSES) {
      const r = simulateAct(classe, { hp: k, damage: k }, withItems);
      console.log(
        `x${String(k).padEnd(5)} ${(withItems ? 'oui' : 'non').padEnd(6)} ${classe.padEnd(7)} ${pct(r.survivedElite1 / N).padStart(16)}  ` +
        `${pct(r.reachedBoss / N).padStart(12)}  ${f1(r.reachedBoss ? r.hpBeforeBoss / r.reachedBoss : 0).padStart(10)}  ${pct(r.beatBoss / N).padStart(11)}`,
      );
    }
  }
}

console.log(`\n=== Diagnostic des items à l'arrivée au boss (coef. x${ACT1_SCALE.hp}, avec items) ===`);
for (const classe of CLASSES) {
  const r = simulateAct(classe, ACT1_SCALE, true);
  const n = r.reachedBoss || 1;
  console.log(`${classe}: ${f1(r.items / n)} items portés ; panoplie complète ${pct(r.fullSet / n)} ` +
    `(${Object.entries(r.sets).map(([id, c]) => `${id} ${pct(c / n)}`).join(', ') || '—'}) ; ` +
    `palier 2+ ${pct(r.palier2 / n)} ; 2 voies au palier 1 ${pct(r.twoPaths / n)} ; multi (Microplie 2+ ou prisme) ${pct(r.multi / n)}`);
}
console.log('');
