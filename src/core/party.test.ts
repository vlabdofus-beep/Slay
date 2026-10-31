// Combat à plusieurs héros : tous jouent en même temps, les monstres jouent une fois et frappent tout le monde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from './combat.ts';
import type { ClassId, Effect, MonsterDef } from './types.ts';
import { LIBRARY, newCard, starterDeck } from '../data/library.ts';

/** Une table de héros contre des monstres neutres (500 PV) dont l'action est `effects`. */
function party(classes: ClassId[], effects: Effect[] = [{ type: 'damage', amount: 4, element: 'neutre', hits: 3 }], foes = 1, hp = 60) {
  const [first, ...rest] = classes;
  const c = new Combat(LIBRARY, starterDeck(first), { hp, maxHp: 70, classe: first }, Array(foes).fill('bouftou'), 7, undefined,
    rest.map((cl) => ({ deck: starterDeck(cl), init: { hp, maxHp: 70, classe: cl } })));
  for (const e of c.enemies) {
    const def: MonsterDef = { ...e.def, res: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 }, powers: [],
      moves: { coup: { name: 'Coup', effects } }, pattern: { kind: 'cycle', order: ['coup'] } };
    e.def = def; e.moveId = 'coup'; e.block = 0; e.hp = 500; e.maxHp = 500; e.status = {};
  }
  return c;
}
const hp = (c: Combat) => c.seats.map((s) => s.player.hp);

test('Table : un héros qui tombe pendant son tour ne bloque pas ceux qui sont déjà prêts', () => {
  const c = party(['iop', 'cra']);
  c.useSeat(0);
  c.endTurn();
  assert.equal(c.seats[0].ready, true);
  c.useSeat(1);
  c.seats[1].hand[0] = newCard('iop_pression');
  c.seats[1].player.hp = 6;
  c.enemies[0].def = { ...c.enemies[0].def, powers: [{ kind: 'epines', n: 20 }] };
  const turn = c.turn;
  c.playCard(0, c.enemies[0].uid);
  assert.ok(c.seats[1].player.hp <= 0);
  assert.equal(c.outcome, 'ongoing');
  assert.ok(c.turn > turn, 'la phase des monstres a eu lieu');
  assert.equal(c.seats[0].ready, false);
});

test('Table : chaque héros a sa main, ses PA et sa pioche', () => {
  const c = party(['iop', 'cra', 'xelor']);
  assert.equal(c.partySize, 3);
  for (const s of c.seats) {
    assert.equal(s.hand.length, 5);
    assert.equal(s.player.energy, 3);
  }
  assert.ok(c.seats[0].hand.every((i) => i.id.startsWith('iop_')));
  assert.ok(c.seats[1].hand.every((i) => i.id.startsWith('cra_')));
  assert.notEqual(c.seats[0].hand, c.seats[1].hand);
});

test('Table : jouer pour un héros ne touche ni la main ni les PA des autres', () => {
  const c = party(['iop', 'cra']);
  c.useSeat(1);
  const before = c.seats[0].hand.length;
  c.playCard(0, c.enemies[0].uid);
  assert.equal(c.seats[1].hand.length, 4);
  assert.ok(c.seats[1].player.energy < 3);
  assert.equal(c.seats[0].hand.length, before);
  assert.equal(c.seats[0].player.energy, 3);
});

test('Table : les monstres attendent que tous les héros soient prêts, puis jouent une fois', () => {
  const c = party(['iop', 'cra']);
  c.useSeat(0);
  c.endTurn();
  assert.equal(c.turn, 1);
  assert.deepEqual(hp(c), [60, 60]);
  assert.throws(() => c.playCard(0, c.enemies[0].uid), /fini son tour/);
  c.useSeat(1);
  c.endTurn();
  assert.equal(c.turn, 2);
  // Coup de 3 × 4 : chaque héros le reçoit en entier, une seule fois
  assert.deepEqual(hp(c), [48, 48]);
  assert.ok(c.seats.every((s) => !s.ready && s.hand.length === 5 && s.player.energy === 3));
});

test('Table : le ralenti protège chaque héros comme en solo', () => {
  const c = party(['xelor', 'iop']);
  c.useSeat(0);
  c.seats[0].hand = [newCard('xelor_ralentissement')];
  c.playCard(0, c.enemies[0].uid);
  c.endTurn();
  c.useSeat(1);
  c.endTurn();
  // Ralenti 3 : chacun perd 9 au lieu de 12
  assert.deepEqual(hp(c), [51, 51]);
});

test('Table : un statut ou une carte posés par un monstre vont à chaque héros', () => {
  const c = party(['iop', 'cra'], [
    { type: 'status', status: 'faiblesse', amount: 2, on: 'target' },
    { type: 'addCard', card: 'statut_blessure', count: 1, pile: 'discard' },
  ]);
  for (const i of [0, 1]) { c.useSeat(i); c.endTurn(); }
  for (const s of c.seats) {
    assert.equal(s.player.status.faiblesse, 1);
    assert.ok([...s.discardPile, ...s.hand, ...s.drawPile].some((x) => x.id === 'statut_blessure'));
  }
});

test('Table : un héros à 0 PV est hors combat, les autres continuent ; la table perd quand tous tombent', () => {
  const c = party(['iop', 'cra'], [{ type: 'damage', amount: 30, element: 'neutre' }]);
  c.seats[0].player.hp = 20;
  for (const i of [0, 1]) { c.useSeat(i); c.endTurn(); }
  assert.equal(c.outcome, 'ongoing');
  assert.ok(c.isDown(0));
  assert.equal(c.seats[1].player.hp, 30);
  c.useSeat(0);
  assert.throws(() => c.endTurn(), /hors combat/);
  assert.deepEqual(c.legalActions(), []);
  // Le héros debout n'attend plus personne
  c.useSeat(1);
  c.endTurn();
  assert.equal(c.outcome, 'lost');
});

test('Table : la victoire vaut pour tous, chacun garde son résultat', () => {
  const c = party(['iop', 'cra'], [{ type: 'damage', amount: 5, element: 'neutre' }]);
  c.seats[1].player.hp = 33;
  c.enemies[0].hp = 1;
  c.useSeat(0);
  c.playCard(c.hand.findIndex((i) => c.cardDef(i).type === 'attaque'), c.enemies[0].uid);
  assert.equal(c.outcome, 'won');
  assert.equal(c.resultFor(0).hp, 60);
  assert.equal(c.resultFor(1).hp, 33);
});

test('Table : les objets et règles d\'un héros ne valent que pour lui', () => {
  const c = new Combat(LIBRARY, starterDeck('iop'), { hp: 60, maxHp: 70, classe: 'iop', effects: [{ kind: 'rule', rule: 'pa_plus' }] }, ['bouftou'], 3, undefined,
    [{ deck: starterDeck('cra'), init: { hp: 60, maxHp: 70, classe: 'cra' } }]);
  assert.equal(c.seats[0].player.energy, 4);
  assert.equal(c.seats[1].player.energy, 3);
});

test('Table : même graine, mêmes actions, même combat', () => {
  const play = () => {
    const c = party(['iop', 'cra', 'xelor'], [{ type: 'damage', amount: 6, element: 'neutre' }], 2);
    for (let r = 0; r < 4 && c.outcome === 'ongoing'; r++) {
      for (let i = 0; i < c.partySize; i++) {
        if (c.isDown(i) || c.outcome !== 'ongoing') continue;
        c.useSeat(i);
        const a = c.legalActions().find((x) => x.type === 'play');
        if (a && a.type === 'play') c.playCard(a.handIndex, a.target);
        if (c.outcome === 'ongoing') c.endTurn();
      }
    }
    return JSON.stringify([hp(c), c.enemies.map((e) => e.hp), c.turn]);
  };
  assert.equal(play(), play());
});
