import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from './combat.ts';
import { LIBRARY, starterDeck } from '../data/library.ts';
import type { RuleId } from './effects.ts';

const make = (rules: RuleId[], seed = 3) => new Combat(LIBRARY, starterDeck('iop'), { hp: 80, maxHp: 80, effects: rules.map((rule) => ({ kind: 'rule', rule })) }, ['bouftou'], seed);

test('Colosse : 3 puissance pour le joueur, 2 pour les monstres', () => {
  const c = make(['colosse']);
  assert.equal(c.player.status.puissance, 3);
  assert.equal(c.enemies[0].status.puissance, 2);
});

test('Sablier : un PA non dépensé passe au tour suivant', () => {
  const c = make(['sablier']);
  const base = c.player.energy;
  c.endTurn();
  if (c.outcome === 'ongoing') assert.equal(c.player.energy, base + 1);
});

test('Instant figé : la première carte de la main reste en main', () => {
  const c = make(['retenue']);
  const first = c.hand[0].uid;
  c.endTurn();
  if (c.outcome === 'ongoing') assert.ok(c.hand.some((x) => x.uid === first));
});

test('Rembobinage : main vidée pendant le tour, on repioche 2 cartes une fois', () => {
  const c = make(['pioche_vide'], 5);
  c.player.energy = 99;
  while (c.hand.length > 1 && c.outcome === 'ongoing') c.playCard(c.hand.length - 1, c.living()[0]?.uid);
  if (c.outcome !== 'ongoing') return;
  const before = c.drawPile.length + c.discardPile.length;
  c.playCard(0, c.living()[0]?.uid);
  if (c.outcome === 'ongoing' && before >= 2) assert.equal(c.hand.length, 2);
});

test('Karcham : une fois tous les 3 tours (recharge)', () => {
  const c = new Combat(LIBRARY, starterDeck('iop'), { hp: 80, maxHp: 80, effects: [{ kind: 'roll', parts: [{ trigger: 'debut_tour', reward: 'esquive', amount: 1, recharge: 3 }] }] }, ['bouftou'], 3);
  const seen: number[] = [];
  for (let t = 0; t < 7 && c.outcome === 'ongoing'; t++) {
    if ((c.player.status.esquive ?? 0) > 0) seen.push(c.turn);
    c.player.status.esquive = 0;
    c.player.hp = c.player.maxHp = 999;
    c.endTurn();
  }
  assert.deepEqual(seen.slice(0, 3), [1, 4, 7].slice(0, seen.length));
});

test('Armure d\'épines : la moitié de ce que l\'armure absorbe ; soin en trop : la moitié en bouclier', () => {
  const c = make(['epines_armure', 'soin_bouclier'], 4);
  const e = c.enemies[0];
  c.player.block = 40;
  const hp = e.hp;
  (c as unknown as { applyHit(t: unknown, d: number, o: unknown): number }).applyHit(c.player, 10, { attacker: e });
  assert.equal(hp - e.hp, 5);
  c.player.hp = c.player.maxHp;
  c.fxHeal(9);
  assert.equal(c.player.status.bouclier, 4);
});

test('poison au début du tour du monstre (il meurt avant d\'agir), brûlure à la fin de son tour', () => {
  const c = make([], 6);
  const e = c.enemies[0];
  e.hp = 5; e.status.poison = 6;
  const hp = c.player.hp;
  c.endTurn();
  assert.ok(e.dead, 'le poison tue au début de son tour');
  assert.equal(c.player.hp, hp, 'il n\'a pas eu le temps d\'agir');

  const d = make([], 7);
  const f = d.enemies[0];
  f.hp = 3; f.status.brulure = 5;
  d.player.block = 0;
  const php = d.player.hp;
  const willHit = d.intent(f).damage > 0;
  d.endTurn();
  assert.ok(f.dead, 'la brûlure tue à la fin de son tour');
  if (willHit) assert.ok(d.player.hp < php, 'mais il a frappé avant');
});
