import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat, calcDamage } from './combat.ts';
import { LIBRARY, newCard, starterDeck } from '../data/library.ts';
import { playGreedy } from '../sim/policy.ts';

const noDef = { status: {}, weak: [], resist: [] } as const;
const noAtk = { status: {}, dom: 0 };

function setup(enemies: string[], hand: string[], hp = 70) {
  const c = new Combat(LIBRARY, starterDeck('cra'), { hp, maxHp: 70 }, enemies, 42);
  c.hand = hand.map((id) => newCard(id));
  c.player.energy = 3;
  return c;
}

test('calcDamage : puissance, faiblesse, vulnérabilité, faiblesse/résistance élémentaire', () => {
  assert.equal(calcDamage(6, 'terre', noAtk, noDef), 6);
  assert.equal(calcDamage(6, 'terre', { status: { puissance: 2 }, dom: 1 }, noDef), 9);
  assert.equal(calcDamage(8, 'terre', { status: { faiblesse: 1 }, dom: 0 }, noDef), 6);
  assert.equal(calcDamage(6, 'terre', noAtk, { ...noDef, status: { vulnerabilite: 1 } }), 9);
  assert.equal(calcDamage(6, 'feu', noAtk, { ...noDef, weak: ['feu'] }), 9);
  assert.equal(calcDamage(6, 'terre', noAtk, { ...noDef, resist: ['terre'] }), 3);
  assert.equal(calcDamage(6, 'neutre', noAtk, { ...noDef, weak: ['feu'], resist: ['terre'] }), 6);
});

test('une faiblesse élémentaire s\'applique sur chaque coup d\'une attaque multi-coups', () => {
  const c = setup(['tofu'], ['iop_zenith']); // 7 air x2, Tofu faible à l'air
  c.enemies[0].hp = 999;
  c.enemies[0].status = {}; // sans son esquive d'Agilité
  const before = c.enemies[0].hp;
  c.playCard(0);
  assert.equal(before - c.enemies[0].hp, 20); // floor(7*1.5)=10, deux fois
});

test('l\'armure absorbe avant les PV ; la brûlure se fait aussi absorber', () => {
  const c = setup(['bouftou'], ['iop_sentence']);
  const e = c.enemies[0];
  e.block = 3;
  const before = e.hp;
  c.playCard(0); // 5 feu x1.5 = 7 ; 3 absorbés ; 4 PV perdus ; brûlure 2
  assert.equal(before - e.hp, 4);
  assert.equal(e.status.brulure, 2);
  c.hand = [];
  c.endTurn();
  assert.equal(e.status.brulure, 1); // -1 par round
});

test('le drain rend les PV réellement retirés', () => {
  const c = setup(['prespic'], ['cra_fleche_devorante'], 50);
  c.enemies[0].block = 0;
  c.playCard(0); // drain 7 feu, Prespic neutre au feu => 7 PV perdus, 7 rendus ; ses épines renvoient 1
  assert.equal(c.player.hp, 56);
});

test('une attaque de zone et un statut de zone touchent tous les ennemis', () => {
  const c = setup(['prespic', 'prespic'], ['iop_epee_destructrice']);
  const before = c.enemies.map((e) => e.hp);
  c.playCard(0);
  c.enemies.forEach((e, i) => {
    assert.ok(e.hp < before[i]);
    assert.equal(e.status.vulnerabilite, 1);
  });
});

test('jouer sans assez de PA ou une cible invalide lève une erreur', () => {
  const c = setup(['bouftou'], ['iop_colere']);
  c.player.energy = 2;
  assert.throws(() => c.playCard(0), /PA/);
  c.player.energy = 3;
  assert.throws(() => c.playCard(0, 99), /Cible/);
});

test('l\'intention d\'un monstre annonce les bons dégâts', () => {
  const c = setup(['bouftou'], []);
  assert.deepEqual(
    { n: c.intent(c.enemies[0]).damage, h: c.intent(c.enemies[0]).hits },
    { n: 7, h: 1 },
  );
  c.player.status.vulnerabilite = 1;
  assert.equal(c.intent(c.enemies[0]).damage, 10);
});

test('la pioche se remélange avec la défausse', () => {
  const c = new Combat(LIBRARY, starterDeck('iop'), { hp: 80, maxHp: 80 }, ['bouftou'], 3);
  c.hand = [];
  c.discardPile = [...c.drawPile.splice(0, c.drawPile.length)];
  assert.equal(c.drawPile.length, 0);
  c.endTurn(); // nouvelle main : doit venir de la défausse remélangée
  assert.equal(c.hand.length, 5);
});

test('déterminisme : même seed => même combat', () => {
  const run = (seed: number) => {
    const c = new Combat(LIBRARY, starterDeck('cra'), { hp: 70, maxHp: 70 }, ['tofu', 'tofu'], seed);
    playGreedy(c);
    return JSON.stringify([c.result(), c.log]);
  };
  assert.equal(run(7), run(7));
});

test('fin de combat propre : seuls les PV survivent', () => {
  const c = new Combat(LIBRARY, starterDeck('iop'), { hp: 80, maxHp: 80 }, ['tofu'], 5);
  playGreedy(c);
  const r = c.result();
  assert.deepEqual(Object.keys(r).sort(), ['hp', 'kamasStolen', 'outcome', 'prospection', 'revived', 'turns']);
  assert.throws(() => c.playCard(0), /terminé/);
});

test('un combat gagné se termine, un combat perdu aussi', () => {
  const win = new Combat(LIBRARY, starterDeck('iop'), { hp: 80, maxHp: 80 }, ['tofu'], 1);
  playGreedy(win);
  assert.equal(win.outcome, 'won');
  const lose = new Combat(LIBRARY, starterDeck('iop'), { hp: 1, maxHp: 80 }, ['bouftou_royal'], 1);
  playGreedy(lose);
  assert.equal(lose.outcome, 'lost');
});
