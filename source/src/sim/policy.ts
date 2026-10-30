import type { Action, Combat, Enemy } from '../core/combat.ts';
import type { CardDef, CardTarget, CardType, Effect, Element } from '../core/types.ts';

type Move = Exclude<Action, { type: 'end' }>;

interface Playable {
  effects: Effect[];
  mode: CardTarget;
  cost: number;
  element: Element;
  type: CardType;
  def: CardDef;
}

function describe(c: Combat, a: Move): Playable {
  const inst = c.hand[a.handIndex];
  const def = c.cardDef(inst);
  return { effects: def.effects, mode: def.target, cost: c.costOf(inst), element: def.element, type: def.type, def };
}

/** Valeur approximative d'un coup : sert de base d'équilibrage, pas de vrai « bon joueur ». */
function value(c: Combat, a: Move): number {
  const p = describe(c, a);
  const targets: Enemy[] =
    p.mode === 'all_enemies' ? c.living() : p.mode === 'enemy' ? c.living().filter((e) => e.uid === a.target) : [];
  const needBlock = Math.max(0, c.incomingDamage() - c.player.block);
  const missingHp = c.player.maxHp - c.player.hp;
  const blockValue = (amt: number) => Math.min(amt, needBlock) + Math.max(0, amt - needBlock) * 0.1;
  let v = 0;
  let dealsDamage = false;
  for (const fx of p.effects) {
    switch (fx.type) {
      case 'damage':
      case 'drain':
        dealsDamage = true;
        for (const e of targets) {
          const d = c.estimateDamage(fx, e, p.def);
          const eff = Math.min(d, e.hp + e.block);
          v += eff;
          if (d >= e.hp + e.block) v += 6;
          if (fx.type === 'drain') v += 0.7 * Math.min(eff, missingHp);
        }
        break;
      case 'block':
        v += blockValue(c.baseAmount(fx, targets[0], p.def.id) + c.player.blockBonus);
        break;
      case 'loseHp':
        v -= fx.amount * (c.player.hp * 2 < c.player.maxHp ? 2 : 0.8);
        break;
      case 'charge':
        v += c.classe === 'cra' ? 3 * fx.amount : 0;
        break;
      case 'multiply':
        for (const e of targets) v += 0.9 * (e.status[fx.status] ?? 0) * (fx.factor - 1);
        break;
      case 'grant':
        // Un pouvoir rapporte d'autant plus qu'il reste de combat : on le joue tôt.
        v += c.turn <= 2 ? 16 : 8;
        break;
      case 'heal':
        v += 0.8 * Math.min(fx.amount, missingHp);
        break;
      case 'draw':
        v += 2 * fx.amount;
        break;
      case 'energy':
        v += 3 * fx.amount;
        break;
      case 'status': {
        const n = fx.on === 'self' ? 1 : fx.on === 'all_enemies' ? c.living().length : targets.length;
        if (fx.status === 'puissance') v += 4 * fx.amount * n;
        else if (fx.status === 'vulnerabilite') v += 2.5 * fx.amount * n;
        else if (fx.status === 'faiblesse') v += 1.5 * fx.amount * n;
        else if (fx.status === 'brulure') v += 0.7 * ((fx.amount * (fx.amount + 1)) / 2) * n;
        else if (fx.status === 'poison') v += 0.8 * fx.amount * 1.8 * n;
        else v += 1.5 * fx.amount * n;
        break;
      }
    }
  }
  const cost = p.cost;
  return v / Math.max(cost, 0.5);
}

export function pickBest(c: Combat): Move | null {
  let best: Move | null = null;
  let bestV = 0.3;
  for (const a of c.legalActions()) {
    if (a.type === 'end') continue;
    const v = value(c, a);
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return best;
}

/** Joue un combat complet avec la politique gloutonne. */
export function playGreedy(c: Combat): void {
  while (c.outcome === 'ongoing') {
    const best = pickBest(c);
    if (!best) c.endTurn();
    else c.playCard(best.handIndex, best.target);
  }
}
