import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bx, viewBestiary, type BxHelpers } from '../ui/bestiary.ts';
import { LIBRARY } from '../data/library.ts';
import { ENCOUNTERS } from '../data/monsters.ts';

/** Monstres qu'on peut croiser : dans une rencontre, invoqués ou nés d'une division (récursivement). */
function reachable(): Set<string> {
  const out = new Set(Object.values(ENCOUNTERS).flatMap((e) => e.monsters));
  for (let grew = true; grew;) {
    grew = false;
    for (const id of [...out]) {
      const m = LIBRARY.monsters[id];
      const kids = [m.splitInto, ...Object.values(m.moves).flatMap((mv) => mv.effects.flatMap((f) => (f.type === 'summon' ? [f.monster] : [])))];
      for (const k of kids) if (k && !out.has(k)) { out.add(k); grew = true; }
    }
  }
  return out;
}

const stub = new Proxy({}, { get: (_t, k) => (k === 'inRun' ? false : () => '') }) as BxHelpers;

test('bestiaire : chaque monstre a une fiche, chaque onglet se rend', () => {
  bx.rank = ''; bx.act = 0; bx.q = '';
  for (const id of reachable()) {
    bx.pick = id;
    const html = viewBestiary(stub, false);
    assert.ok(html.includes(`data-id="${id}"`), `${id} absent du bestiaire`);
  }
  for (const tab of ['cartes', 'objets', 'dofus', 'effets'] as const) {
    bx.tab = tab;
    assert.ok(viewBestiary(stub, true).length > 1000, tab);
  }
});
