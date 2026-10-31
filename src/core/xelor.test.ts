// Xélor : Téléfrag (passif), ralenti, échéance et cartes qui s'en servent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from './combat.ts';
import { PASSIVE_VALUES } from './classes.ts';
import { RALENTI_CAP, type ClassId, type MonsterDef } from './types.ts';
import { LIBRARY, newCard, rewardPool, starterDeck } from '../data/library.ts';
import { XELOR_CARDS, XELOR_INVENTED, IOP_CARDS, IOP_INVENTED } from '../data/cards.ts';

/** Un combat contre un monstre neutre (500 PV, sans résistance) qui frappe 3 fois 4 dégâts. */
function combatWith(hand: string[], classe: ClassId = 'xelor', foes = 1) {
  const c = new Combat(LIBRARY, starterDeck('xelor'), { hp: 60, maxHp: 70, classe }, Array(foes).fill('bouftou'), 7);
  c.hand = hand.map((id) => newCard(id));
  c.drawPile = Array.from({ length: 10 }, () => newCard('xelor_coup_baguette'));
  c.player.energy = 9;
  for (const e of c.enemies) {
    const def: MonsterDef = { ...e.def, res: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 }, powers: [],
      moves: { triple: { name: 'Triple', effects: [{ type: 'damage', amount: 4, element: 'neutre', hits: 3 }] } },
      pattern: { kind: 'cycle', order: ['triple'] } };
    e.def = def; e.moveId = 'triple'; e.block = 0; e.hp = 500; e.maxHp = 500; e.status = {};
  }
  return c;
}
const idx = (c: Combat, id: string) => c.hand.findIndex((i) => i.id === id);

test('Xélor : 58 cartes comme le Crâ, un deck de départ de 10 cartes, des récompenses à lui', () => {
  assert.equal(XELOR_CARDS.length + XELOR_INVENTED.length, 58);
  assert.equal(starterDeck('xelor').length, 10);
  const pool = rewardPool('xelor');
  assert.ok(pool.includes('xelor_horloge') && !pool.includes('iop_colere') && !pool.includes('xelor_seconde'));
  assert.ok(IOP_CARDS.length + IOP_INVENTED.length >= 58);
});

test('Téléfrag : la Frappe pose la marque, l\'attaque suivante la consomme et pioche 1 (une fois par tour)', () => {
  const c = combatWith(['xelor_frappe', 'xelor_coup_baguette', 'xelor_frappe', 'xelor_coup_baguette']);
  const e = c.enemies[0];
  c.playCard(idx(c, 'xelor_frappe'), e.uid);
  assert.equal(e.status.telefrag, 1);
  const hand = c.hand.length;
  c.playCard(idx(c, 'xelor_coup_baguette'), e.uid);
  assert.equal(e.status.telefrag ?? 0, 0);
  assert.equal(c.hand.length, hand - 1 + PASSIVE_VALUES.telefrag.pioche);
  assert.equal(c.telefragTurn, 1);
  // Seconde consommation du tour : pas de pioche
  c.playCard(idx(c, 'xelor_frappe'), e.uid);
  const hand2 = c.hand.length;
  c.playCard(idx(c, 'xelor_coup_baguette'), e.uid);
  assert.equal(c.hand.length, hand2 - 1);
  assert.equal(c.telefragTurn, 2);
});

test('Téléfrag : la marque ne se cumule pas, une compétence ne la consomme pas, une autre classe ne pioche pas', () => {
  const c = combatWith(['xelor_frappe', 'xelor_teleportation', 'xelor_astrolabe']);
  const e = c.enemies[0];
  c.playCard(idx(c, 'xelor_frappe'), e.uid);
  c.playCard(idx(c, 'xelor_teleportation'), e.uid);
  assert.equal(e.status.telefrag, 1);
  const other = combatWith(['xelor_frappe', 'xelor_coup_baguette'], 'iop');
  other.playCard(0, other.enemies[0].uid);
  const hand = other.hand.length;
  other.playCard(0, other.enemies[0].uid);
  assert.equal(other.hand.length, hand - 1);
  assert.equal(other.enemies[0].status.telefrag ?? 0, 0);
});

test('Téléfrag : le bonus « si Téléfrag » joue avant la consommation', () => {
  const c = combatWith(['xelor_frappe', 'xelor_fletrissement', 'xelor_fletrissement']);
  const e = c.enemies[0];
  c.playCard(idx(c, 'xelor_frappe'), e.uid);
  let before = e.hp;
  c.playCard(idx(c, 'xelor_fletrissement'), e.uid);
  assert.equal(before - e.hp, 12);
  before = e.hp;
  c.playCard(idx(c, 'xelor_fletrissement'), e.uid);
  assert.equal(before - e.hp, 6);
});

test('Ralenti : retiré du total de la prochaine action, coup après coup, puis effacé', () => {
  const c = combatWith(['xelor_ralentissement']);
  const e = c.enemies[0];
  c.playCard(0, e.uid);
  assert.equal(e.status.ralenti, 2);
  assert.equal(c.intent(e).damage, 10);
  const hp = c.player.hp;
  c.player.block = 0;
  c.endTurn();
  assert.equal(hp - c.player.hp, 10);
  assert.equal(e.status.ralenti ?? 0, 0);
});

test(`Ralenti : plafonné à ${RALENTI_CAP}, même doublé par Paradoxe`, () => {
  const c = combatWith(['xelor_flou_temporel', 'xelor_paradoxe', 'xelor_arret_temps']);
  const e = c.enemies[0];
  c.playCard(idx(c, 'xelor_flou_temporel'));
  c.playCard(idx(c, 'xelor_paradoxe'), e.uid);
  assert.equal(e.status.ralenti, 4);
  c.playCard(idx(c, 'xelor_arret_temps'));
  assert.equal(e.status.ralenti, RALENTI_CAP);
  assert.equal(c.intent(e).damage, 2);
});

test('Téléfrag : au début de chaque tour, un ennemi sans marque en reçoit une (Xélor seulement)', () => {
  const c = combatWith([], 'xelor', 2);
  c.enemies[0].status.telefrag = 1;
  c.endTurn();
  assert.deepEqual(c.enemies.map((e) => e.status.telefrag ?? 0), [1, 1]);
  const other = combatWith([], 'cra', 2);
  other.endTurn();
  assert.deepEqual(other.enemies.map((e) => e.status.telefrag ?? 0), [0, 0]);
});

test('Échéance : tombe à la fin du tour du monstre, puis disparaît', () => {
  const c = combatWith(['xelor_sablier']);
  const e = c.enemies[0];
  c.playCard(0, e.uid);
  assert.equal(e.status.echeance, 5);
  const hp = e.hp;
  c.endTurn();
  assert.equal(hp - e.hp, 5);
  assert.equal(e.status.echeance ?? 0, 0);
  const hp2 = e.hp;
  c.endTurn();
  assert.equal(e.hp, hp2);
});

test('Rayon Obscur grossit avec les ennemis Téléfrag et les consomme tous', () => {
  const c = combatWith(['xelor_engrenage', 'xelor_rayon_obscur'], 'xelor', 2);
  c.playCard(idx(c, 'xelor_engrenage'));
  assert.ok(c.enemies.every((e) => e.status.telefrag === 1));
  const hp = c.enemies.map((e) => e.hp);
  c.playCard(idx(c, 'xelor_rayon_obscur'));
  assert.deepEqual(c.enemies.map((e, i) => hp[i] - e.hp), [18, 18]);
  assert.ok(c.enemies.every((e) => !e.status.telefrag));
  assert.equal(c.telefragTurn, 2);
});

test('Vingt-cinquième Heure : étourdit l\'ennemi marqué, pas l\'autre', () => {
  const c = combatWith(['xelor_astrolabe', 'xelor_vingt_cinquieme_heure'], 'xelor', 2);
  const [a, b] = c.enemies;
  c.playCard(idx(c, 'xelor_astrolabe'), a.uid);
  c.playCard(idx(c, 'xelor_vingt_cinquieme_heure'));
  assert.equal(a.status.etourdi, 1);
  assert.equal(b.status.etourdi ?? 0, 0);
  assert.equal(a.status.telefrag ?? 0, 0);
});

test('Pouvoirs du Xélor : Synchro une fois par tour, Cadran pose une marque au début du tour', () => {
  const c = combatWith(['xelor_synchro', 'xelor_cadran', 'xelor_frappe', 'xelor_coup_baguette', 'xelor_frappe', 'xelor_coup_baguette']);
  const e = c.enemies[0];
  c.playCard(idx(c, 'xelor_synchro'));
  c.playCard(idx(c, 'xelor_cadran'));
  c.playCard(idx(c, 'xelor_frappe'), e.uid);
  let before = e.hp;
  c.playCard(idx(c, 'xelor_coup_baguette'), e.uid);
  assert.equal(before - e.hp, 6 + 4);
  c.playCard(idx(c, 'xelor_frappe'), e.uid);
  before = e.hp;
  c.playCard(idx(c, 'xelor_coup_baguette'), e.uid);
  assert.equal(before - e.hp, 6);
  c.endTurn();
  assert.equal(e.status.telefrag, 1);
});

test('La prévisualisation d\'une carte Xélor ne touche pas au vrai combat', () => {
  const c = combatWith(['xelor_frappe', 'xelor_coup_baguette']);
  const e = c.enemies[0];
  c.playCard(0, e.uid);
  const p = c.preview(0, e.uid);
  assert.ok(p);
  assert.equal(e.status.telefrag, 1);
  assert.equal(c.telefragTurn, 0);
});
