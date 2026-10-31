// Partie à plusieurs : carte commune, vote, combat commun, récompenses à chacun, rejeu du journal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Party, type Member } from './party.ts';
import { botParty } from '../sim/party.ts';

const table = (n: number): Member[] => (['iop', 'cra', 'xelor', 'iop'] as const).slice(0, n).map((classe, i) => ({ name: `J${i + 1}`, classe, gender: 'm' }));

/** Fait passer le sanctuaire du dieu à tout le monde (première bénédiction proposée). */
function passGods(p: Party): void {
  p.runs.forEach((r, i) => {
    if (r.availableNodes()[0] !== 'dieu') return;
    p.apply([i, 'enterNode', 'dieu']);
    p.apply([i, 'takeBoon', r.god!.offer[0]]);
  });
}

test('Partie : une carte, des rencontres et un dieu communs ; des tirages personnels', () => {
  const p = new Party(table(3), 42);
  const [a, b, c] = p.runs;
  assert.deepEqual(Object.keys(a.map.nodes), Object.keys(b.map.nodes));
  assert.deepEqual(a.encounters, c.encounters);
  assert.equal(a.god!.id, b.god!.id);
  assert.notEqual(a.rng.next(), b.rng.next());
});

test('Partie : on ne vote qu\'une fois tout le monde sur la carte ; le sanctuaire se fait seul', () => {
  const p = new Party(table(2), 7);
  assert.deepEqual(p.voteOptions(), []);
  assert.throws(() => p.apply([0, 'enterNode', p.runs[0].map.starts[0]]), /vote/);
  passGods(p);
  assert.deepEqual(p.voteOptions(), p.runs[0].map.starts);
});

test('Partie : la majorité choisit tout de suite ; à égalité, tout le monde doit voter', () => {
  const p = new Party(table(3), 11);
  passGods(p);
  const [x, y] = p.voteOptions();
  p.apply([0, 'vote', x]);
  assert.equal(p.runs[0].position, null);
  p.apply([1, 'vote', x]);
  // 2 voix sur 3 : la table y va
  assert.equal(p.runs[2].position, x);
  const q = new Party(table(2), 11);
  passGods(q);
  q.apply([0, 'vote', x]);
  q.apply([1, 'vote', y ?? x]);
  assert.ok([x, y].includes(q.runs[0].position!));
  assert.equal(q.runs[0].position, q.runs[1].position);
});

test('Partie : un combat commun, un héros par joueur ; chacun joue pour lui seul', () => {
  const p = new Party(table(2), 5);
  passGods(p);
  const node = p.voteOptions()[0];
  p.apply([0, 'vote', node]);
  p.apply([1, 'vote', node]);
  const c = p.combat!;
  assert.ok(c);
  assert.equal(c.partySize, 2);
  assert.ok(p.runs.every((r, i) => r.combat === c && r.seat === i && r.phase === 'combat'));
  const hand1 = c.seats[1].hand.length;
  p.apply([0, 'c.playCard', 0, c.enemies[0].uid]);
  assert.equal(c.seats[1].hand.length, hand1);
  p.apply([0, 'c.endTurn']);
  assert.equal(c.turn, 1);
  p.apply([1, 'c.endTurn']);
  assert.equal(c.turn, 2);
});

test('Partie : à la fin du combat, chacun a sa récompense ; un héros tombé revient avec 1 PV', () => {
  const p = new Party(table(2), 9);
  passGods(p);
  const node = p.voteOptions()[0];
  p.apply([0, 'vote', node]);
  p.apply([1, 'vote', node]);
  const c = p.combat!;
  c.seats[1].player.hp = 0;
  for (const e of c.enemies) e.hp = 1;
  c.useSeat(0);
  while (c.outcome === 'ongoing') {
    const a = c.legalActions().find((x) => x.type === 'play');
    if (!a || a.type !== 'play') { p.apply([0, 'c.endTurn']); continue; }
    p.apply([0, 'c.playCard', a.handIndex, a.target ?? null]);
  }
  assert.equal(c.outcome, 'won');
  assert.equal(p.combat, null);
  assert.ok(p.runs.every((r) => r.phase === 'reward' && r.reward));
  assert.equal(p.runs[1].hp, 1);
  assert.notDeepEqual(p.runs[0].reward!.cards, null);
});

test('Partie : des parties entières à 1, 2, 3 et 4 joueurs se terminent, et le journal les rejoue à l\'identique', () => {
  for (const n of [1, 2, 3, 4]) {
    const r = botParty(table(n), 100 + n);
    assert.notEqual(r.end, 'bloqué', `${n} joueurs : partie bloquée`);
    const p = new Party(table(n), 100 + n);
    for (const a of r.log) p.apply(a);
    assert.equal(p.over, r.end);
    assert.equal((p.runs[0].act - 1) * p.runs[0].map.floors + p.runs[0].stats.floor, r.floor);
  }
});
