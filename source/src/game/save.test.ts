import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Run } from './run.ts';
import { record, replay, type SaveFile } from './save.ts';
import { playGreedy } from '../sim/policy.ts';

/** Joue une run avec l'enregistrement branché, en s'arrêtant après `stop` actions ; renvoie la run et sa dernière sauvegarde. */
function play(seed: number, stop: number): { run: Run; save: SaveFile } {
  const run = new Run(seed % 2 ? 'iop' : 'cra', seed);
  let save: SaveFile | null = null;
  record(run, (s) => { save = JSON.parse(JSON.stringify(s)); });
  for (let guard = 0; guard < 2000 && run.phase !== 'victory' && run.phase !== 'defeat'; guard++) {
    if ((save as SaveFile | null)?.actions.length ?? 0 >= stop) if (((save as SaveFile | null)?.actions.length ?? 0) >= stop) break;
    const p = run.pending;
    if (p) {
      if (p.kind === 'card') run.chooseCard(p.options[0]);
      else if (p.kind === 'item') run.chooseItem(p.options[0]);
      else run.resolvePick(run.pickCandidates(p.what)[0].uid);
      continue;
    }
    switch (run.phase) {
      case 'dieu': run.takeBoon(run.god!.offer[seed % 3]); break;
      case 'map': run.enterNode(run.availableNodes()[guard % run.availableNodes().length]); break;
      case 'combat': {
        const c = run.combat!;
        // une action de combat à la fois, pour pouvoir s'arrêter au milieu d'un combat
        const i = c.hand.findIndex((x) => !c.cardDef(x).unplayable && c.costOf(x) <= c.player.energy);
        if (i >= 0) c.playCard(i, c.living()[0]?.uid); else c.endTurn();
        run.checkCombatEnd();
        break;
      }
      case 'reward': run.takeCard(run.reward!.cards[0]); if (run.reward!.items.length) run.takeItem(run.reward!.items[0]); run.leaveReward(); break;
      case 'evenement': {
        const ev = run.event!;
        if (ev.chosen === null) run.chooseOption([0, 1, 2, 3].find((k) => run.optionState(k).ok)!);
        else run.leaveEvent();
        break;
      }
      case 'marchand': run.leaveShop(); break;
      case 'zaap': run.zaapRest(); run.leaveZaap(); break;
      case 'dofus': run.takeDofus(run.dofusOffer[0]); break;
    }
  }
  void playGreedy;
  return { run, save: save! };
}

const state = (r: Run) => JSON.stringify({
  phase: r.phase, act: r.act, hp: r.hp, kamas: r.kamas, deck: r.deck, equipment: r.equipment, boons: r.boons, relics: r.relics,
  position: r.position, combat: r.combat ? { hand: r.combat.hand, hp: r.combat.enemies.map((e) => e.hp), turn: r.combat.turn, energy: r.combat.player.energy } : null,
});

test('une run rejouée depuis sa sauvegarde retrouve exactement le même état, même au milieu d\'un combat', () => {
  for (const [seed, stop] of [[1, 12], [2, 40], [3, 95], [4, 160], [5, 260], [6, 400]]) {
    const { run, save } = play(seed, stop);
    const back = replay(JSON.parse(JSON.stringify(save)));
    assert.ok(back, `seed ${seed} : rejeu impossible`);
    assert.equal(back!.drift, false, `seed ${seed} : écart avec le résumé`);
    assert.equal(state(back!.run), state(run), `seed ${seed} : état différent après ${save.actions.length} actions`);
  }
});

test('une sauvegarde abîmée est refusée proprement', () => {
  assert.equal(replay({ v: 1, classe: 'iop', seed: 1, gender: 'm', actions: [['enterNode', 'nulle-part']], meta: null as never }), null);
  assert.equal(replay(null as never), null);
});

test('la prévisualisation ne joue jamais la carte pour de vrai, même avec la sauvegarde branchée', () => {
  const run = new Run('iop', 21, 'm', { gods: false });
  const saves: SaveFile[] = [];
  record(run, (s) => saves.push(s));
  run.enterNode(run.availableNodes()[0]);
  const c = run.combat!;
  const before = JSON.stringify({ hand: c.hand, hp: c.enemies.map((e) => e.hp), pa: c.player.energy });
  const n = saves.length;
  for (let i = 0; i < c.hand.length; i++) for (const e of c.living()) c.preview(i, e.uid);
  assert.equal(JSON.stringify({ hand: c.hand, hp: c.enemies.map((e) => e.hp), pa: c.player.energy }), before);
  assert.equal(saves.length, n, 'aucune action enregistrée par la prévisualisation');
  const pv = c.preview(0, c.living()[0].uid)!;
  const hp0 = c.living()[0].hp;
  c.playCard(0, c.living()[0].uid);
  assert.equal(hp0 - c.enemies[0].hp, pv.enemies[c.enemies[0].uid]?.lost ?? 0, 'la prévisualisation dit vrai');
});
