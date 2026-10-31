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
  let killDmg = 0;
  const run = (effects: Effect[], w: number): void => {
  for (const fx of effects) {
    switch (fx.type) {
      case 'damage':
      case 'drain':
        dealsDamage = true;
        for (const e of targets) {
          const d = c.estimateDamage(fx, e, p.def);
          killDmg += d;
          const eff = Math.min(d, e.hp + e.block);
          v += w * eff;
          if (d >= e.hp + e.block) v += w * 6;
          if (fx.type === 'drain') v += w * 0.7 * Math.min(eff, missingHp);
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
        const n = w * (fx.on === 'self' ? 1 : fx.on === 'all_enemies' ? c.living().length : targets.length);
        if (fx.status === 'puissance') v += 4 * fx.amount * n;
        else if (fx.status === 'vulnerabilite') v += 2.5 * fx.amount * n;
        else if (fx.status === 'faiblesse') v += 1.5 * fx.amount * n;
        else if (fx.status === 'brulure') v += 0.7 * ((fx.amount * (fx.amount + 1)) / 2) * n;
        else if (fx.status === 'poison') v += 0.8 * fx.amount * 1.8 * n;
        else if (fx.status === 'telefrag') {
          // Une marque vaut ce que rapportera l'attaque qui la consomme (pioche du passif, bonus des cartes).
          const fresh = (fx.on === 'all_enemies' ? c.living() : targets).filter((e) => !e.status.telefrag).length;
          const attacksLeft = c.hand.some((i, k) => k !== a.handIndex && c.cardDef(i).type === 'attaque');
          v += w * fresh * (c.classe === 'xelor' ? (attacksLeft ? 1.5 : 0.8) : 0.2);
        } else if (fx.status === 'ralenti') {
          for (const e of fx.on === 'all_enemies' ? c.living() : targets) v += w * 0.9 * Math.min(fx.amount, c.intent(e).damage);
        } else if (fx.status === 'echeance') v += w * 0.9 * fx.amount * (fx.on === 'all_enemies' ? c.living().length : targets.length);
        else v += 1.5 * fx.amount * n;
        break;
      }
      case 'if': {
        const t = targets[0];
        const ok = fx.cond === 'cible_morte' ? !!t && killDmg >= t.hp + t.block : c.checkCond(fx.cond, t);
        const before = v;
        run(fx.then, 1);
        v = before + (v - before) * w * (ok ? 1 : 0.1);
        break;
      }
      case 'spend':
        if (fx.what === 'puissance') v -= w * 3 * Math.max(0, c.player.status.puissance ?? 0);
        else v -= w * 2 * c.aim;
        break;
      case 'echo':
        v += w * 7;
        break;
      case 'discount':
        v += w * 2.5 * fx.amount;
        break;
      case 'later': {
        // Un effet différé vaut un peu moins qu'immédiat ; l'armure du tour suivant vaut contre l'attaque d'après.
        const before = v;
        for (const t of fx.then) {
          if (t.type === 'block') v += 0.5 * t.amount;
          else if (t.type === 'draw') v += 1.8 * t.amount;
          else if (t.type === 'energy') v += 2.8 * t.amount;
        }
        v = before + (v - before) * w * (fx.turns ?? 1);
        break;
      }
      case 'rewind': {
        // Vaut surtout pour une carte chère : la rejouer coûtera ses PA de nouveau.
        const last = c.lastPlayed;
        v += last ? w * (2 + 3 * c.cardDef(last.inst).cost) : -2;
        break;
      }
      case 'regain':
        v += w * 0.8 * Math.min(c.lostEnemyTurn, missingHp);
        break;
      case 'returnToHand':
        v += w * 3;
        break;
      case 'spread':
        for (const e of targets) v += w * 0.8 * (e.status[fx.status] ?? 0) * Math.max(0, c.living().length - 1);
        break;
      case 'detonate':
        for (const e of targets) v += w * Math.min(e.hp, e.status[fx.status] ?? 0);
        break;
      case 'exhaustHand':
        v -= w * 1.5 * (c.hand.length - 1);
        break;
      case 'addCard':
        v += w * 3.5 * fx.count;
        break;
      case 'consume':
        for (const e of targets) if (e.status.telefrag) {
          const before = v;
          run(fx.then, 1);
          v = before + (v - before) * w + w * 2;
        }
        break;
    }
  }
  };
  run(p.effects, 1);
  // Téléfrag : une attaque qui touche un ennemi marqué consomme la marque (pioche du passif, pouvoirs).
  if (p.type === 'attaque' && dealsDamage) {
    const marked = targets.filter((e) => e.status.telefrag).length;
    if (marked) v += (c.classe === 'xelor' && c.telefragDraws < 1 ? 2 : 0) + 0.5 * marked;
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
