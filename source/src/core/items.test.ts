import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat, type PlayerInit } from './combat.ts';
import { BUDGET, combos, effectPower, effectText, poolSize, rollEffect, type ItemEffect, type RuleId } from './effects.ts';
import { computeLoadout } from './loadout.ts';
import { itemOffer, lootChance, rarityWeights } from './offers.ts';
import { Rng } from './rng.ts';
import { ITEMS } from '../data/items.ts';
import { LIBRARY, newCard, starterDeck } from '../data/library.ts';

function combatWith(enemies: string[], hand: string[], extra: Partial<PlayerInit> = {}) {
  const c = new Combat(LIBRARY, starterDeck('iop'), { hp: 50, maxHp: 80, ...extra }, enemies, 11);
  c.hand = hand.map((id) => newCard(id));
  c.player.energy = 3;
  for (const e of c.enemies) e.block = 0;
  return c;
}
const roll = (trigger: string, reward: string, amount: number): ItemEffect => ({ kind: 'roll', parts: [{ trigger, reward, amount }] });
const rule = (r: RuleId): ItemEffect => ({ kind: 'rule', rule: r });

// ───────────── statuts ─────────────

test('poison : ignore armure et bouclier, puis divisé par 2', () => {
  const c = combatWith(['bouftou'], []);
  const e = c.enemies[0];
  e.hp = 50; e.status.poison = 5; e.status.bouclier = 10;
  c.endTurn();
  assert.equal(e.hp, 45);
  assert.equal(e.status.poison, 2);
  assert.equal(e.status.bouclier, 10);
});

test('brûlure : absorbée par l\'armure et le bouclier', () => {
  const c = combatWith(['bouftou'], []);
  const p = c.player;
  p.status.brulure = 4; p.status.bouclier = 3; p.hp = 50;
  // Le Bouftou attaque d'abord ; on neutralise son coup pour isoler la brûlure.
  c.enemies[0].status.etourdi = 1;
  c.endTurn();
  assert.equal(p.hp, 49); // 4 - 3 de bouclier
  assert.equal(p.status.bouclier, 0);
});

test('bouclier : persiste d\'un tour à l\'autre, contrairement à l\'armure', () => {
  const c = combatWith(['bouftou'], []);
  c.enemies[0].status.etourdi = 1;
  c.player.block = 5; c.player.status.bouclier = 5;
  c.endTurn();
  assert.equal(c.player.block, 0);
  assert.equal(c.player.status.bouclier, 5);
});

test('esquive : annule un coup entier ; renvoi : renvoie des dégâts à l\'attaquant', () => {
  const c = combatWith(['bouftou'], []);
  const e = c.enemies[0];
  const hp = c.player.hp, ehp = e.hp;
  c.player.status.esquive = 5; c.player.status.renvoi = 3;
  c.endTurn();
  if (c.intent(e).hits) assert.equal(c.player.hp, hp);
  // l'esquive a pris les coups : pas de renvoi sur un coup esquivé
  assert.equal(e.hp, ehp);
  const d = combatWith(['bouftou'], []);
  d.player.status.renvoi = 3;
  const eh = d.enemies[0].hp;
  const attacks = d.intent(d.enemies[0]).hits;
  d.endTurn();
  assert.equal(eh - d.enemies[0].hp, 3 * attacks);
});

test('étourdi : le monstre saute son action ; un boss doit en cumuler 2', () => {
  const c = combatWith(['bouftou'], []);
  c.enemies[0].status.etourdi = 1;
  assert.equal(c.intent(c.enemies[0]).stunned, true);
  const hp = c.player.hp;
  c.endTurn();
  assert.equal(c.player.hp, hp);
  assert.equal(c.enemies[0].status.etourdi, 0);
  const b = combatWith(['bouftou_royal'], []);
  b.enemies[0].status.etourdi = 1;
  assert.equal(b.intent(b.enemies[0]).stunned, false);
  b.enemies[0].status.etourdi = 2;
  assert.equal(b.intent(b.enemies[0]).stunned, true);
});

test('érosion : l\'armure gagnée par la cible est divisée par 2', () => {
  const c = combatWith(['champ_champ'], []);
  const e = c.enemies[0];
  const block = Object.values(e.def.moves).flatMap((m) => m.effects).find((fx) => fx.type === 'block');
  if (!block || block.type !== 'block') return;
  e.moveId = Object.entries(e.def.moves).find(([, m]) => m.effects.includes(block))![0];
  e.status.erosion = 2;
  c.endTurn();
  assert.equal(e.block, Math.floor(block.amount / 2));
});

// ───────────── effets d'objets ─────────────

test('un effet ne se déclenche que sur sa condition (2e carte Air du tour)', () => {
  const c = combatWith(['bouftou'], ['iop_zenith', 'iop_zenith', 'iop_zenith'], { effects: [roll('deuxieme_air', 'puissance', 1)] });
  c.player.energy = 9;
  c.enemies[0].hp = 999;
  c.playCard(0);
  assert.equal(c.player.status.puissance ?? 0, 0);
  c.playCard(0);
  assert.equal(c.player.status.puissance, 1);
  c.playCard(0);
  assert.equal(c.player.status.puissance, 1);
});

test('« quand un sort Feu achève un ennemi » : prospection pour le prochain combat', () => {
  const c = combatWith(['bouftou', 'bouftou'], ['iop_sentence'], { effects: [roll('acheve_feu', 'prospection', 15)] });
  c.enemies[0].hp = 1;
  c.playCard(0, 0);
  assert.equal(c.prospection.next, 15);
});

test('règles légendaires : première carte moins chère, brûlure tenace', () => {
  const c = combatWith(['bouftou'], ['iop_epee_destin', 'iop_epee_destin'], { effects: [rule('premiere_gratuite'), rule('brulure_tenace')] });
  c.enemies[0].hp = 999;
  assert.equal(c.costOf(c.hand[0]), 1);
  c.playCard(0);
  assert.equal(c.player.energy, 2);
  assert.equal(c.costOf(c.hand[0]), 2);
  c.enemies[0].status.brulure = 3;
  const burn = c.enemies[0].status.brulure!;
  c.hand = [];
  c.endTurn();
  assert.equal(c.enemies[0].status.brulure, burn);
});

test('la base d\'effets est vaste et chaque tirage tient dans le budget de sa rareté', () => {
  const size = poolSize();
  assert.ok(size.commun >= 300 && size.rare >= 300, JSON.stringify(size));
  assert.ok(size.legendaire >= 20);
  const rng = new Rng(9);
  for (let i = 0; i < 300; i++) {
    for (const r of ['commun', 'rare', 'mythique'] as const) {
      const fx = rollEffect(r, rng);
      assert.equal(fx.kind, 'roll');
      const p = effectPower(fx);
      assert.ok(p >= BUDGET[r] * 0.55 && p <= BUDGET[r] * 1.55, `${r} ${effectText(fx)} = ${p}`);
      if (r === 'mythique') assert.ok(fx.kind === 'roll' && fx.parts.length === 2, effectText(fx));
    }
    assert.equal(rollEffect('legendaire', rng).kind, 'rule');
  }
  // Pas de boucle évidente : « quand tu gagnes de l'armure, gagne de l'armure »
  assert.ok(!combos(BUDGET.commun).some((p) => p.trigger === 'armure_gagnee' && p.reward === 'armure'));
});

// ───────────── objets et butin ─────────────

test('stats fixes des objets : la somme de l\'équipement', () => {
  const pv = Object.values(ITEMS.items).find((it) => it.rarity === 'commun' && it.stats.pv)!;
  const fire = Object.values(ITEMS.items).find((it) => it.slot !== pv.slot && it.stats.dom?.feu)!;
  const l = computeLoadout({ [pv.slot]: pv.id, [fire.slot]: fire.id }, ITEMS, {});
  assert.equal(l.pvBonus, pv.stats.pv);
  assert.equal(l.dom.feu, fire.stats.dom!.feu);
  assert.equal(l.effects.length, 0);
});

test('catalogue : 132 objets Dofus réels, 4 raretés dans chaque emplacement, aucune panoplie', () => {
  const all = Object.values(ITEMS.items);
  assert.equal(all.length, 132);
  for (const slot of ['coiffe', 'cape', 'amulette', 'anneau', 'ceinture', 'bottes'] as const) {
    const mine = all.filter((it) => it.slot === slot);
    for (const r of ['commun', 'rare', 'mythique', 'legendaire'] as const) assert.ok(mine.some((it) => it.rarity === r), `${slot} ${r}`);
  }
});

test('prospection : plus de butin et des raretés plus hautes, avec rendement décroissant', () => {
  assert.equal(lootChance('elite', 0), 1);
  assert.ok(lootChance('normal', 100) > lootChance('normal', 0));
  assert.ok(lootChance('normal', 1000) <= 0.9);
  const w0 = rarityWeights('normal', 0), w1 = rarityWeights('normal', 100);
  assert.ok(w1.mythique / w1.commun > w0.mythique / w0.commun);
  assert.equal(rarityWeights('elite', 500).commun, 0);
});

test('offre : 3 objets différents, jamais un objet déjà porté', () => {
  const equipped = Object.values(ITEMS.items).find((it) => it.rarity === 'rare')!;
  const ctx = { cards: LIBRARY, items: ITEMS, deck: starterDeck('cra'), equipment: { [equipped.slot]: equipped.id }, table: {} };
  for (let s = 1; s < 30; s++) {
    const offer = itemOffer(ctx, 'elite', 0, new Rng(s));
    assert.equal(new Set(offer).size, 3);
    assert.ok(!offer.includes(equipped.id));
  }
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

test('plafonds : les effets d\'objets donnent au plus 2 cartes et 6 brûlure par tour ; une pile ne dépasse pas 15 brûlure', () => {
  const c = combatWith(['bouftou'], ['iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee'],
    { effects: [roll('attaque', 'pioche', 2), roll('attaque', 'brulure', 3)] });
  c.player.energy = 9;
  c.enemies[0].hp = 999;
  c.drawPile = Array.from({ length: 10 }, () => newCard('iop_vitalite'));
  const hand0 = c.hand.length;
  for (let i = 0; i < 4; i++) c.playCard(c.hand.findIndex((x) => x.id === 'iop_coup_epee'), 0);
  assert.equal(c.hand.length, hand0 - 4 + 2);
  assert.equal(c.enemies[0].status.brulure, 6);
  c.enemies[0].status.brulure = 14;
  c.fxStatus(c.enemies[0], 'brulure', 5); // budget du tour épuisé : rien
  assert.equal(c.enemies[0].status.brulure, 14);
  const d = combatWith(['bouftou'], []);
  d.fxStatus(d.enemies[0], 'brulure', 3);
  d.enemies[0].status.brulure = 14;
  d.fxStatus(d.enemies[0], 'brulure', 3);
  assert.equal(d.enemies[0].status.brulure, 15);
});
