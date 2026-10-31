import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from './combat.ts';
import { LIBRARY, starterDeck } from '../data/library.ts';
import type { RuleId } from './effects.ts';

const make = (rules: RuleId[], seed = 3) => new Combat(LIBRARY, starterDeck('iop'), { hp: 80, maxHp: 80, effects: rules.map((rule) => ({ kind: 'rule', rule })) }, ['bouftou'], seed);

test('Colosse : 2 puissance pour le joueur et pour les monstres', () => {
  const c = make(['colosse']);
  assert.equal(c.player.status.puissance, 2);
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
