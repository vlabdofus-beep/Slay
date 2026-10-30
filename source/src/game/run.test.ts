import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, MAP_FLOORS } from '../core/map.ts';
import { ITEMS } from '../data/items.ts';
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

test('butin : les élites donnent toujours un objet (jamais commun), la prospection est conservée dans la récompense', () => {
  let elites = 0;
  for (let seed = 1; seed <= 12 && elites < 3; seed++) {
    const run = new Run('iop', seed);
    while (run.phase !== 'defeat' && run.phase !== 'victory') {
      if (run.phase === 'map') {
        const next = run.availableNodes().map((id) => run.map.nodes[id]);
        run.enterNode((next.find((n) => n.type === 'elite') ?? next[0]).id);
      } else if (run.phase === 'combat') {
        run.combat!.player.hp = run.combat!.player.maxHp = 999; // on veut voir des élites, pas perdre
        playGreedy(run.combat!);
        run.checkCombatEnd();
      } else if (run.phase === 'reward') {
        const r = run.reward!;
        assert.ok(r.prospection >= 0);
        if (run.node!.type === 'elite') {
          elites++;
          assert.equal(r.itemSource, 'elite');
          assert.equal(r.items.length, 3);
          assert.ok(r.items.every((id) => ITEMS.items[id].rarity !== 'commun'));
        }
        run.leaveReward();
      } else if (run.phase === 'zaap') run.leaveZaap();
    }
  }
  assert.ok(elites >= 1);
});

test('chaque objet a un effet tiré pour la run, identique pour une même graine', () => {
  const a = new Run('cra', 5), b = new Run('cra', 5), c = new Run('cra', 6);
  assert.deepEqual(a.itemEffects, b.itemEffects);
  assert.notDeepEqual(a.itemEffects, c.itemEffects);
  for (const it of Object.values(ITEMS.items)) {
    const fx = a.itemEffects[it.id];
    assert.ok(fx, it.id);
    assert.equal(fx.kind === 'rule', it.rarity === 'legendaire', it.id);
  }
});

test('équiper un item qui donne des PV augmente aussi les PV actuels', () => {
  const run = new Run('cra', 2);
  run.hp = 50;
  const id = Object.values(ITEMS.items).find((it) => it.rarity === 'commun' && it.stats.pv)!.id; // +6 PV
  run.equip(id);
  assert.equal(run.maxHp, 76);
  assert.equal(run.hp, 56);
});

test('chaque case de combat connaît sa rencontre à l\'avance, et c\'est celle qu\'on affronte', async () => {
  const { ENCOUNTERS } = await import('../data/monsters.ts');
  const run = new Run('cra', 11);
  for (const n of Object.values(run.map.nodes)) {
    if (n.type === 'zaap') assert.equal(run.encounters[n.id], undefined);
    else assert.equal(ENCOUNTERS[run.encounters[n.id]].tier, Run.tierOf(n));
  }
  const first = run.availableNodes()[0];
  const expected = run.encounters[first];
  run.enterNode(first);
  assert.equal(run.encounter, expected);
});
