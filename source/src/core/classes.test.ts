import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat, type PlayerInit } from './combat.ts';
import { VISEE } from './classes.ts';
import type { ClassId } from './types.ts';
import { ALL_CARDS } from '../data/cards.ts';
import { LIBRARY, newCard, rewardPool, starterDeck } from '../data/library.ts';

function combatWith(classe: ClassId | undefined, hand: string[], extra: Partial<PlayerInit> = {}) {
  const c = new Combat(LIBRARY, starterDeck(classe ?? 'iop'), { hp: 50, maxHp: 80, classe, ...extra }, ['bouftou'], 11);
  c.hand = hand.map((id) => newCard(id));
  c.player.energy = 9;
  const e = c.enemies[0];
  e.block = 0; e.hp = 500; e.maxHp = 500; e.def = { ...e.def, weak: [], resist: [], powers: [] };
  e.status = {};
  return c;
}

test('Courroux : 3 attaques dans le tour donnent 1 puissance', () => {
  const c = combatWith('iop', ['iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee']);
  for (let i = 0; i < 3; i++) c.playCard(0, c.enemies[0].uid);
  c.enemies[0].status.etourdi = 1;
  c.endTurn();
  assert.equal(c.player.status.puissance, 1);
});

test('Courroux : 2 attaques ne suffisent pas, et le Crâ ne l\'a pas', () => {
  const a = combatWith('iop', ['iop_coup_epee', 'iop_coup_epee']);
  a.playCard(0, a.enemies[0].uid); a.playCard(0, a.enemies[0].uid);
  a.endTurn();
  assert.equal(a.player.status.puissance ?? 0, 0);
  const b = combatWith('cra', ['cra_coup_arc', 'cra_coup_arc', 'cra_coup_arc']);
  for (let i = 0; i < 3; i++) b.playCard(0, b.enemies[0].uid);
  b.endTurn();
  assert.equal(b.player.status.puissance ?? 0, 0);
});

test(`Visée : la ${VISEE}e attaque inflige le double`, () => {
  const c = combatWith('cra', Array(VISEE + 1).fill('cra_coup_arc'));
  const e = c.enemies[0];
  const lost: number[] = [];
  for (let i = 0; i <= VISEE; i++) {
    const before = e.hp;
    c.playCard(0, e.uid);
    lost.push(before - e.hp);
  }
  assert.deepEqual(lost, [...Array(VISEE - 1).fill(6), 12, 6]);
});

test('Visée : les cartes de charge rapprochent le tir doublé sans le déclencher', () => {
  const c = combatWith('cra', ['cra_balise_tactique', 'cra_balise_tactique', 'cra_coup_arc']);
  c.playCard(0); c.playCard(0);
  assert.equal(c.aim, VISEE - 1);
  assert.ok(c.aimReady());
  const e = c.enemies[0], before = e.hp;
  c.playCard(c.hand.findIndex((i) => i.id === 'cra_coup_arc'), e.uid);
  assert.equal(before - e.hp, 12);
  assert.equal(c.aim, 0);
});

test('pouvoir : reste en jeu et se déclenche chaque tour', () => {
  const c = combatWith('iop', ['iop_vertu']);
  c.playCard(0);
  assert.equal(c.discardPile.length + c.exhaustPile.length, 0);
  assert.equal(c.powers[0]?.id, 'iop_vertu');
  c.enemies[0].status.etourdi = 1;
  c.endTurn();
  assert.equal(c.player.status.bouclier, 3);
});

test('pouvoir à règle : Conquête renvoie la moitié des dégâts subis', () => {
  const c = combatWith('iop', ['iop_conquete']);
  c.playCard(0);
  assert.ok(c.rules.has('renvoi_moitie'));
});

test('bonus : Massacre grossit avec les attaques du tour, Fureur avec ses lancers', () => {
  const c = combatWith('iop', ['iop_coup_epee', 'iop_coup_epee', 'iop_massacre', 'iop_fureur', 'iop_fureur']);
  const e = c.enemies[0];
  c.playCard(0, e.uid); c.playCard(0, e.uid);
  let before = e.hp;
  c.playCard(0, e.uid);
  assert.equal(before - e.hp, 2 + 3 * 2);
  before = e.hp; c.playCard(0, e.uid);
  assert.equal(before - e.hp, 7);
  before = e.hp; c.playCard(0, e.uid);
  assert.equal(before - e.hp, 7 + 4);
});

test('Vendetta double le poison, les sorts de sang coûtent des PV', () => {
  const c = combatWith('cra', ['cra_vendetta']);
  c.enemies[0].status.poison = 5;
  c.playCard(0, c.enemies[0].uid);
  assert.equal(c.enemies[0].status.poison, 10);
  const i = combatWith('iop', ['iop_precipitation']);
  i.playCard(0);
  assert.equal(i.player.hp, 47);
  assert.equal(i.player.energy, 11);
});

test('au moins 50 nouvelles cartes jouables, des pouvoirs et des armes neutres dans les récompenses', () => {
  const classCards = ALL_CARDS.filter((c) => c.rarity !== 'base');
  assert.ok(classCards.length >= 87, `${classCards.length} cartes`);
  assert.ok(ALL_CARDS.some((c) => c.type === 'pouvoir' && c.classe === 'iop'));
  assert.ok(ALL_CARDS.some((c) => c.type === 'pouvoir' && c.classe === 'cra'));
  assert.ok(rewardPool('iop').includes('arme_marteau'));
  assert.ok(!rewardPool('iop').some((id) => id.startsWith('cra_')));
  // Toutes les cartes se jouent sans erreur (améliorées ou non).
  for (const def of ALL_CARDS) for (const up of [false, true]) {
    const c = combatWith(def.classe === 'neutre' ? 'iop' : def.classe as ClassId, []);
    c.hand = [{ ...newCard(def.id), upgraded: up }];
    c.playCard(0, def.target === 'enemy' ? c.enemies[0].uid : undefined);
  }
});
