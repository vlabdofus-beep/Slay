import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../game/run.ts';
test('preview = jeu réel', () => {
  for (const cl of ['iop', 'cra'] as const) for (let seed = 1; seed < 40; seed++) {
    const r = new Run(cl, seed, 'm', { gods: false });
    r.enterNode(r.availableNodes()[0]);
    const c = r.combat!;
    for (let t = 0; t < 6 && c.outcome === 'ongoing'; t++) {
      while (c.outcome === 'ongoing') {
        const i = c.hand.findIndex((inst) => !c.cardDef(inst).unplayable && c.costOf(inst) <= c.player.energy);
        if (i < 0) break;
        const tgt = c.living()[0]?.uid;
        const before = c.enemies.map((e) => [e.uid, e.hp] as const);
        const pv = c.preview(i, tgt)!;
        const hpBefore = c.player.hp;
        c.playCard(i, tgt);
        for (const [uid, hp] of before) {
          const e = c.enemies.find((x) => x.uid === uid)!;
          assert.equal(pv.enemies[uid]?.lost ?? 0, hp - e.hp, `seed ${seed} ${cl}`);
        }
        assert.equal(pv.player.lost, Math.max(0, hpBefore - c.player.hp));
      }
      if (c.outcome === 'ongoing') c.endTurn();
    }
  }
});
