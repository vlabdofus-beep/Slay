import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyBalance } from '../data/balance.ts';
import { BALANCE_TARGETS, CLASS_START_HP, LIBRARY, balanceWarnings } from '../data/library.ts';
import { PASSIVE_VALUES } from '../core/classes.ts';
import { Run } from './run.ts';

const file = () => JSON.parse(readFileSync(new URL('../../equilibrage.json', import.meta.url), 'utf8'));

test('equilibrage.json se lit sans avertissement', () => {
  assert.deepEqual(balanceWarnings, []);
});

test('une modification du fichier change le jeu ; une valeur invalide est ignorée et signalée', () => {
  const b = file();
  const before = { hp: CLASS_START_HP.iop, card: structuredClone(LIBRARY.cards.iop_coup_epee.effects), mon: [...LIBRARY.monsters.bouftou.hp], vis: PASSIVE_VALUES.visee.attaques };
  b.classes.iop.pv = 99;
  b.cartes.iop_coup_epee.effets[0].amount = 20;
  b.monstres.bouftou.pv = [50, 60];
  b.monstres.bouftou.resistances.terre = 'beaucoup';
  b.passifs.visee.attaques = 4;
  const w = applyBalance(b, BALANCE_TARGETS);
  try {
    assert.equal(new Run('iop', 1).maxHp, 99);
    assert.equal((LIBRARY.cards.iop_coup_epee.effects[0] as { amount: number }).amount, 20);
    assert.deepEqual(LIBRARY.monsters.bouftou.hp, [50, 60]);
    assert.equal(PASSIVE_VALUES.visee.attaques, 4);
    assert.ok(w.some((x) => x.includes('bouftou.resistances.terre')));
  } finally {
    applyBalance(file(), BALANCE_TARGETS);
  }
  assert.equal(CLASS_START_HP.iop, before.hp);
  assert.deepEqual(LIBRARY.cards.iop_coup_epee.effects, before.card);
  assert.deepEqual(LIBRARY.monsters.bouftou.hp, before.mon);
  assert.equal(PASSIVE_VALUES.visee.attaques, before.vis);
});
