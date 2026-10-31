import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GODS, BOON_BY_ID } from '../data/gods.ts';
import { RELICS } from '../data/relics.ts';
import { EVENTS } from '../data/events.ts';
import { LIBRARY } from '../data/library.ts';
import { REWARD_BY_ID, TRIGGER_BY_ID, ruleText, type ItemEffect } from '../core/effects.ts';
import { boonLines, type RunOp } from './boons.ts';
import { Run } from './run.ts';

const checkFx = (fx: ItemEffect, where: string) => {
  if (fx.kind === 'rule') { assert.ok(ruleText(fx.rule), `${where} : règle ${fx.rule}`); return; }
  for (const p of fx.parts) {
    assert.ok(TRIGGER_BY_ID[p.trigger], `${where} : déclencheur ${p.trigger}`);
    assert.ok(REWARD_BY_ID[p.reward], `${where} : récompense ${p.reward}`);
  }
};
const checkOps = (ops: RunOp[], where: string) => {
  for (const o of ops) {
    if (o.op === 'curse') assert.ok(LIBRARY.cards[o.id]?.curse, `${where} : malédiction ${o.id}`);
    if (o.op === 'relic' && o.id) assert.ok(RELICS.some((r) => r.id === o.id), `${where} : relique ${o.id}`);
    if (o.op === 'fight') checkOps(o.then ?? [], where);
    if (o.op === 'chance') { checkOps(o.win, where); checkOps(o.lose, where); }
  }
};

test('12 dieux, 6 bénédictions chacun (72), toutes valides et décrites', () => {
  assert.equal(GODS.length, 12);
  assert.equal(Object.keys(BOON_BY_ID).length, 72);
  for (const g of GODS) {
    assert.equal(g.boons.length, 6, g.id);
    for (const b of g.boons) {
      (b.effects ?? []).forEach((fx) => checkFx(fx, b.id));
      checkOps(b.now ?? [], b.id);
      assert.ok(boonLines(b).length > 0, `${b.id} ne fait rien`);
    }
  }
});

test('15 événements par acte, art et effets valides, reliques valides', () => {
  for (const act of [1, 2, 3]) assert.equal(EVENTS.filter((e) => e.act === act).length, 15, `acte ${act}`);
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  for (const e of EVENTS) {
    if (e.art.monster) assert.ok(LIBRARY.monsters[e.art.monster], `${e.id} : monstre ${e.art.monster}`);
    assert.ok(e.options.length >= 2, e.id);
    for (const o of e.options) checkOps(o.ops, e.id);
  }
  for (const r of RELICS) { (r.effects ?? []).forEach((fx) => checkFx(fx, r.id)); assert.ok(boonLines(r).length > 0, r.id); }
});

test('un dieu au début de chaque acte, jamais deux fois le même ; la bénédiction compte en combat', () => {
  const run = new Run('iop', 3);
  assert.equal(run.phase, 'dieu');
  const id = run.god!.offer[0];
  run.takeBoon(id);
  while (run.pending) {
    const p = run.pending;
    if (p.kind === 'card') run.chooseCard(p.options[0]);
    else if (p.kind === 'item') run.chooseItem(p.options[0]);
    else run.resolvePick(run.pickCandidates(p.what)[0].uid);
  }
  assert.equal(run.phase, 'map');
  assert.deepEqual(run.boons, [id]);
  assert.ok(run.blessings().length === 1);
});

test('événement : un choix payant est refusé sans les kamas, un choix fait s\'applique, on repart sur la carte', () => {
  const run = new Run('cra', 9, 'm', { gods: false });
  const node = Object.values(run.map.nodes).find((n) => n.type === 'evenement')!;
  run.position = Object.values(run.map.nodes).find((n) => n.next.includes(node.id))?.id ?? null;
  if (run.position === null) run.map.starts = [node.id];
  run.kamas = 0;
  run.enterNode(node.id);
  assert.equal(run.phase, 'evenement');
  const ev = (await_ev(run));
  const paid = ev.options.findIndex((o) => o.ops.some((x) => x.op === 'kamas' && x.n < 0));
  if (paid >= 0) assert.equal(run.optionState(paid).ok, false);
  const free = ev.options.findIndex((_, i) => run.optionState(i).ok && !ev.options[i].ops.some((x) => x.op === 'fight' || x.op === 'chance'));
  run.chooseOption(free);
  while (run.pending) run.skipPending();
  run.leaveEvent();
  assert.equal(run.phase, 'map');
});
function await_ev(run: Run) { return EVENTS.find((e) => e.id === run.event!.id)!; }

test('relique : PV max, effet de combat et avantages de run comptés', () => {
  const run = new Run('iop', 4, 'm', { gods: false });
  const before = run.maxHp;
  run.gainRelic('larme_ogrest');
  assert.equal(run.maxHp, before + 12);
  run.gainRelic('bourse_kerubim');
  assert.equal(run.perks().kamasMul, 0.5);
  run.enterNode(run.availableNodes()[0]);
  assert.ok(run.combat!.rules !== undefined);
});

test('malédictions et retrait : une malédiction reste dans le deck, un retrait l\'enlève', () => {
  const run = new Run('iop', 5, 'm', { gods: false });
  const n = run.deck.length;
  (run as unknown as { runOps(o: RunOp[]): void }).runOps([{ op: 'curse', id: 'malediction_doute' }, { op: 'pick', what: 'remove', n: 1 }]);
  assert.equal(run.deck.length, n + 1);
  const curse = run.deck.find((c) => c.id === 'malediction_doute')!;
  run.resolvePick(curse.uid);
  assert.equal(run.deck.length, n);
  assert.equal(run.pending, null);
});
