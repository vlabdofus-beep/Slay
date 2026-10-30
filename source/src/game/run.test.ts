import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, MAP_FLOORS } from '../core/map.ts';
import { resolveCard } from '../core/combat.ts';
import { LIBRARY } from '../data/library.ts';
import { playGreedy } from '../sim/policy.ts';
import { Run } from './run.ts';

test('carte : boss accessible depuis chaque départ, règles d\'étage respectées', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const m = generateMap(seed);
    assert.ok(m.nodes.boss && m.nodes.boss.type === 'boss');
    assert.ok(m.starts.length >= 2);
    for (const start of m.starts) {
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
        const id = stack.pop() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...m.nodes[id].next);
      }
      assert.ok(seen.has('boss'), `seed ${seed} : boss inaccessible depuis ${start}`);
    }
    for (const n of Object.values(m.nodes)) {
      if (n.type !== 'boss') assert.ok(n.next.length >= 1);
      if (n.floor <= 3) assert.equal(n.type, 'combat');
      if (n.floor < 5) assert.ok(n.type !== 'elite' && n.type !== 'zaap');
      if (n.floor === MAP_FLOORS) assert.equal(n.type, 'zaap');
      if (n.floor === MAP_FLOORS - 1) assert.notEqual(n.type, 'zaap');
      for (const c of n.next.map((id) => m.nodes[id])) {
        if (n.type === 'elite' || (n.type === 'zaap' && c.type !== 'boss' && n.floor !== MAP_FLOORS)) {
          assert.notEqual(c.type, n.type, `seed ${seed} : ${n.type} suivi de ${c.type}`);
        }
      }
    }
  }
});

/** Joue une run complète avec le bot : 1re route disponible, 1re carte, 1er item, repos ou amélioration au Zaap. */
function autoplay(run: Run): void {
  let guard = 0;
  while (run.phase !== 'victory' && run.phase !== 'defeat') {
    if (++guard > 500) throw new Error('Run bloquée');
    switch (run.phase) {
      case 'map':
        run.enterNode(run.availableNodes()[0]);
        break;
      case 'combat':
        playGreedy(run.combat!);
        run.checkCombatEnd();
        break;
      case 'reward':
        run.takeCard(run.reward!.cards[0]);
        if (run.reward!.items.length) run.takeItem(run.reward!.items[0]);
        run.leaveReward();
        break;
      case 'zaap': {
        const up = run.deck.find((c) => !c.upgraded);
        if (run.hp < run.maxHp * 0.6 || !up) run.zaapRest();
        else run.zaapUpgrade(up.uid);
        run.leaveZaap();
        break;
      }
    }
  }
}

test('une run se joue de bout en bout (victoire ou défaite), de façon déterministe', () => {
  const outcomes: string[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    for (const classe of ['iop', 'cra'] as const) {
      const a = new Run(classe, seed);
      autoplay(a);
      const b = new Run(classe, seed);
      autoplay(b);
      assert.deepEqual([a.phase, a.hp, a.stats], [b.phase, b.hp, b.stats]);
      outcomes.push(a.phase);
      if (a.phase === 'victory') assert.equal(a.position, 'boss');
    }
  }
  assert.ok(outcomes.includes('victory'), 'au moins une victoire sur 40 runs');
});

test('cadence des récompenses : item commun tous les 2 combats de couloir, rare après un élite', () => {
  const run = new Run('iop', 3);
  const rewards: (string | null)[] = [];
  while (run.phase !== 'defeat' && run.phase !== 'victory' && rewards.length < 6) {
    if (run.phase === 'map') {
      const next = run.availableNodes().map((id) => run.map.nodes[id]);
      run.enterNode((next.find((n) => n.type === 'combat') ?? next[0]).id);
    } else if (run.phase === 'combat') {
      playGreedy(run.combat!);
      run.checkCombatEnd();
    } else if (run.phase === 'reward') {
      rewards.push(run.node!.type === 'elite' ? `elite:${run.reward!.itemRarity}` : run.reward!.itemRarity);
      run.leaveReward();
    } else if (run.phase === 'zaap') {
      run.leaveZaap();
    }
  }
  const hallway = rewards.filter((r) => !String(r).startsWith('elite'));
  assert.deepEqual(hallway.slice(0, 4), [null, 'commun', null, 'commun']);
  for (const r of rewards.filter((x) => String(x).startsWith('elite'))) assert.equal(r, 'elite:rare');
});

test('forgemagie : change l\'élément de la carte et de ses dégâts, une seule action par Zaap', () => {
  const run = new Run('iop', 1);
  run.phase = 'zaap';
  const strike = run.deck.find((c) => c.id === 'iop_coup_epee')!;
  run.zaapForge(strike.uid, 'feu');
  const def = resolveCard(LIBRARY, strike);
  assert.equal(def.element, 'feu');
  assert.ok(def.effects.every((fx) => fx.type !== 'damage' || fx.element === 'feu'));
  assert.equal(run.loadout().affinity.feu, 1);
  assert.throws(() => run.zaapRest(), /déjà utilisé/);
});

test('équiper un item qui donne des PV augmente aussi les PV actuels', () => {
  const run = new Run('cra', 2);
  run.hp = 50;
  run.equip('item_10784'); // Amulette de l'intrépide : +6 PV
  assert.equal(run.maxHp, 76);
  assert.equal(run.hp, 56);
});
