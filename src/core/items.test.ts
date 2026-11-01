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

test('la stat fixe se voit : elle grandit avec le niveau, et la rareté dépasse la précédente', () => {
  const all = Object.values(ITEMS.items);
  const amount = (it: (typeof all)[number]) => it.stats.pv ?? it.stats.armure ?? it.stats.prospection ?? Object.values(it.stats.dom ?? {})[0] ?? 0;
  const of = (rarity: string, kind: 'dom' | 'pv' | 'armure' | 'prospection') => all.filter((it) => it.rarity === rarity && (kind === 'dom' ? it.stats.dom : it.stats[kind]));
  for (const kind of ['dom', 'pv', 'armure', 'prospection'] as const) {
    const order = ['commun', 'rare', 'mythique', 'legendaire'];
    const present = order.map((r) => of(r, kind)).filter((g) => g.length);
    for (const g of present) {
      const sorted = [...g].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
      for (let i = 1; i < sorted.length; i++) assert.ok(amount(sorted[i]) >= amount(sorted[i - 1]), `${sorted[i].name} plus faible qu'un objet de niveau inférieur`);
    }
    for (let i = 1; i < present.length; i++) {
      const prev = Math.max(...present[i - 1].map(amount));
      const next = Math.min(...present[i].map(amount));
      assert.ok(next > prev, `${kind} : ${present[i][0].rarity} (${next}) ne dépasse pas ${present[i - 1][0].rarity} (${prev})`);
    }
  }
  const leg = of('legendaire', 'dom').map(amount);
  assert.ok(Math.min(...leg) >= 9 && Math.max(...leg) <= 12);
  const commonPv = of('commun', 'pv').map(amount);
  assert.ok(Math.min(...commonPv) >= 12 && Math.max(...commonPv) <= 18);
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

test('les monstres portent les résistances réelles de Dofus', async () => {
  const { monster } = await import('../data/dofus.ts');
  const { LIBRARY } = await import('../data/library.ts');
  const tofu = LIBRARY.monsters.tofu;
  assert.deepEqual(tofu.res, monster(tofu.dofusId!).res);
});

test('limite par objet : 3 déclenchements par tour (1 pour la pioche), sans plafond de pile ; deux objets se cumulent', () => {
  const c = combatWith(['bouftou'], ['iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee'],
    { effects: [roll('attaque', 'pioche', 2), roll('attaque', 'brulure', 3), roll('attaque', 'brulure', 3)] });
  c.player.energy = 9;
  c.enemies[0].hp = 999;
  c.drawPile = Array.from({ length: 10 }, () => newCard('iop_vitalite'));
  const hand0 = c.hand.length;
  for (let i = 0; i < 5; i++) c.playCard(c.hand.findIndex((x) => x.id === 'iop_coup_epee'), 0);
  assert.equal(c.hand.length, hand0 - 5 + 2); // la pioche ne joue qu'une fois
  assert.equal(c.enemies[0].status.brulure, 18); // 2 objets × 3 déclenchements × 3
  c.enemies[0].status.brulure = 40;
  c.fxStatus(c.enemies[0], 'brulure', 10);
  assert.equal(c.enemies[0].status.brulure, 50); // aucune limite de pile
});

// ───────────── mécaniques des monstres ─────────────

test('division : une Gelée à moitié de ses PV se change en deux Petites Gelées qui gardent ses PV', () => {
  const c = combatWith(['gelee_bleuet'], ['iop_colere']);
  const g = c.enemies[0];
  g.hp = g.maxHp = 40;
  c.player.status.puissance = 0;
  c.playCard(0, 0); // 24 Terre
  assert.equal(g.dead, true);
  const kids = c.living();
  assert.equal(kids.length, 2);
  assert.ok(kids.every((k) => k.def.id === 'gelee_bleuet_petite' && k.hp === 40 - 24));
});

test('voleur : vole des kamas et s\'enfuit avec ; enroulement ; épines ; rage toutes les 4 cartes', () => {
  const c = combatWith(['ecurouille'], []);
  const e = c.enemies[0];
  e.status = {};
  for (let i = 0; i < 3 && c.outcome === 'ongoing'; i++) { c.hand = []; c.endTurn(); }
  assert.equal(e.dead, true);
  assert.equal(e.m.gone, 'fui');
  assert.equal(c.result().kamasStolen, e.m.stolen);
  assert.ok(e.m.stolen > 0);
  const d = combatWith(['larve_verte'], ['iop_coup_epee']);
  d.playCard(0, 0);
  assert.equal(d.enemies[0].block, 5);
  const t = combatWith(['prespic'], ['iop_coup_epee']);
  const hp = t.player.hp;
  t.playCard(0, 0);
  assert.equal(t.player.hp, hp - 1);
  // Rage : +2 puissance toutes les 4 cartes jouées, pas avant
  const n = combatWith(['chef_guerre_bouftou'], ['iop_vitalite', 'iop_vitalite', 'iop_vitalite', 'iop_vitalite']);
  n.player.energy = 9;
  for (let i = 0; i < 3; i++) n.playCard(0);
  assert.equal(n.enemies[0].status.puissance ?? 0, 0);
  n.playCard(0);
  assert.equal(n.enemies[0].status.puissance, 2);
});

test('piou : l\'appel s\'arrête à 5 vivants, et une place se libère quand l\'un meurt', () => {
  const c = combatWith(['piou_rouge', 'piou_bleu'], []);
  for (let turn = 0; turn < 6 && c.living().length < 5; turn++) {
    for (const e of c.living()) e.moveId = 'appel';
    c.hand = [];
    c.endTurn();
    assert.ok(c.living().length <= 5);
    assert.equal(c.outcome, 'ongoing');
  }
  assert.equal(c.living().length, 5);
  const before = c.enemies.length;
  for (const e of c.living()) e.moveId = 'appel';
  c.hand = [];
  c.endTurn();
  assert.equal(c.living().length, 5, 'au-delà de 5, l\'appel ne fait plus entrer personne');
  assert.equal(c.enemies.length, before);
  c.living()[0].hp = 1;
  c.hand = [newCard('iop_pression')];
  c.player.energy = 9;
  c.player.status.puissance = 30;
  c.playCard(0, c.living()[0].uid);
  assert.ok(c.living().length < 5);
  for (const e of c.living()) e.moveId = 'appel';
  c.hand = [];
  c.endTurn();
  assert.equal(c.living().length, 5);
});

test('sommeil, explosion, plafond, artefact, invocation et cartes de statut', () => {
  const s = combatWith(['abraknyde_sombre'], []);
  assert.equal(s.intent(s.enemies[0]).note, 'Endormi');
  const x = combatWith(['champa_explosif'], []);
  x.hand = []; x.endTurn(); x.hand = []; x.endTurn();
  assert.equal(x.intent(x.enemies[0]).note, 'Explose !');
  const hp = x.player.hp;
  x.hand = []; x.endTurn();
  assert.ok(x.player.hp < hp);
  assert.equal(x.enemies[0].m.gone, 'explose');
  const k = combatWith(['koulosse'], ['iop_colere', 'iop_colere']);
  k.player.energy = 9; k.player.status.puissance = 40;
  k.playCard(0, 0); k.playCard(0, 0);
  assert.equal(k.enemies[0].maxHp - k.enemies[0].hp, 45);
  const a = combatWith(['rose_obscure'], []);
  a.fxStatus(a.enemies[0], 'vulnerabilite', 2);
  assert.equal(a.enemies[0].status.vulnerabilite ?? 0, 0);
  const g = combatWith(['gardienne_champetre'], []);
  g.enemies[0].moveId = 'appel';
  g.hand = []; g.endTurn();
  assert.equal(g.living().length, 2); // la Gardienne et le Campagnoll qu'elle appelle
  const r = combatWith(['arakne_egouts'], []);
  r.enemies[0].moveId = 'toile';
  r.hand = []; r.endTurn();
  const all = [...r.hand, ...r.drawPile, ...r.discardPile];
  assert.ok(all.some((i) => i.id === 'statut_toile'));
  assert.ok(r.legalActions().every((a2) => a2.type === 'end' || r.cardDef(r.hand[a2.handIndex]).id !== 'statut_toile'));
});

test('colère : +n puissance toutes les x attaques jouées, les compétences ne comptent pas', () => {
  const c = combatWith(['sanglier'], ['iop_vitalite', 'iop_coup_epee', 'iop_coup_epee', 'iop_coup_epee']);
  c.player.energy = 9;
  c.enemies[0].hp = 999;
  c.playCard(0);
  c.playCard(0, c.enemies[0].uid); c.playCard(0, c.enemies[0].uid);
  assert.equal(c.enemies[0].status.puissance ?? 0, 0);
  c.playCard(0, c.enemies[0].uid);
  assert.equal(c.enemies[0].status.puissance, 1);
});
