import type { Action, Combat, Enemy } from '../core/combat.ts';
import type { CardTarget, CardType, Effect, Element } from '../core/types.ts';

type Move = Exclude<Action, { type: 'end' }>;

interface Playable {
  effects: Effect[];
  mode: CardTarget;
  cost: number;
  /** null = actif d'item */
  element: Element | null;
  type: CardType | null;
}

function describe(c: Combat, a: Move): Playable {
  if (a.type === 'play') {
    const def = c.cardDef(c.hand[a.handIndex]);
    return { effects: def.effects, mode: def.target, cost: def.cost, element: def.element, type: def.type };
  }
  const act = c.player.actives[a.index].def;
  return { effects: act.effects, mode: act.target, cost: 0, element: null, type: null };
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
          const d = c.estimateDamage(fx, e, p.element);
          const eff = Math.min(d, e.hp + e.block);
          v += eff;
          if (d >= e.hp + e.block) v += 6;
          if (fx.type === 'drain') v += 0.7 * Math.min(eff, missingHp);
        }
        break;
      case 'block':
        v += blockValue(fx.amount + c.player.blockBonus);
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
        break;
      }
    }
  }
  // Effets secondaires élémentaires
  const pas = c.player.passives;
  if (p.element === 'terre') v += blockValue(pas.terreArmure);
  if (p.element === 'feu' && p.type === 'attaque' && dealsDamage) {
    v += 0.7 * ((pas.feuBrulure * (pas.feuBrulure + 1)) / 2) * targets.length;
  }
  if (p.element === 'eau' && p.type === 'attaque') v += 0.8 * Math.min(pas.eauSoin, missingHp);
  if (p.element === 'air' && c.player.airPlayed < pas.airPioche) v += 2;
  // Actif : à garder pour un moment utile, donc légère pénalité fixe.
  const cost = a.type === 'active' ? 1 : p.cost;
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
    else if (best.type === 'play') c.playCard(best.handIndex, best.target);
    else c.useActive(best.index, best.target);
  }
}
