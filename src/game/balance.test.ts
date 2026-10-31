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

test('dieux : le fichier règle les bénédictions ; aller-retour sans perte ; erreur ignorée et signalée', async () => {
  const { GODS, BOON_BY_ID } = await import('../data/gods.ts');
  const { exportGods } = await import('../data/balance.ts');
  // Aller-retour : ce que le jeu exporte est exactement ce que le fichier contient
  assert.deepEqual(JSON.parse(JSON.stringify(exportGods(GODS))), file().dieux);
  const b = file();
  b.dieux.iop.benedictions.iop_colere.effets[0].quantite = 5;
  b.dieux.eniripsa.benedictions.eni_source.immediat[0].n = 30;
  b.dieux.enutrof.benedictions.enu_marchand.avantages.remise_marchand = 0.5;
  b.dieux.sram.benedictions.sram_venin.effets = [{ regle: 'poison_qui_nexiste_pas' }];
  b.dieux.feca.titre = 'déesse du Bouclier';
  const w = applyBalance(b, BALANCE_TARGETS);
  try {
    const fx = BOON_BY_ID.iop_colere.effects![0];
    assert.equal(fx.kind === 'roll' && fx.parts[0].amount, 5);
    assert.deepEqual(BOON_BY_ID.eni_source.now, [{ op: 'maxHp', n: 30 }]);
    assert.equal(BOON_BY_ID.enu_marchand.perks!.shopDiscount, 0.5);
    assert.equal(GODS.find((g) => g.id === 'feca')!.title, 'déesse du Bouclier');
    assert.deepEqual(BOON_BY_ID.sram_venin.effects, [{ kind: 'rule', rule: 'poison_tenace' }], 'règle inconnue : ancienne valeur gardée');
    assert.ok(w.some((x) => x.includes('sram_venin') && x.includes('poison_qui_nexiste_pas')));
  } finally {
    applyBalance(file(), BALANCE_TARGETS);
  }
  assert.equal(GODS.find((g) => g.id === 'feca')!.title, 'déesse de la Protection');
});

test('reliques et événements : le fichier fait foi ; aller-retour ; erreur signalée', async () => {
  const { RELICS, RELIC_BY_ID } = await import('../data/relics.ts');
  const { EVENTS } = await import('../data/events.ts');
  const { exportRelics, exportEvents } = await import('../data/balance.ts');
  assert.deepEqual(JSON.parse(JSON.stringify(exportRelics(RELICS))), file().reliques);
  assert.deepEqual(JSON.parse(JSON.stringify(exportEvents(EVENTS))), file().evenements);
  const b = file();
  const rushu = structuredClone(RELIC_BY_ID.anneau_rushu.effects);
  const fontaine = structuredClone(EVENTS.find((e) => e.id === 'a1_fontaine')!.options[0].ops);
  b.reliques.larme_ogrest.stats.pv = 20;
  b.reliques.anneau_rushu.effets = [{ regle: 'regle_inconnue' }];
  b.evenements.a1_colporteur.choix[0].operations[0].n = -55;
  b.evenements.a1_fontaine.choix[0].operations = [{ op: 'pas_une_operation' }];
  const w = applyBalance(b, BALANCE_TARGETS);
  try {
    assert.equal(RELIC_BY_ID.larme_ogrest.stats!.pv, 20);
    assert.deepEqual(RELIC_BY_ID.anneau_rushu.effects, rushu, 'règle inconnue : ancienne valeur gardée');
    const colp = EVENTS.find((e) => e.id === 'a1_colporteur')!.options[0].ops[0];
    assert.equal(colp.op === 'kamas' && colp.n, -55);
    assert.deepEqual(EVENTS.find((e) => e.id === 'a1_fontaine')!.options[0].ops, fontaine);
    assert.ok(w.some((x) => x.includes('anneau_rushu') && x.includes('regle_inconnue')));
    assert.ok(w.some((x) => x.includes('a1_fontaine') && x.includes('operations invalides')));
  } finally {
    applyBalance(file(), BALANCE_TARGETS);
  }
  assert.equal(RELIC_BY_ID.larme_ogrest.stats!.pv, 12);
});
