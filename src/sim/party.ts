// Bot à plusieurs : une table de 1 à 4 héros joue une partie complète (src/game/party.ts), toutes les décisions
// passant par des actions du journal, comme en ligne. Sert aux tests (pas de blocage) et à mesurer l'échelle.
// Le chemin se vote comme un seul joueur (le plus blessé) : sinon chacun tire une case et le Zaap ne passe jamais.
import { Rng } from '../core/rng.ts';
import { ITEMS } from '../data/items.ts';
import { LIBRARY } from '../data/library.ts';
import { Party, type Member, type PartyAction } from '../game/party.ts';
import { chooseItem } from './itemPolicy.ts';
import { pickBest } from './policy.ts';

export interface PartyBotResult { won: boolean; end: 'victory' | 'defeat' | 'bloqué'; act: number; floor: number; actions: number; log: PartyAction[] }

const isStrike = (id: string) => { const d = LIBRARY.cards[id]; return d.rarity === 'base' && d.type === 'attaque' && !d.spellId && !d.token; };

/** La table vote comme un seul joueur : le plus blessé décide. Les autres suivent le premier vote. */
function tableVote(p: Party, rng: Rng): string {
  const followed = p.votes.find((v) => v !== null);
  if (followed) return followed;
  const nodes = p.voteOptions().map((id) => p.runs[0].map.nodes[id]);
  const low = Math.min(...p.runs.map((r) => r.hp / Math.max(1, r.maxHp)));
  const zaap = nodes.find((n) => n.type === 'zaap');
  if (low < 0.5 && zaap) return zaap.id;
  const elite = nodes.find((n) => n.type === 'elite');
  if (low > 0.8 && elite) return elite.id;
  return rng.pick(nodes).id;
}

/** Prochaine action d'un joueur, ou null s'il attend les autres. */
function nextAction(p: Party, i: number, rng: Rng): PartyAction | null {
  const run = p.runs[i];
  if (run.phase === 'victory' || run.phase === 'defeat') return null;
  const pend = run.pending;
  if (pend) {
    if (pend.kind === 'card') return [i, 'chooseCard', rng.pick(pend.options)];
    if (pend.kind === 'item') return [i, 'chooseItem', chooseItem(LIBRARY, ITEMS, run.itemEffects, run.deck, run.equipment, pend.options) ?? pend.options[0]];
    const c = run.pickCandidates(pend.what);
    const bad = c.find((x) => LIBRARY.cards[x.id].curse) ?? c.find((x) => isStrike(x.id));
    const uid = (pend.what === 'remove' || pend.what === 'transform') && bad ? bad.uid : rng.pick(c).uid;
    return [i, 'resolvePick', uid];
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
      return [i, 'vote', tableVote(p, rng)];
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
    case 'marchand': {
      const shop = run.shop!;
      const basic = run.deck.find((c) => isStrike(c.id));
      if (basic && !shop.removed && run.kamas >= shop.removePrice) return [i, 'removeCard', basic.uid];
      const affordable = shop.items.filter((x) => !x.sold && x.price <= run.kamas).map((x) => x.id);
      const pick = affordable.length ? chooseItem(LIBRARY, ITEMS, run.itemEffects, run.deck, run.equipment, affordable) : null;
      if (pick) return [i, 'buyItem', pick];
      const card = shop.cards.find((x) => !x.sold && x.price <= run.kamas && LIBRARY.cards[x.id].rarity === 'rare');
      if (card) return [i, 'buyCard', card.id];
      return [i, 'leaveShop'];
    }
    case 'zaap':
      if (!run.zaapUsed && run.hp < run.maxHp * 0.6 && run.zaapHealAmount() > 0) return [i, 'zaapRest'];
      if (!run.zaapUsed) {
        const c = run.deck.filter((x) => !x.upgraded);
        if (c.length) return [i, 'zaapUpgrade', rng.pick(c).uid];
      }
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
