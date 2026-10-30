import { Rng } from './rng.ts';
import type {
  ActiveDef,
  CardDef,
  CardInstance,
  CardTarget,
  Effect,
  Element,
  Library,
  MonsterDef,
  Passives,
  StatusId,
  StatusMap,
} from './types.ts';
import { NO_PASSIVES } from './types.ts';

export const HAND_SIZE = 5;
export const MAX_HAND = 10;
export const BASE_ENERGY = 3;
export const MAX_TURNS = 60;

export interface Entity {
  hp: number;
  maxHp: number;
  block: number;
  status: StatusMap;
}

export interface ActiveState {
  def: ActiveDef;
  used: boolean;
}

export interface Player extends Entity {
  energy: number;
  /** Bonus de dégâts fixes par élément (items / panoplies). */
  dom: Record<Element, number>;
  /** Bonus d'armure fixe ajouté à chaque gain d'armure (items / panoplies). */
  blockBonus: number;
  passives: Passives;
  actives: ActiveState[];
  /** Éléments (hors neutre) déjà joués ce tour, pour le prisme. */
  turnElements: Element[];
  /** Cartes Air déjà jouées ce tour, pour la pioche Air. */
  airPlayed: number;
}

export interface Enemy extends Entity {
  uid: number;
  def: MonsterDef;
  moveId: string;
  cycleIndex: number;
  lastMoves: string[];
  dead: boolean;
}

export interface PlayerInit {
  hp: number;
  maxHp: number;
  dom?: Partial<Record<Element, number>>;
  blockBonus?: number;
  passives?: Passives;
  actives?: ActiveDef[];
}

export type Outcome = 'ongoing' | 'won' | 'lost';

/** Coefficient de difficulté global appliqué aux monstres (PV et dégâts de base). */
export interface MonsterScale {
  hp: number;
  damage: number;
}
export const DEFAULT_SCALE: MonsterScale = { hp: 1, damage: 1 };

/** Seul ce qui survit à un combat : les PV. Armure, statuts, énergie, piles, actifs : tout est remis à zéro.
 *  C'est ce qui garantit une fin de combat « propre ». */
export interface CombatResult {
  outcome: 'won' | 'lost';
  hp: number;
  turns: number;
}

export interface Intent {
  name: string;
  damage: number;
  hits: number;
  element: Element | null;
}

export type Action =
  | { type: 'play'; handIndex: number; target?: number }
  | { type: 'active'; index: number; target?: number }
  | { type: 'end' };

export interface AttackerCtx {
  status: StatusMap;
  dom: number;
}
export interface DefenderCtx {
  status: StatusMap;
  weak: readonly Element[];
  resist: readonly Element[];
}

/** Formule de dégâts unique, utilisée par le jeu, les aperçus d'intentions et les simulations. */
export function calcDamage(
  base: number,
  element: Element,
  atk: AttackerCtx,
  def: DefenderCtx,
): number {
  let d = base + (atk.status.puissance ?? 0) + atk.dom;
  if (atk.status.faiblesse) d *= 0.75;
  if (element !== 'neutre') {
    if (def.weak.includes(element)) d *= 1.5;
    else if (def.resist.includes(element)) d *= 0.5;
  }
  if (def.status.vulnerabilite) d *= 1.5;
  return Math.max(0, Math.floor(d));
}

export function resolveCard(lib: Library, inst: CardInstance): CardDef {
  const base = lib.cards[inst.id];
  if (!base) throw new Error(`Carte inconnue : ${inst.id}`);
  let def = base;
  if (inst.upgraded && base.upgrade) {
    def = { ...def, cost: base.upgrade.cost ?? base.cost, effects: base.upgrade.effects ?? base.effects };
  }
  if (inst.element && inst.element !== def.element) {
    const el = inst.element;
    def = {
      ...def,
      element: el,
      effects: def.effects.map((fx) => (fx.type === 'damage' || fx.type === 'drain' ? { ...fx, element: el } : fx)),
    };
  }
  return def;
}

function addStatus(e: Entity, id: StatusId, amount: number): void {
  e.status[id] = (e.status[id] ?? 0) + amount;
}

export class Combat {
  readonly lib: Library;
  readonly rng: Rng;
  readonly scale: MonsterScale;
  player: Player;
  enemies: Enemy[] = [];
  drawPile: CardInstance[] = [];
  hand: CardInstance[] = [];
  discardPile: CardInstance[] = [];
  exhaustPile: CardInstance[] = [];
  turn = 0;
  outcome: Outcome = 'ongoing';
  log: string[] = [];

  constructor(
    lib: Library,
    deck: CardInstance[],
    init: PlayerInit,
    enemyIds: string[],
    seed: number,
    scale: MonsterScale = DEFAULT_SCALE,
  ) {
    this.lib = lib;
    this.rng = new Rng(seed);
    this.scale = scale;
    this.player = {
      hp: init.hp,
      maxHp: init.maxHp,
      block: 0,
      status: {},
      energy: 0,
      dom: { terre: 0, feu: 0, eau: 0, air: 0, neutre: 0, ...init.dom },
      blockBonus: init.blockBonus ?? 0,
      passives: { ...NO_PASSIVES, ...init.passives },
      actives: (init.actives ?? []).map((def) => ({ def, used: false })),
      turnElements: [],
      airPlayed: 0,
    };
    enemyIds.forEach((id, i) => {
      const def = lib.monsters[id];
      if (!def) throw new Error(`Monstre inconnu : ${id}`);
      const hp = Math.max(1, Math.round(this.rng.range(def.hp[0], def.hp[1]) * scale.hp));
      this.enemies.push({
        uid: i,
        def,
        hp,
        maxHp: hp,
        block: 0,
        status: {},
        moveId: '',
        cycleIndex: 0,
        lastMoves: [],
        dead: false,
      });
    });
    this.drawPile = this.rng.shuffle([...deck]);
    for (const e of this.enemies) this.chooseMove(e);
    this.startPlayerTurn();
  }

  // ───────────── lecture ─────────────

  living(): Enemy[] {
    return this.enemies.filter((e) => !e.dead);
  }

  cardDef(inst: CardInstance): CardDef {
    return resolveCard(this.lib, inst);
  }

  result(): CombatResult {
    if (this.outcome === 'ongoing') throw new Error('Combat en cours');
    return { outcome: this.outcome, hp: this.player.hp, turns: this.turn };
  }

  /** Bonus prisme d'une carte de cet élément : +N par élément différent déjà joué ce tour. */
  prismeBonus(cardElement: Element | null): number {
    if (cardElement === null || !this.player.passives.prisme) return 0;
    const others = this.player.turnElements.filter((el) => el !== cardElement).length;
    return this.player.passives.prisme * others;
  }

  /** Dégâts qu'infligerait cet effet à cet ennemi, maintenant. `cardElement` null = actif d'item. */
  estimateDamage(fx: Effect, enemy: Enemy, cardElement: Element | null = null): number {
    if (fx.type !== 'damage' && fx.type !== 'drain') return 0;
    const per = this.playerHit(enemy, fx.amount + this.prismeBonus(cardElement), fx.element);
    return per * (fx.type === 'damage' ? (fx.hits ?? 1) : 1);
  }

  intent(e: Enemy): Intent {
    const move = e.def.moves[e.moveId];
    let damage = 0;
    let hits = 0;
    let element: Element | null = null;
    for (const fx of move.effects) {
      if (fx.type === 'damage' || fx.type === 'drain') {
        const n = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
        damage += n * this.enemyHit(e, fx.amount, fx.element);
        hits += n;
        element = fx.element;
      }
    }
    return { name: move.name, damage, hits, element };
  }

  /** Dégâts totaux annoncés par les ennemis vivants (avant armure). */
  incomingDamage(): number {
    return this.living().reduce((sum, e) => sum + this.intent(e).damage, 0);
  }

  legalActions(): Action[] {
    const actions: Action[] = [];
    if (this.outcome !== 'ongoing') return actions;
    const withTargets = (target: CardTarget, make: (t?: number) => Action) => {
      if (target === 'enemy') for (const e of this.living()) actions.push(make(e.uid));
      else actions.push(make());
    };
    this.hand.forEach((inst, handIndex) => {
      const def = this.cardDef(inst);
      if (def.cost > this.player.energy) return;
      withTargets(def.target, (target) => ({ type: 'play', handIndex, target }));
    });
    this.player.actives.forEach((a, index) => {
      if (!a.used) withTargets(a.def.target, (target) => ({ type: 'active', index, target }));
    });
    actions.push({ type: 'end' });
    return actions;
  }

  // ───────────── actions ─────────────

  playCard(handIndex: number, targetUid?: number): void {
    if (this.outcome !== 'ongoing') throw new Error('Combat terminé');
    const inst = this.hand[handIndex];
    if (!inst) throw new Error(`Pas de carte à l'index ${handIndex}`);
    const def = this.cardDef(inst);
    if (def.cost > this.player.energy) throw new Error(`Pas assez de PA pour ${def.name}`);
    const target = this.resolveTarget(def.target, targetUid);

    this.hand.splice(handIndex, 1);
    this.player.energy -= def.cost;
    this.log.push(`Joue ${def.name}${target ? ` sur ${target.def.name}` : ''}`);
    const hit = this.resolveEffects(def.effects, def.target, target, def.element);
    this.applyElementalPassives(def, hit);
    if (def.exhaust) this.exhaustPile.push(inst);
    else this.discardPile.push(inst);
    this.checkEnd();
  }

  /** Utilise l'actif d'un item rare : une fois par combat, sans coût, sans effets élémentaires. */
  useActive(index: number, targetUid?: number): void {
    if (this.outcome !== 'ongoing') throw new Error('Combat terminé');
    const a = this.player.actives[index];
    if (!a) throw new Error(`Pas d'actif à l'index ${index}`);
    if (a.used) throw new Error(`${a.def.name} déjà utilisé ce combat`);
    const target = this.resolveTarget(a.def.target, targetUid);
    a.used = true;
    this.log.push(`Actif ${a.def.name}${target ? ` sur ${target.def.name}` : ''}`);
    this.resolveEffects(a.def.effects, a.def.target, target, null);
    this.checkEnd();
  }

  endTurn(): void {
    if (this.outcome !== 'ongoing') throw new Error('Combat terminé');
    this.discardPile.push(...this.hand);
    this.hand = [];

    for (const e of this.living()) {
      e.block = 0;
      this.enemyAct(e);
      if (this.checkEnd()) return;
    }

    this.endOfRound();
    if (this.checkEnd()) return;

    for (const e of this.living()) this.chooseMove(e);
    if (this.turn >= MAX_TURNS) {
      this.outcome = 'lost';
      this.log.push('Limite de tours atteinte');
      return;
    }
    this.startPlayerTurn();
  }

  // ───────────── interne ─────────────

  private resolveTarget(mode: CardTarget, targetUid?: number): Enemy | undefined {
    if (mode !== 'enemy') return undefined;
    const target =
      targetUid === undefined
        ? this.living()[0]
        : this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) throw new Error('Cible invalide');
    return target;
  }

  private startPlayerTurn(): void {
    this.turn++;
    this.player.block = 0;
    this.player.energy = BASE_ENERGY;
    this.player.turnElements = [];
    this.player.airPlayed = 0;
    this.drawCards(HAND_SIZE);
  }

  private drawCards(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= MAX_HAND) return;
      if (this.drawPile.length === 0) {
        if (this.discardPile.length === 0) return;
        this.drawPile = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
      }
      this.hand.push(this.drawPile.pop() as CardInstance);
    }
  }

  private chooseMove(e: Enemy): void {
    const p = e.def.pattern;
    let next: string;
    if (p.kind === 'cycle') {
      next = p.order[e.cycleIndex % p.order.length];
      e.cycleIndex++;
    } else {
      const ids = Object.keys(p.weights);
      const last = e.lastMoves.slice(-p.maxRepeat);
      const blocked = last.length === p.maxRepeat && last.every((m) => m === last[0]) ? last[0] : '';
      const pool = ids.filter((id) => id !== blocked);
      const total = pool.reduce((s, id) => s + p.weights[id], 0);
      let roll = this.rng.next() * total;
      next = pool[pool.length - 1];
      for (const id of pool) {
        roll -= p.weights[id];
        if (roll < 0) {
          next = id;
          break;
        }
      }
    }
    e.moveId = next;
    e.lastMoves.push(next);
  }

  private playerHit(e: Enemy, base: number, element: Element): number {
    return calcDamage(
      base,
      element,
      { status: this.player.status, dom: this.player.dom[element] },
      { status: e.status, weak: e.def.weak, resist: e.def.resist },
    );
  }

  private enemyHit(e: Enemy, base: number, element: Element): number {
    return calcDamage(
      Math.round(base * this.scale.damage),
      element,
      { status: e.status, dom: 0 },
      { status: this.player.status, weak: [], resist: [] },
    );
  }

  /** Applique des dégâts : l'armure absorbe d'abord. Retourne les PV réellement perdus. */
  private applyDamage(t: Entity, dmg: number): number {
    const absorbed = Math.min(t.block, dmg);
    t.block -= absorbed;
    const lost = dmg - absorbed;
    t.hp = Math.max(0, t.hp - lost);
    return lost;
  }

  private gainBlock(amount: number): void {
    this.player.block += amount + this.player.blockBonus;
  }

  private heal(amount: number): void {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
  }

  private markIfDead(e: Enemy): void {
    if (!e.dead && e.hp <= 0) {
      e.dead = true;
      this.log.push(`${e.def.name} est vaincu`);
    }
  }

  /** Résout une liste d'effets du joueur. Retourne les ennemis touchés par des dégâts.
   *  `cardElement` null = actif d'item (pas de prisme). */
  private resolveEffects(
    effects: Effect[],
    mode: CardTarget,
    target: Enemy | undefined,
    cardElement: Element | null,
  ): Set<Enemy> {
    const targets = mode === 'all_enemies' ? this.living() : target ? [target] : [];
    const bonus = this.prismeBonus(cardElement);
    const hit = new Set<Enemy>();
    for (const fx of effects) {
      switch (fx.type) {
        case 'damage':
        case 'drain': {
          const hits = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
          for (let h = 0; h < hits; h++) {
            for (const e of targets) {
              if (e.dead) continue;
              const lost = this.applyDamage(e, this.playerHit(e, fx.amount + bonus, fx.element));
              hit.add(e);
              if (fx.type === 'drain') this.heal(lost);
              this.markIfDead(e);
            }
          }
          break;
        }
        case 'block':
          this.gainBlock(fx.amount);
          break;
        case 'heal':
          this.heal(fx.amount);
          break;
        case 'draw':
          this.drawCards(fx.amount);
          break;
        case 'energy':
          this.player.energy += fx.amount;
          break;
        case 'status': {
          if (fx.on === 'self') addStatus(this.player, fx.status, fx.amount);
          else if (fx.on === 'all_enemies') for (const e of this.living()) addStatus(e, fx.status, fx.amount);
          else for (const e of targets) if (!e.dead) addStatus(e, fx.status, fx.amount);
          break;
        }
      }
    }
    return hit;
  }

  /** Effets secondaires élémentaires (paliers d'affinité), puis mémorisation de l'élément pour le prisme. */
  private applyElementalPassives(def: CardDef, hit: Set<Enemy>): void {
    const p = this.player.passives;
    const isAttack = def.type === 'attaque';
    switch (def.element) {
      case 'terre':
        if (p.terreArmure) this.player.block += p.terreArmure;
        break;
      case 'feu':
        if (p.feuBrulure && isAttack) for (const e of hit) if (!e.dead) addStatus(e, 'brulure', p.feuBrulure);
        break;
      case 'eau':
        if (p.eauSoin && isAttack) this.heal(p.eauSoin);
        break;
      case 'air':
        if (this.player.airPlayed < p.airPioche) this.drawCards(1);
        this.player.airPlayed++;
        break;
      default:
        break;
    }
    if (def.element !== 'neutre' && !this.player.turnElements.includes(def.element)) {
      this.player.turnElements.push(def.element);
    }
  }

  private enemyAct(e: Enemy): void {
    const move = e.def.moves[e.moveId];
    this.log.push(`${e.def.name} : ${move.name}`);
    for (const fx of move.effects) {
      switch (fx.type) {
        case 'damage':
        case 'drain': {
          const hits = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
          for (let h = 0; h < hits; h++) {
            const lost = this.applyDamage(this.player, this.enemyHit(e, fx.amount, fx.element));
            if (fx.type === 'drain') e.hp = Math.min(e.maxHp, e.hp + lost);
            if (this.player.hp <= 0) return;
          }
          break;
        }
        case 'block':
          e.block += fx.amount;
          break;
        case 'heal':
          e.hp = Math.min(e.maxHp, e.hp + fx.amount);
          break;
        case 'status':
          if (fx.on === 'self') addStatus(e, fx.status, fx.amount);
          else if (fx.on === 'target') addStatus(this.player, fx.status, fx.amount);
          break;
        default:
          break;
      }
    }
  }

  /** Fin de round : brûlure (contourne l'armure) puis usure des durées. */
  private endOfRound(): void {
    const entities: Entity[] = [this.player, ...this.living()];
    for (const t of entities) {
      const burn = t.status.brulure ?? 0;
      if (burn > 0) {
        t.hp = Math.max(0, t.hp - burn);
        t.status.brulure = burn - 1;
      }
    }
    for (const e of this.enemies) this.markIfDead(e);
    for (const t of entities) {
      for (const id of ['faiblesse', 'vulnerabilite'] as const) {
        const v = t.status[id] ?? 0;
        if (v > 0) t.status[id] = v - 1;
      }
    }
  }

  private checkEnd(): boolean {
    if (this.outcome !== 'ongoing') return true;
    if (this.player.hp <= 0) this.outcome = 'lost';
    else if (this.living().length === 0) this.outcome = 'won';
    return this.outcome !== 'ongoing';
  }
}
