import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, MAP_FLOORS } from '../core/map.ts';
import { ITEMS } from '../data/items.ts';
import { ENCOUNTERS } from '../data/monsters.ts';
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
      if (n.floor === 1) assert.equal(n.type, 'combat');
      if (n.floor <= 3) assert.ok(n.type === 'combat' || n.type === 'evenement');
      if (n.floor < 5) assert.ok(n.type !== 'elite' && n.type !== 'zaap');
      if (n.floor < 4) assert.notEqual(n.type, 'marchand');
      if (n.floor === MAP_FLOORS) assert.equal(n.type, 'zaap');
      if (n.floor === MAP_FLOORS - 1) assert.notEqual(n.type, 'zaap');
      for (const c of n.next.map((id) => m.nodes[id])) {
        if (n.type === 'elite' || n.type === 'marchand' || (n.type === 'zaap' && c.type !== 'boss' && n.floor !== MAP_FLOORS)) {
          assert.notEqual(c.type, n.type, `seed ${seed} : ${n.type} suivi de ${c.type}`);
        }
      }
    }
    assert.ok(Object.values(m.nodes).some((n) => n.type === 'marchand'), `seed ${seed} : aucun marchand`);
    // Aucun croisement : pas d'arête (f, c) → (f+1, c+1) en même temps que (f, c+1) → (f+1, c).
    for (const n of Object.values(m.nodes)) {
      for (const id of n.next) {
        const t = m.nodes[id];
        if (t.type === 'boss' || t.col === n.col) continue;
        const other = m.nodes[`${n.floor}:${t.col}`];
        assert.ok(!other?.next.includes(`${t.floor}:${n.col}`), `seed ${seed} : chemins croisés à l'étage ${n.floor}`);
      }
    }
  }
});

/** Dieux, événements et choix en attente : la première option possible, la première carte. */
function stepExtra(run: Run): boolean {
  const p = run.pending;
  if (p) {
    if (p.kind === 'card') run.chooseCard(p.options[0]);
    else if (p.kind === 'item') run.chooseItem(p.options[0]);
    else run.resolvePick(run.pickCandidates(p.what)[0].uid);
    return true;
  }
  if (run.phase === 'dieu') { run.takeBoon(run.god!.offer[0]); return true; }
  if (run.phase === 'evenement') {
    const ev = run.event!;
    if (ev.chosen === null) {
      const i = [0, 1, 2, 3].find((k) => run.optionState(k).ok);
      run.chooseOption(i!);
    } else run.leaveEvent();
    return true;
  }
  return false;
}

/** Joue une run complète avec le bot : 1re route disponible, 1re carte, 1er item, repos ou amélioration au Zaap. */
function autoplay(run: Run): void {
  let guard = 0;
  while (run.phase !== 'victory' && run.phase !== 'defeat') {
    if (++guard > 500) throw new Error('Run bloquée');
    if (stepExtra(run)) continue;
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
      case 'marchand':
        run.leaveShop();
        break;
      case 'dofus':
        run.takeDofus(run.dofusOffer[0]);
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
  let act2 = 0;
  for (let seed = 1; seed <= 20; seed++) {
    for (const classe of ['iop', 'cra'] as const) {
      const a = new Run(classe, seed);
      autoplay(a);
      const b = new Run(classe, seed);
      autoplay(b);
      assert.deepEqual([a.phase, a.hp, a.stats], [b.phase, b.hp, b.stats]);
      outcomes.push(a.phase);
      if (a.act >= 2 || a.stats.floor >= 6) act2++;
      if (a.phase === 'victory') assert.equal(a.position, 'boss');
    }
  }
  assert.ok(outcomes.every((o) => o === 'victory' || o === 'defeat'));
  assert.ok(act2 > 0, 'au moins une run dépasse la mi-acte sur 40');
});

test('butin : les élites donnent toujours un objet (jamais commun), la prospection est conservée dans la récompense', () => {
  let elites = 0;
  for (let seed = 1; seed <= 12 && elites < 3; seed++) {
    const run = new Run('iop', seed);
    while (run.phase !== 'defeat' && run.phase !== 'victory') {
      if (stepExtra(run)) continue;
      if (run.phase === 'map' && run.availableNodes()[0] === 'dieu') run.enterNode('dieu');
      else if (run.phase === 'map') {
        const next = run.availableNodes().map((id) => run.map.nodes[id]);
        run.enterNode((next.find((n) => n.type === 'elite') ?? next[0]).id);
      } else if (run.phase === 'combat') {
        run.combat!.player.hp = run.combat!.player.maxHp = 999; // on veut voir des élites, pas perdre
        playGreedy(run.combat!);
        run.checkCombatEnd();
      } else if (run.phase === 'reward') {
        const r = run.reward!;
        assert.ok(r.prospection >= 0);
        if (run.node!.type === 'elite' && run.reward!.itemSource) {
          elites++;
          assert.equal(r.itemSource, 'elite');
          assert.equal(r.items.length, 3);
          assert.ok(r.items.every((id) => ITEMS.items[id].rarity !== 'commun'));
        }
        run.leaveReward();
      } else if (run.phase === 'zaap') run.leaveZaap();
      else if (run.phase === 'marchand') run.leaveShop();
      else if (run.phase === 'dofus') run.takeDofus(run.dofusOffer[0]);
    }
  }
  assert.ok(elites >= 1);
});

test('chaque objet a un effet tiré pour la run, identique pour une même graine', () => {
  const a = new Run('cra', 5, 'm', { gods: false }), b = new Run('cra', 5, 'm', { gods: false }), c = new Run('cra', 6, 'm', { gods: false });
  assert.deepEqual(a.itemEffects, b.itemEffects);
  assert.notDeepEqual(a.itemEffects, c.itemEffects);
  for (const it of Object.values(ITEMS.items)) {
    const fx = a.itemEffects[it.id];
    assert.ok(fx, it.id);
    assert.equal(fx.kind === 'rule', it.rarity === 'legendaire', it.id);
  }
});

test('équiper un item qui donne des PV augmente aussi les PV actuels', () => {
  const run = new Run('cra', 2, 'm', { gods: false });
  run.hp = 50;
  const it = Object.values(ITEMS.items).find((x) => x.rarity === 'commun' && x.stats.pv)!;
  const bonus = it.stats.pv!;
  run.equip(it.id);
  assert.equal(run.maxHp, 70 + bonus);
  assert.equal(run.hp, 50 + bonus);
});

test('chaque case de combat connaît sa rencontre à l\'avance, et c\'est celle qu\'on affronte', async () => {
  const { ENCOUNTERS } = await import('../data/monsters.ts');
  const run = new Run('cra', 11, 'm', { gods: false });
  for (const n of Object.values(run.map.nodes)) {
    if (n.type === 'zaap' || n.type === 'marchand' || n.type === 'evenement') assert.equal(run.encounters[n.id], undefined);
    else assert.equal(ENCOUNTERS[run.encounters[n.id]].tier, Run.tierOf(n));
  }
  const first = run.availableNodes()[0];
  const expected = run.encounters[first];
  run.enterNode(first);
  assert.equal(run.encounter, expected);
});

test('marchand : acheter une carte, un objet, retirer une carte ; les kamas baissent', () => {
  const run = new Run('cra', 4, 'm', { gods: false });
  const shopNode = Object.values(run.map.nodes).find((n) => n.type === 'marchand')!;
  run.position = Object.values(run.map.nodes).find((n) => n.next.includes(shopNode.id))!.id;
  run.kamas = 1000;
  run.enterNode(shopNode.id);
  assert.equal(run.phase, 'marchand');
  const shop = run.shop!;
  assert.equal(shop.cards.length, 5);
  const deck = run.deck.length;
  run.buyCard(shop.cards[0].id);
  assert.equal(run.deck.length, deck + 1);
  assert.equal(run.kamas, 1000 - shop.cards[0].price);
  assert.throws(() => run.buyCard(shop.cards[0].id), /indisponible/);
  const item = shop.items[0];
  run.buyItem(item.id);
  assert.equal(run.equipment[ITEMS.items[item.id].slot], item.id);
  run.removeCard(run.deck[0].uid);
  assert.equal(run.deck.length, deck);
  assert.throws(() => run.removeCard(run.deck[0].uid), /indisponible/);
  run.kamas = 0;
  assert.throws(() => run.buyCard(shop.cards[1].id), /kamas/);
  run.leaveShop();
  assert.equal(run.phase, 'map');
});

test('boss des actes 1 et 2 : choix d\'un Dofus parmi 3, puis acte suivant avec PV au maximum', () => {
  const run = new Run('iop', 8, 'm', { gods: false });
  for (const act of [1, 2]) {
    run.position = Object.values(run.map.nodes).find((n) => n.next.includes('boss'))!.id;
    run.enterNode('boss');
    const c = run.combat!;
    c.enemies.forEach((e) => { e.hp = 0; e.dead = true; });
    c.outcome = 'won';
    run.hp = 10;
    run.checkCombatEnd();
    assert.equal(run.phase, 'dofus');
    assert.equal(run.dofusOffer.length, 3);
    run.takeDofus(run.dofusOffer[1]);
    assert.equal(run.act, act + 1);
    assert.equal(run.phase, 'map');
    assert.equal(run.hp, run.maxHp);
    assert.equal(run.dofus.length, act);
    // Les rencontres du nouvel acte appartiennent à cet acte
    for (const id of Object.values(run.encounters)) assert.equal(ENCOUNTERS[id].act, act + 1);
  }
});

test('Dokoko : une résurrection par run', () => {
  const run = new Run('iop', 2, 'm', { gods: false });
  run.dofus.push('dokoko');
  run.enterNode(run.availableNodes()[0]);
  const c = run.combat!;
  c.player.hp = 1;
  c.enemies[0].status.puissance = 200;
  c.hand = [];
  c.endTurn();
  assert.equal(c.outcome, 'ongoing');
  assert.ok(c.player.hp > 1);
  assert.equal(c.revived, true);
});
