import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat, type PlayerInit } from './combat.ts';
import { computeLoadout, type Equipment } from './loadout.ts';
import { itemOffer } from './offers.ts';
import { Rng } from './rng.ts';
import { NO_PASSIVES, type Passives } from './types.ts';
import { ITEMS } from '../data/items.ts';
import { LIBRARY, newCard, starterDeck } from '../data/library.ts';

function combatWith(passives: Partial<Passives>, enemies: string[], hand: string[], extra: Partial<PlayerInit> = {}) {
  const c = new Combat(LIBRARY, starterDeck('iop'), { hp: 50, maxHp: 80, passives: { ...NO_PASSIVES, ...passives }, ...extra }, enemies, 11);
  c.hand = hand.map((id) => newCard(id));
  c.player.energy = 3;
  for (const e of c.enemies) e.block = 0;
  return c;
}

test('stats d\'items et bonus de panoplie (2 puis 4 pièces)', () => {
  const deck = starterDeck('iop');
  // Panoplie du Piou Vert : amulette (+1 Terre), anneau (+1 Terre), sandales (+6 PV), cape (+1 Terre)
  const two: Equipment = { amulette: 'item_8217', anneau: 'item_8223' };
  assert.equal(computeLoadout(LIBRARY, deck, two, ITEMS).dom.terre, 3); // 1 + 1 + bonus 2 pièces
  const four: Equipment = { ...two, bottes: 'item_8229', cape: 'item_8236' };
  const l = computeLoadout(LIBRARY, deck, four, ITEMS);
  assert.equal(l.dom.terre, 5); // 1 + 1 + 1 + 1 (2p) + 1 (4p)
  assert.equal(l.blockBonus, 1); // 4p
  assert.equal(l.pvBonus, 14); // sandales 6 + 4p 8
  assert.equal(l.sets.piou_vert, 4);
});

test('affinité = cartes + items de l\'élément ; palier 1 à 4 points', () => {
  const deck = starterDeck('iop'); // Pression = 1 point Terre
  assert.equal(computeLoadout(LIBRARY, deck, {}, ITEMS).affinity.terre, 1);
  deck.push(newCard('iop_accumulation'), newCard('iop_accumulation'));
  const l = computeLoadout(LIBRARY, deck, { amulette: 'item_8217' }, ITEMS);
  assert.equal(l.affinity.terre, 4);
  assert.equal(l.paliers.terre, 1);
  assert.equal(l.passives.terreArmure, 2);
  // Un item multi donne un point à chacun de ses éléments
  const m = computeLoadout(LIBRARY, starterDeck('iop'), { coiffe: 'item_2411' }, ITEMS); // Coiffe du Bouftou
  assert.deepEqual([m.affinity.feu, m.affinity.terre], [1, 2]);
});

test('Terre : jouer une carte Terre donne de l\'armure, pas une carte neutre', () => {
  const c = combatWith({ terreArmure: 2 }, ['moskito'], ['iop_accumulation', 'iop_coup_epee']);
  c.enemies[0].hp = 999;
  c.playCard(0);
  assert.equal(c.player.block, 2);
  c.playCard(0); // Coup d'épée est neutre
  assert.equal(c.player.block, 2);
});

test('Feu : les attaques Feu appliquent la brûlure à chaque cible touchée', () => {
  const c = combatWith({ feuBrulure: 1 }, ['prespic', 'prespic'], ['iop_tempete', 'iop_epee_destructrice']);
  c.playCard(0, 1);
  assert.equal(c.enemies[1].status.brulure, 1);
  assert.equal(c.enemies[0].status.brulure ?? 0, 0);
  c.player.energy = 3;
  c.playCard(0); // zone : les deux cibles
  assert.deepEqual(c.enemies.map((e) => e.status.brulure), [1, 2]);
});

test('Eau : les attaques Eau soignent en plus du drain', () => {
  const c = new Combat(LIBRARY, starterDeck('cra'), { hp: 50, maxHp: 75, passives: { ...NO_PASSIVES, eauSoin: 2 } }, ['prespic'], 4);
  c.hand = [newCard('cra_oeil_de_taupe')];
  c.enemies[0].block = 0;
  c.playCard(0); // drain 3 + soin 2
  assert.equal(c.player.hp, 55);
});

test('Air : seules les N premières cartes Air du tour piochent', () => {
  const c = combatWith({ airPioche: 1 }, ['bouftou'], ['iop_souffle', 'iop_souffle']);
  c.enemies[0].hp = 999;
  c.playCard(0);
  assert.equal(c.hand.length, 2); // 1 Couper restant + 1 pioché
  c.playCard(0);
  assert.equal(c.hand.length, 1); // pas de 2e pioche
});

test('Prisme : +N dégâts par élément différent déjà joué ce tour', () => {
  const c = combatWith({ prisme: 2 }, ['prespic', 'prespic'], ['iop_tempete', 'iop_accumulation']);
  c.enemies[0].hp = 999;
  c.playCard(0, 1); // Feu sur le 2e Prespic
  const before = c.enemies[0].hp;
  c.playCard(0, 0); // Terre sur le 1er (neutre à la Terre) : 8 + 2
  assert.equal(before - c.enemies[0].hp, 10);
});

test('un actif ne sert qu\'une fois par combat et se recharge au combat suivant', () => {
  const l = computeLoadout(LIBRARY, starterDeck('iop'), { cape: 'item_2445' }, ITEMS); // Cape Bouffante Royale : Carapace
  const init = { hp: 80, maxHp: 90, actives: l.actives };
  const c = new Combat(LIBRARY, starterDeck('iop'), init, ['bouftou'], 1);
  assert.ok(c.legalActions().some((a) => a.type === 'active'));
  c.useActive(0);
  assert.equal(c.player.block, 12);
  assert.throws(() => c.useActive(0), /déjà utilisé/);
  assert.ok(!c.legalActions().some((a) => a.type === 'active'));
  const next = new Combat(LIBRARY, starterDeck('iop'), init, ['bouftou'], 2);
  assert.ok(next.legalActions().some((a) => a.type === 'active'));
});

test('offre en découverte : 3 items de familles différentes', () => {
  const ctx = { cards: LIBRARY, items: ITEMS, deck: starterDeck('iop'), equipment: {} };
  for (let s = 1; s <= 50; s++) {
    const offer = itemOffer(ctx, 'commun', new Rng(s)).map((id) => ITEMS.items[id]);
    assert.equal(offer.length, 3);
    const kind = (it: (typeof offer)[number]) => (it.panoplie ? ITEMS.panoplies[it.panoplie].kind : undefined);
    const fam = offer.map((it) =>
      it.elements.length === 0 ? 'neutre' : it.elements.length > 1 || kind(it) === 'multi' || kind(it) === 'duo' ? 'multi' : it.elements[0]);
    assert.equal(new Set(fam).size, 3);
  }
});

test('offre avec une voie : 1 item de la voie, au moins 1 hors voie, jamais un item déjà porté', () => {
  const deck = starterDeck('iop');
  deck.push(newCard('iop_accumulation'), newCard('iop_accumulation'), newCard('iop_colere'));
  const equipment: Equipment = { amulette: 'item_8217' };
  const ctx = { cards: LIBRARY, items: ITEMS, deck, equipment };
  for (let s = 1; s <= 100; s++) {
    const offer = itemOffer(ctx, 'commun', new Rng(s)).map((id) => ITEMS.items[id]);
    assert.ok(offer[0].elements.includes('terre'));
    assert.ok(offer.some((it) => !it.elements.includes('terre')));
    assert.ok(!offer.some((it) => it.id === 'item_8217'));
    assert.equal(new Set(offer.map((it) => it.id)).size, 3);
  }
});

test('les offres poussent à compléter une panoplie commencée', () => {
  const deck = starterDeck('iop');
  deck.push(newCard('iop_accumulation'), newCard('iop_accumulation'), newCard('iop_colere'));
  const count = (equipment: Equipment) => {
    let n = 0;
    for (let s = 1; s <= 300; s++) {
      const offer = itemOffer({ cards: LIBRARY, items: ITEMS, deck, equipment }, 'commun', new Rng(s));
      n += offer.filter((id) => ITEMS.items[id].panoplie === 'piou_vert').length;
    }
    return n;
  };
  // Avec une pièce du Piou Vert déjà portée, ses pièces reviennent plus souvent qu'avec une pièce
  // d'une autre panoplie Terre (Coiffe du Bouftou).
  assert.ok(count({ amulette: 'item_8217' }) > count({ coiffe: 'item_2411' }));
});

test('une offre rare ne propose que des items rares', () => {
  const ctx = { cards: LIBRARY, items: ITEMS, deck: starterDeck('cra'), equipment: {} };
  const offer = itemOffer(ctx, 'rare', new Rng(3));
  assert.equal(offer.length, 3);
  assert.ok(offer.every((id) => ITEMS.items[id].rarity === 'rare' && ITEMS.items[id].active));
});

test('les cartes reprennent nom, élément et coût (via les PA) de leur sort Dofus', async () => {
  const { ALL_CARDS } = await import('../data/cards.ts');
  const { paToCost, spell, spellElement } = await import('../data/dofus.ts');
  for (const c of ALL_CARDS) {
    if (!c.spellId) continue;
    assert.equal(c.name, spell(c.spellId).n);
    assert.equal(c.element, spellElement(c.spellId), c.name);
    if (c.rarity !== 'base') assert.equal(c.cost, paToCost(spell(c.spellId).pa), c.name);
  }
});

test('faiblesses / résistances dérivées des résistances Dofus', async () => {
  const { weakResist } = await import('../data/dofus.ts');
  assert.deepEqual(weakResist({ neutre: 5, terre: 15, feu: -10, eau: -5, air: 20 }), { weak: ['feu'], resist: ['air'] });
  assert.deepEqual(weakResist({ neutre: 14, terre: 14, feu: 14, eau: 14, air: 14 }), { weak: [], resist: [] });
});
