// Bot à plusieurs : une table de 1 à 4 héros joue une partie complète (src/game/party.ts), toutes les décisions
// passant par des actions du journal, comme en ligne. Sert aux tests (pas de blocage) et à mesurer l'échelle.
import { Rng } from '../core/rng.ts';
import { ITEMS } from '../data/items.ts';
import { LIBRARY } from '../data/library.ts';
import { Party, type Member, type PartyAction } from '../game/party.ts';
import { chooseItem } from './itemPolicy.ts';
import { pickBest } from './policy.ts';

export interface PartyBotResult { won: boolean; end: 'victory' | 'defeat' | 'bloqué'; act: number; floor: number; actions: number; log: PartyAction[] }

/** Prochaine action d'un joueur, ou null s'il attend les autres. */
function nextAction(p: Party, i: number, rng: Rng): PartyAction | null {
  const run = p.runs[i];
  if (run.phase === 'victory' || run.phase === 'defeat') return null;
  const pend = run.pending;
  if (pend) {
    if (pend.kind === 'card') return [i, 'chooseCard', rng.pick(pend.options)];
    if (pend.kind === 'item') return [i, 'chooseItem', chooseItem(LIBRARY, ITEMS, run.itemEffects, run.deck, run.equipment, pend.options) ?? pend.options[0]];
    return [i, 'resolvePick', rng.pick(run.pickCandidates(pend.what)).uid];
  }
  switch (run.phase) {
    case 'dieu': return [i, 'takeBoon', rng.pick(run.god!.offer)];
    case 'evenement': {
      const ev = run.event!;
      if (ev.chosen !== null) return [i, 'leaveEvent'];
      const ok = run.eventPage()!.options.map((_, k) => k).filter((k) => run.optionState(k).ok);
      return [i, 'chooseOption', rng.pick(ok)];
    }
    case 'map': {
      if (run.availableNodes()[0] === 'dieu') return [i, 'enterNode', 'dieu'];
      const opts = p.voteOptions();
      if (!opts.length || p.votes[i] !== null) return null;
      const low = run.hp < run.maxHp * 0.5;
      const pref = opts.find((id) => (low ? run.map.nodes[id].type === 'zaap' : false));
      return [i, 'vote', pref ?? rng.pick(opts)];
    }
    case 'combat': {
      const c = run.combat!;
      if (c.isDown(run.seat) || c.seats[run.seat].ready) return null;
      c.useSeat(run.seat);
      const best = pickBest(c);
      return best ? [i, 'c.playCard', best.handIndex, best.target ?? null] : [i, 'c.endTurn'];
    }
    case 'reward': {
      const r = run.reward!;
      if (r.cardTaken === null && r.cards.length) return [i, 'takeCard', rng.pick(r.cards)];
      if (r.items.length && r.itemTaken === null) {
        const pick = chooseItem(LIBRARY, ITEMS, run.itemEffects, run.deck, run.equipment, r.items);
        if (pick) return [i, 'takeItem', pick];
      }
      return [i, 'leaveReward'];
    }
    case 'dofus': return [i, 'takeDofus', rng.pick(run.dofusOffer)];
    case 'marchand': return [i, 'leaveShop'];
    case 'zaap':
      if (!run.zaapUsed && run.hp < run.maxHp * 0.6) return [i, 'zaapRest'];
      return [i, 'leaveZaap'];
  }
  return null;
}

export function botParty(members: Member[], seed: number, maxActions = 20000): PartyBotResult {
  const p = new Party(members, seed);
  const rng = new Rng(seed * 2654435761);
  const log: PartyAction[] = [];
  let stuck = 0;
  while (!p.over && log.length < maxActions) {
    let acted = false;
    for (let i = 0; i < p.size && !p.over; i++) {
      const a = nextAction(p, i, rng);
      if (!a) continue;
      try { p.apply(a); log.push(a); acted = true; } catch { /* action refusée : on passe */ }
    }
    if (!acted && ++stuck > 3) break;
    if (acted) stuck = 0;
  }
  const r = p.runs[0];
  return { won: p.over === 'victory', end: p.over ?? 'bloqué', act: r.act, floor: (r.act - 1) * r.map.floors + r.stats.floor, actions: log.length, log };
}
