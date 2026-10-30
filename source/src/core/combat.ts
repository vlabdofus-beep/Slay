import { REWARD_BY_ID, TRIGGER_BY_ID, perTurn, type EventId, type EvCtx, type ItemEffect, type RewardDef, type RuleId, type TriggerDef } from './effects.ts';
import { Rng } from './rng.ts';
import type {
  CardDef,
  CardInstance,
  CardTarget,
  Effect,
  Element,
  Library,
  MonsterDef,
  MonsterPower,
  StatusId,
  StatusMap,
} from './types.ts';

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

export interface Player extends Entity {
  energy: number;
  /** Bonus de dégâts fixes par élément (objets). */
  dom: Record<Element, number>;
  /** Bonus d'armure fixe ajouté à chaque gain d'armure (objets). */
  blockBonus: number;
}

export interface Enemy extends Entity {
  uid: number;
  def: MonsterDef;
  moveId: string;
  cycleIndex: number;
  lastMoves: string[];
  dead: boolean;
  /** État des mécaniques du monstre. */
  m: {
    turns: number; hurtOnce: boolean; asleep: number; lostThisTurn: number; artefact: number;
    stolen: number; lastEl: Element | null; phased: boolean; split: boolean;
    /** S'est enfui (voleur) ou s'est divisé : ne compte pas comme une victoire sur lui. */
    gone?: 'fui' | 'divise' | 'explose';
  };
}

const MAX_FOES = 5;
const DEBUFFS: StatusId[] = ['faiblesse', 'vulnerabilite', 'brulure', 'poison', 'erosion', 'etourdi'];
const power = <K extends MonsterPower['kind']>(e: Enemy, k: K) =>
  e.def.powers?.find((p) => p.kind === k) as Extract<MonsterPower, { kind: K }> | undefined;

export interface PlayerInit {
  hp: number;
  maxHp: number;
  dom?: Partial<Record<Element, number>>;
  blockBonus?: number;
  /** Effets des objets équipés (tirés au début de la run) et des Dofus ; `src` = objet d'origine. */
  effects?: (ItemEffect & { src?: string })[];
  /** Résurrection disponible (Dofus, une fois par run). */
  revive?: boolean;
}

export type Outcome = 'ongoing' | 'won' | 'lost';

/** Coefficient de difficulté global appliqué aux monstres (PV et dégâts de base). */
export interface MonsterScale {
  hp: number;
  damage: number;
}
export const DEFAULT_SCALE: MonsterScale = { hp: 1, damage: 1 };

/** Seul ce qui survit à un combat : les PV (et la prospection gagnée). Armure, statuts, énergie, piles :
 *  tout est remis à zéro. C'est ce qui garantit une fin de combat « propre ». */
export interface CombatResult {
  outcome: 'won' | 'lost';
  hp: number;
  turns: number;
  prospection: { next: number; run: number };
  /** La résurrection a servi pendant ce combat. */
  revived: boolean;
  /** Kamas emportés par des voleurs en fuite. */
  kamasStolen: number;
}

export interface Intent {
  name: string;
  damage: number;
  hits: number;
  element: Element | null;
  stunned: boolean;
  /** Ce que fait le monstre à la place d'une attaque : « Endormi », « Explose ! », « S'enfuit »… */
  note?: string;
}

export type Action =
  | { type: 'play'; handIndex: number; target?: number }
  | { type: 'end' };

export interface AttackerCtx {
  status: StatusMap;
  dom: number;
  /** Multiplicateur de la faiblesse de l'attaquant (0,75 par défaut). */
  weakMul?: number;
}
export interface DefenderCtx {
  status: StatusMap;
  weak: readonly Element[];
  resist: readonly Element[];
  /** Multiplicateur de la vulnérabilité du défenseur (1,5 par défaut). */
  vulnMul?: number;
  /** Multiplicateur si le défenseur est étourdi (règle « étourdi fragile »). */
  stunMul?: number;
}

/** Formule de dégâts unique, utilisée par le jeu, les aperçus d'intentions et les simulations. */
export function calcDamage(base: number, element: Element, atk: AttackerCtx, def: DefenderCtx): number {
  let d = base + (atk.status.puissance ?? 0) + atk.dom;
  if (atk.status.faiblesse) d *= atk.weakMul ?? 0.75;
  if (element !== 'neutre') {
    if (def.weak.includes(element)) d *= 1.5;
    else if (def.resist.includes(element)) d *= 0.5;
  }
  if (def.status.vulnerabilite) d *= def.vulnMul ?? 1.5;
  if (def.status.etourdi && def.stunMul) d *= def.stunMul;
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

/** Effet d'un objet : chaque objet ne peut se déclencher qu'un nombre limité de fois par tour (RewardDef.perTurn). */
interface Handler { trigger: TriggerDef; reward: RewardDef; amount: number; used: number; src: string }

const ZERO_EL = (): Record<Element, number> => ({ terre: 0, feu: 0, eau: 0, air: 0, neutre: 0 });

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

  // ── suivi pour les effets d'objets ──
  readonly rules: Set<RuleId>;
  private readonly handlers: Partial<Record<EventId, Handler[]>> = {};
  /** Cartes jouées ce tour / ce combat, et par élément. */
  turnCards = 0;
  combatCards = 0;
  turnEl: Record<Element, number> = ZERO_EL();
  combatEl: Record<Element, number> = ZERO_EL();
  hpLostThisCombat = 0;
  /** Réduction de coût de la prochaine carte. */
  discount = 0;
  /** Prospection gagnée pendant le combat (prochain combat / reste de la run). */
  prospection = { next: 0, run: 0 };
  private tripleDone = false;
  private statusUid = 0;
  /** Déclenchements de chaque objet depuis le début du combat (l'interface les fait briller). */
  fired: Record<string, number> = {};

  private reviveAvailable = false;
  revived = false;
  private depth = 0;
  /** Élément de ce qui inflige des dégâts en ce moment (pour « un sort Feu achève un ennemi »). */
  private srcElement: Element | null = null;

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
      dom: { ...ZERO_EL(), ...init.dom },
      blockBonus: init.blockBonus ?? 0,
    };
    this.rules = new Set();
    for (const e of init.effects ?? []) {
      if (e.kind === 'rule') { this.rules.add(e.rule); continue; }
      for (const p of e.parts) {
        const trigger = TRIGGER_BY_ID[p.trigger], reward = REWARD_BY_ID[p.reward];
        if (!trigger || !reward) continue;
        (this.handlers[trigger.event] ??= []).push({ trigger, reward, amount: p.amount, used: 0, src: e.src ?? '' });
      }
    }
    this.reviveAvailable = !!init.revive;
    for (const id of enemyIds) this.spawn(id);
    for (const e of this.enemies) {
      if (this.rules.has('ocre')) this.addStatus(e, 'puissance', 1);
      if (this.rules.has('cauchemar')) this.addStatus(e, 'vulnerabilite', 3);
    }
    this.drawPile = this.rng.shuffle([...deck]);
    for (const e of this.enemies) this.chooseMove(e);
    this.startPlayerTurn(true);
    this.emit('combatStart');
    this.checkEnd();
  }

  // ───────────── lecture ─────────────

  living(): Enemy[] {
    return this.enemies.filter((e) => !e.dead);
  }

  cardDef(inst: CardInstance): CardDef {
    return resolveCard(this.lib, inst);
  }

  /** Coût réel d'une carte maintenant (réductions et règles comprises). */
  costOf(inst: CardInstance): number {
    const first = this.rules.has('premiere_gratuite') && this.turnCards === 0 ? 1 : 0;
    return Math.max(0, this.cardDef(inst).cost - this.discount - first);
  }

  /** Déclenchements déjà utilisés ce tour par un objet, et sa limite (pour l'interface). */
  usage(src: string): { used: number; limit: number } | null {
    let used = 0, limit = 0;
    for (const list of Object.values(this.handlers)) for (const h of list ?? []) {
      if (h.src !== src || !['cardPlayed', 'enemyKilled', 'hpLost', 'blockGained'].includes(h.trigger.event) || h.trigger.single) continue;
      used = Math.max(used, h.used);
      limit = Math.max(limit, perTurn(h.reward));
    }
    return limit ? { used, limit } : null;
  }

  turnElementsCount(): number {
    return (['terre', 'feu', 'eau', 'air'] as const).filter((el) => this.turnEl[el] > 0).length;
  }

  result(): CombatResult {
    if (this.outcome === 'ongoing') throw new Error('Combat en cours');
    const kamasStolen = this.enemies.filter((e) => e.m.gone === 'fui').reduce((s, e) => s + e.m.stolen, 0);
    return { outcome: this.outcome, hp: this.player.hp, turns: this.turn, prospection: { ...this.prospection }, revived: this.revived, kamasStolen };
  }

  /** Dégâts qu'infligerait cet effet à cet ennemi, maintenant. */
  estimateDamage(fx: Effect, enemy: Enemy): number {
    if (fx.type !== 'damage' && fx.type !== 'drain') return 0;
    const per = this.playerHit(enemy, fx.amount, fx.element);
    return per * (fx.type === 'damage' ? (fx.hits ?? 1) : 1);
  }

  private stunNeed(e: Enemy): number {
    return e.def.boss ? 2 : 1;
  }

  intent(e: Enemy): Intent {
    const move = e.def.moves[e.moveId];
    const stunned = (e.status.etourdi ?? 0) >= this.stunNeed(e);
    let damage = 0;
    let hits = 0;
    let element: Element | null = null;
    const note = this.specialNote(e);
    if (note) {
      const ex = power(e, 'explosion');
      if (ex && note === 'Explose !') damage = this.enemyHit(e, ex.dmg, 'feu'), hits = 1;
      return { name: note, damage, hits, element: null, stunned: false, note };
    }
    if (!stunned) for (const fx of move.effects) {
      if (fx.type === 'damage' || fx.type === 'drain') {
        const n = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
        damage += n * this.enemyHit(e, fx.amount, fx.element);
        hits += n;
        element = fx.element;
      }
    }
    return { name: stunned ? 'Étourdi' : move.name, damage, hits, element, stunned };
  }

  /** Action spéciale du prochain tour du monstre (sommeil, explosion, fuite), ou null. */
  specialNote(e: Enemy): string | null {
    if (e.m.asleep > 0) return 'Endormi';
    const ex = power(e, 'explosion');
    if (ex) return e.m.turns + 1 >= ex.turns ? 'Explose !' : null;
    const v = power(e, 'voleur');
    if (v && e.m.turns + 1 >= v.turns) return 'S\'enfuit';
    return null;
  }

  /** Tours restants avant l'explosion ou la fuite (pour l'interface). */
  countdown(e: Enemy): number | null {
    const ex = power(e, 'explosion');
    if (ex) return Math.max(0, ex.turns - e.m.turns);
    const v = power(e, 'voleur');
    if (v) return Math.max(0, v.turns - e.m.turns);
    return null;
  }

  /** Dégâts totaux annoncés par les ennemis vivants (avant armure). */
  incomingDamage(): number {
    return this.living().reduce((sum, e) => sum + this.intent(e).damage, 0);
  }

  legalActions(): Action[] {
    const actions: Action[] = [];
    if (this.outcome !== 'ongoing') return actions;
    this.hand.forEach((inst, handIndex) => {
      const def = this.cardDef(inst);
      if (def.unplayable || this.costOf(inst) > this.player.energy) return;
      if (def.target === 'enemy') for (const e of this.living()) actions.push({ type: 'play', handIndex, target: e.uid });
      else actions.push({ type: 'play', handIndex });
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
    const cost = this.costOf(inst);
    if (def.unplayable) throw new Error(`${def.name} ne peut pas être jouée`);
    if (cost > this.player.energy) throw new Error(`Pas assez de PA pour ${def.name}`);
    const target = this.resolveTarget(def.target, targetUid);

    this.hand.splice(handIndex, 1);
    this.player.energy -= cost;
    this.discount = 0;
    this.log.push(`Joue ${def.name}${target ? ` sur ${target.def.name}` : ''}`);
    const twice = this.rules.has('double_premier') && this.combatCards === 0;
    const hits = this.resolveEffects(def, target);
    if (twice && this.outcome === 'ongoing') {
      const again = target && target.dead ? undefined : target;
      if (def.target !== 'enemy' || again || this.living().length) {
        this.log.push(`${def.name} est lancé une seconde fois`);
        for (const e of this.resolveEffects(def, again ?? (def.target === 'enemy' ? this.living()[0] : undefined))) hits.add(e);
      }
    }
    if (def.exhaust) this.exhaustPile.push(inst);
    else this.discardPile.push(inst);

    if (def.type === 'competence') for (const e of this.living()) {
      const r = power(e, 'rage');
      if (r) this.addStatus(e, 'puissance', r.n);
    }
    this.turnCards++;
    this.combatCards++;
    this.turnEl[def.element]++;
    this.combatEl[def.element]++;
    if (this.rules.has('triple_element') && !this.tripleDone && def.element !== 'neutre' && this.turnElementsCount() === 3) {
      this.tripleDone = true;
      this.player.energy += 2;
      this.drawCards(2);
    }
    this.emit('cardPlayed', { card: def, cost, target, hits: [...hits], element: def.element });
    this.checkEnd();
  }

  endTurn(): void {
    if (this.outcome !== 'ongoing') throw new Error('Combat terminé');
    this.emit('turnEnd');
    if (this.rules.has('armure_offensive') && this.player.block >= 2) {
      const e = this.pickFoe();
      if (e) this.fxDamage(e, Math.floor(this.player.block / 2), 'neutre');
    }
    if (this.checkEnd()) return;
    // Cartes de statut encore en main : brûlures qui piquent, cartes éphémères qui s'épuisent.
    for (const inst of [...this.hand]) {
      const def = this.cardDef(inst);
      if (def.endTurnDamage) this.applyHit(this.player, def.endTurnDamage, { dot: true });
      if (def.ethereal) {
        this.hand.splice(this.hand.indexOf(inst), 1);
        this.exhaustPile.push(inst);
      }
    }
    if (this.checkEnd()) return;
    if (!this.rules.has('main_gardee')) {
      this.discardPile.push(...this.hand);
      this.hand = [];
    }
    for (const e of this.enemies) e.m.lostThisTurn = 0;

    for (const e of [...this.living()]) {
      if (e.dead) continue;
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
    this.startPlayerTurn(false);
    this.checkEnd();
  }

  // ───────────── effets d'objets (appelés par les récompenses) ─────────────

  fxStatus(t: Entity, id: StatusId, n: number): void {
    if (t === this.player) this.addStatus(t, id, n);
    else this.statusOnEnemy(t as Enemy, id, n);
  }

  fxBlock(n: number): void {
    this.gainBlock(n);
  }

  fxHeal(n: number): void {
    this.heal(n);
  }

  fxDraw(n: number): void {
    this.drawCards(n);
  }

  fxEnergy(n: number): void {
    this.player.energy += n;
  }

  fxDiscount(n: number): void {
    this.discount += n;
  }

  /** Dégâts directs d'un effet d'objet : faiblesses élémentaires et vulnérabilité comptent, pas la puissance. */
  fxDamage(e: Enemy, n: number, el: Element): void {
    if (e.dead) return;
    const d = calcDamage(n, el, { status: {}, dom: 0 }, this.defCtx(e));
    const prev = this.srcElement;
    this.srcElement = el;
    this.applyHit(e, d, { pierce: el === 'air' && this.rules.has('air_perce') });
    this.markIfDead(e);
    this.srcElement = prev;
  }

  // ───────────── interne ─────────────

  private emit(ev: EventId, x: EvCtx = {}): void {
    const list = this.handlers[ev];
    if (!list || this.depth > 3) return;
    if (this.outcome !== 'ongoing' && ev !== 'combatWon') return;
    this.depth++;
    for (const h of list) {
      if (h.trigger.test && !h.trigger.test(this, x)) continue;
      if (h.used >= perTurn(h.reward)) continue;
      h.used++;
      if (h.src) this.fired[h.src] = (this.fired[h.src] ?? 0) + 1;
      h.reward.apply(this, h.amount, x, h.trigger);
    }
    this.depth--;
  }

  private pickFoe(): Enemy | undefined {
    const living = this.living();
    return living.length ? this.rng.pick(living) : undefined;
  }

  private addStatus(e: Entity, id: StatusId, amount: number): void {
    e.status[id] = (e.status[id] ?? 0) + amount;
  }

  /** Statut posé par le joueur sur un ennemi (règles « brûlure empoisonnée »). */
  private statusOnEnemy(e: Enemy, id: StatusId, n: number): void {
    if (e.dead) return;
    if (DEBUFFS.includes(id) && e.m.artefact > 0) {
      e.m.artefact--;
      this.log.push(`${e.def.name} annule l'effet (artefact)`);
      return;
    }
    this.addStatus(e, id, n);
    if (id === 'brulure' && this.rules.has('brule_empoisonne')) this.addStatus(e, 'poison', n);
  }

  private resolveTarget(mode: CardTarget, targetUid?: number): Enemy | undefined {
    if (mode !== 'enemy') return undefined;
    const target =
      targetUid === undefined
        ? this.living()[0]
        : this.enemies.find((e) => e.uid === targetUid && !e.dead);
    if (!target) throw new Error('Cible invalide');
    return target;
  }

  private startPlayerTurn(first: boolean): void {
    this.turn++;
    this.player.block = this.rules.has('armure_persistante') && !first ? Math.floor(this.player.block / 2) : 0;
    this.player.energy = BASE_ENERGY + (this.rules.has('pa_plus') ? 1 : 0) + (this.rules.has('ocre') ? 1 : 0);
    this.turnCards = 0;
    this.turnEl = ZERO_EL();
    this.tripleDone = false;
    for (const list of Object.values(this.handlers)) for (const h of list ?? []) h.used = 0;
    const target = HAND_SIZE - (this.rules.has('pa_plus') ? 1 : 0) + (this.rules.has('pioche_plus') ? 1 : 0);
    this.drawCards(target);
    this.emit('turnStart');
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

  /** Fait entrer un monstre dans le combat (début du combat, invocation, division). */
  private spawn(id: string, hp?: number): Enemy | null {
    const def = this.lib.monsters[id];
    if (!def) throw new Error(`Monstre inconnu : ${id}`);
    if (this.living().length >= MAX_FOES) return null;
    const h = hp ?? Math.max(1, Math.round(this.rng.range(def.hp[0], def.hp[1]) * this.scale.hp));
    const e: Enemy = {
      uid: this.enemies.length, def, hp: h, maxHp: h, block: 0, status: {}, moveId: '', cycleIndex: 0, lastMoves: [], dead: false,
      m: { turns: 0, hurtOnce: false, asleep: 0, lostThisTurn: 0, artefact: 0, stolen: 0, lastEl: null, phased: false, split: false },
    };
    const sl = power(e, 'sommeil');
    if (sl) e.m.asleep = sl.turns;
    const es = power(e, 'esquive');
    if (es) e.status.esquive = es.n;
    const ar = power(e, 'artefact');
    if (ar) e.m.artefact = ar.n;
    this.enemies.push(e);
    if (this.turn > 0) this.chooseMove(e);
    return e;
  }

  private defCtx(e: Enemy): DefenderCtx {
    const cam: Element[] = power(e, 'cameleon') && e.m.lastEl && e.m.lastEl !== 'neutre' ? [e.m.lastEl] : [];
    return {
      status: e.status, weak: e.def.weak.filter((w) => !cam.includes(w)), resist: [...e.def.resist, ...cam],
      vulnMul: this.rules.has('vulne_forte') ? 1.75 : 1.5,
      stunMul: this.rules.has('etourdi_fragile') ? 2 : 1,
    };
  }

  private playerHit(e: Enemy, base: number, element: Element): number {
    return calcDamage(base, element, { status: this.player.status, dom: this.player.dom[element] }, this.defCtx(e));
  }

  private enemyHit(e: Enemy, base: number, element: Element): number {
    const d = calcDamage(
      Math.round(base * this.scale.damage),
      element,
      { status: e.status, dom: 0, weakMul: this.rules.has('faiblesse_forte') ? 0.5 : 0.75 },
      { status: this.player.status, weak: [], resist: [] },
    );
    return this.rules.has('ivoire') ? Math.max(0, d - 2) : d;
  }

  /**
   * Un coup ou des dégâts de statut sur une entité. Ordre : esquive (coups seulement), armure, bouclier, PV.
   * `pierce` ignore armure et bouclier (poison, Air avec la règle). Renvoie les PV réellement perdus.
   */
  private applyHit(t: Entity, dmg: number, o: { attacker?: Enemy; pierce?: boolean; dot?: boolean } = {}): number {
    if (!o.dot && (t.status.esquive ?? 0) > 0) {
      t.status.esquive! -= 1;
      this.log.push(t === this.player ? 'Esquive !' : 'Le coup est esquivé');
      return 0;
    }
    const foe = t !== this.player ? (t as Enemy) : null;
    if (foe && power(foe, 'gardien') && this.living().some((x) => x !== foe)) dmg = Math.ceil(dmg / 2);
    let rest = dmg;
    if (!o.pierce) {
      const a = Math.min(t.block, rest);
      t.block -= a;
      rest -= a;
      const sh = Math.min(t.status.bouclier ?? 0, rest);
      if (sh) { t.status.bouclier = (t.status.bouclier ?? 0) - sh; rest -= sh; }
    }
    let lost = Math.min(t.hp, rest);
    if (foe) {
      const cap = power(foe, 'plafond');
      if (cap) lost = Math.max(0, Math.min(lost, cap.n - foe.m.lostThisTurn));
      foe.m.lostThisTurn += lost;
    }
    t.hp -= lost;
    if (foe) this.onEnemyHurt(foe, lost, !!o.dot);
    if (t === this.player && lost > 0) {
      this.hpLostThisCombat += lost;
      this.emit('hpLost', { amount: lost });
    }
    // Renvoi de dommages (sur les coups uniquement, sans chaîne de renvois)
    if (o.attacker && !o.attacker.dead && !o.dot) {
      let back = t.status.renvoi ?? 0;
      if (t === this.player && this.rules.has('renvoi_moitie')) back += Math.floor(dmg / 2);
      if (back > 0) {
        this.applyHit(o.attacker, back, { dot: true });
        this.markIfDead(o.attacker);
      }
    }
    return lost;
  }

  /** Réactions d'un monstre qui vient d'être touché. */
  private onEnemyHurt(e: Enemy, lost: number, dot: boolean): void {
    if (this.srcElement) e.m.lastEl = this.srcElement;
    if (!dot) {
      const th = power(e, 'epines');
      if (th) this.applyHit(this.player, th.n, { dot: true });
    }
    if (lost <= 0 || e.hp <= 0) return;
    if (e.m.asleep > 0) { e.m.asleep = 0; this.log.push(`${e.def.name} se réveille`); this.chooseMove(e); }
    const an = power(e, 'colere');
    if (an) this.addStatus(e, 'puissance', an.n);
    const cu = power(e, 'enroulement');
    if (cu && !e.m.hurtOnce) e.block += cu.n;
    e.m.hurtOnce = true;
    // Seconde phase des boss
    const ph = e.def.phase2;
    if (ph && !e.m.phased && e.hp <= e.maxHp * ph.at) {
      e.m.phased = true;
      this.addStatus(e, 'puissance', ph.puissance);
      e.def = { ...e.def, pattern: ph.pattern };
      e.cycleIndex = 0;
      this.chooseMove(e);
      this.log.push(`${e.def.name} : ${ph.name}`);
    }
    // Division
    if (power(e, 'division') && e.def.splitInto && !e.m.split && e.hp <= e.maxHp / 2) {
      e.m.split = true;
      e.dead = true;
      e.m.gone = 'divise';
      this.log.push(`${e.def.name} se divise`);
      for (let i = 0; i < 2; i++) this.spawn(e.def.splitInto, e.hp);
    }
  }

  private gainBlock(amount: number): void {
    let n = amount + this.player.blockBonus;
    if (this.rules.has('puissance_armure')) n += this.player.status.puissance ?? 0;
    if (this.player.status.erosion) n = Math.floor(n / 2);
    if (n <= 0) return;
    this.player.block += n;
    this.emit('blockGained', { amount: n });
  }

  private heal(amount: number): void {
    let n = amount;
    if (this.player.status.erosion) n = Math.floor(n / 2);
    const room = this.player.maxHp - this.player.hp;
    this.player.hp += Math.min(room, n);
    if (n > room && this.rules.has('soin_bouclier')) this.addStatus(this.player, 'bouclier', n - room);
  }

  private markIfDead(e: Enemy): void {
    if (e.dead || e.hp > 0) return;
    e.dead = true;
    this.log.push(`${e.def.name} est vaincu`);
    const sp = power(e, 'spores');
    if (sp) this.addStatus(this.player, 'vulnerabilite', sp.n);
    if (e.m.stolen) this.log.push(`${e.m.stolen} kamas récupérés`);
    e.m.stolen = 0;
    const others = this.living();
    if (others.length) {
      if (this.rules.has('braises') && (e.status.brulure ?? 0) > 0) {
        const n = 2 * (e.status.brulure ?? 0);
        for (const o of others) this.fxDamage(o, n, 'feu');
      }
      if (this.rules.has('contagion')) {
        const o = this.rng.pick(this.living().length ? this.living() : others);
        for (const id of ['brulure', 'poison', 'vulnerabilite'] as const) if (e.status[id]) this.addStatus(o, id, e.status[id]!);
      }
    }
    this.emit('enemyKilled', { target: e, element: this.srcElement });
  }

  /** Résout les effets d'une carte. Retourne les ennemis touchés par des dégâts. */
  private resolveEffects(def: CardDef, target: Enemy | undefined): Set<Enemy> {
    const targets = def.target === 'all_enemies' ? this.living() : target ? [target] : [];
    const hit = new Set<Enemy>();
    this.srcElement = def.element;
    for (const fx of def.effects) {
      switch (fx.type) {
        case 'damage':
        case 'drain': {
          const hits = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
          const pierce = fx.element === 'air' && this.rules.has('air_perce');
          for (let h = 0; h < hits; h++) {
            for (const e of targets) {
              if (e.dead) continue;
              const dmg = this.playerHit(e, fx.amount, fx.element);
              const lost = this.applyHit(e, dmg, { pierce });
              hit.add(e);
              if (fx.type === 'drain') this.heal(lost);
              if (fx.element === 'eau' && this.rules.has('eau_vampire')) this.heal(Math.floor(lost / 2));
              this.markIfDead(e);
              // Ricochet : un autre ennemi prend la moitié
              if (def.target === 'enemy' && this.rules.has('ricochet')) {
                const other = this.living().find((o) => o !== e);
                if (other) {
                  this.applyHit(other, Math.floor(dmg / 2), { pierce });
                  hit.add(other);
                  this.markIfDead(other);
                }
              }
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
          if (fx.on === 'self') this.addStatus(this.player, fx.status, fx.amount);
          else if (fx.on === 'all_enemies') for (const e of this.living()) this.statusOnEnemy(e, fx.status, fx.amount);
          else for (const e of targets) this.statusOnEnemy(e, fx.status, fx.amount);
          break;
        }
      }
    }
    this.srcElement = null;
    return hit;
  }

  private enemyAct(e: Enemy): void {
    e.m.turns++;
    if (e.m.asleep > 0) {
      e.m.asleep--;
      const sl = power(e, 'sommeil');
      if (sl) e.block += sl.block;
      this.log.push(`${e.def.name} dort`);
      if (e.m.asleep === 0) this.log.push(`${e.def.name} se réveille`);
      return;
    }
    const ex = power(e, 'explosion');
    if (ex && e.m.turns >= ex.turns) {
      this.log.push(`${e.def.name} explose !`);
      this.applyHit(this.player, this.enemyHit(e, ex.dmg, 'feu'), { attacker: e });
      e.hp = 0;
      e.dead = true;
      e.m.gone = 'explose';
      return;
    }
    const th = power(e, 'voleur');
    if (th && e.m.turns >= th.turns) {
      e.dead = true;
      e.m.gone = 'fui';
      this.log.push(`${e.def.name} s'enfuit avec ${e.m.stolen} kamas`);
      return;
    }
    this.enemyMove(e);
    if (e.dead) return;
    const pl = power(e, 'carapace');
    if (pl) e.block += pl.n;
    const rg = power(e, 'regeneration');
    if (rg) e.hp = Math.min(e.maxHp, e.hp + rg.n);
    const ri = power(e, 'rituel');
    if (ri && e.m.turns > 1) this.addStatus(e, 'puissance', ri.n);
  }

  private enemyMove(e: Enemy): void {
    const need = this.stunNeed(e);
    if ((e.status.etourdi ?? 0) >= need) {
      e.status.etourdi! -= need;
      this.log.push(`${e.def.name} est étourdi`);
      return;
    }
    const move = e.def.moves[e.moveId];
    this.log.push(`${e.def.name} : ${move.name}`);
    const erode = (n: number) => (e.status.erosion ? Math.floor(n / 2) : n);
    for (const fx of move.effects) {
      switch (fx.type) {
        case 'damage':
        case 'drain': {
          const hits = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
          for (let h = 0; h < hits; h++) {
            const lost = this.applyHit(this.player, this.enemyHit(e, fx.amount, fx.element), { attacker: e });
            if (fx.type === 'drain') e.hp = Math.min(e.maxHp, e.hp + erode(lost));
            const th = power(e, 'voleur');
            if (th && lost > 0) e.m.stolen += th.n;
            if (this.player.hp <= 0 || e.dead) return;
          }
          break;
        }
        case 'block':
          e.block += erode(fx.amount);
          break;
        case 'heal':
          e.hp = Math.min(e.maxHp, e.hp + erode(fx.amount));
          break;
        case 'status':
          if (fx.on === 'self') this.addStatus(e, fx.status, fx.amount);
          else if (fx.on === 'target') this.addStatus(this.player, fx.status, fx.amount);
          break;
        case 'summon':
          for (let i = 0; i < (fx.count ?? 1); i++) this.spawn(fx.monster);
          break;
        case 'addCard':
          for (let i = 0; i < fx.count; i++) {
            const inst: CardInstance = { uid: 900000 + this.statusUid++, id: fx.card, upgraded: false };
            if (fx.pile === 'hand' && this.hand.length < MAX_HAND) this.hand.push(inst);
            else if (fx.pile === 'draw') this.drawPile.splice(this.rng.int(this.drawPile.length + 1), 0, inst);
            else this.discardPile.push(inst);
          }
          break;
        default:
          break;
      }
    }
  }

  /** Fin de round : brûlure (absorbée par l'armure), poison (direct), puis usure des durées. */
  private endOfRound(): void {
    const entities: Entity[] = [this.player, ...this.living()];
    for (const t of entities) {
      const mine = t !== this.player; // statuts posés par le joueur : les règles légendaires s'appliquent
      const burn = t.status.brulure ?? 0;
      if (burn > 0) {
        this.srcElement = 'feu';
        this.applyHit(t, burn, { dot: true });
        if (!(mine && this.rules.has('brulure_tenace'))) t.status.brulure = burn - 1;
      }
      const poison = t.status.poison ?? 0;
      if (poison > 0) {
        this.srcElement = null;
        this.applyHit(t, poison, { dot: true, pierce: true });
        t.status.poison = mine && this.rules.has('poison_tenace') ? poison - 1 : Math.floor(poison / 2);
      }
      if (t !== this.player) this.markIfDead(t as Enemy);
    }
    this.srcElement = null;
    for (const t of entities) {
      for (const id of ['faiblesse', 'vulnerabilite', 'erosion', 'renvoi'] as const) {
        const v = t.status[id] ?? 0;
        if (v > 0) t.status[id] = v - 1;
      }
    }
  }

  private checkEnd(): boolean {
    if (this.outcome !== 'ongoing') return true;
    if (this.player.hp <= 0 && this.reviveAvailable) {
      this.reviveAvailable = false;
      this.revived = true;
      this.player.hp = Math.ceil(this.player.maxHp / 2);
      this.log.push('Le Dofus te ramène à la vie');
    }
    if (this.player.hp <= 0) this.outcome = 'lost';
    else if (this.living().length === 0) {
      this.outcome = 'won';
      this.emit('combatWon');
      if (this.rules.has('prospecteur') && this.hpLostThisCombat === 0) this.prospection.run += 20;
    }
    return this.outcome !== 'ongoing';
  }
}
