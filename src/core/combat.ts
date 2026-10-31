import { REWARD_BY_ID, TRIGGER_BY_ID, perTurn, type EffectPart, type EventId, type EvCtx, type ItemEffect, type RewardDef, type RuleId, type TriggerDef } from './effects.ts';
import { Rng } from './rng.ts';
import { PASSIVE_VALUES } from './classes.ts';
const VISEE = () => PASSIVE_VALUES.visee.attaques;
import { RALENTI_CAP, capRes } from './types.ts';
import type {
  CardDef,
  ClassId,
  CondId,
  GrantFx,
  ScaleId,
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
    /** Rage / Colère : cartes (ou attaques) jouées depuis le dernier gain de puissance. */
    count: number;
    /** S'est enfui (voleur) ou s'est divisé : ne compte pas comme une victoire sur lui. */
    gone?: 'fui' | 'divise' | 'explose';
  };
}

const MAX_FOES = 5;
const DEBUFFS: StatusId[] = ['faiblesse', 'vulnerabilite', 'brulure', 'poison', 'erosion', 'etourdi', 'ralenti', 'echeance', 'telefrag'];
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
  /** Classe du joueur : donne son passif (Courroux, Visée). */
  classe?: ClassId;
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
  /** Résistances en % (Dofus) : 20 = −20 % de dégâts, −10 = +10 %. */
  res?: Partial<Record<Element, number>>;
  /** Multiplicateur de la vulnérabilité du défenseur (1,5 par défaut). */
  vulnMul?: number;
  /** Multiplicateur si le défenseur est étourdi (règle « étourdi fragile »). */
  stunMul?: number;
}

/** Formule de dégâts unique, utilisée par le jeu, les aperçus d'intentions et les simulations. */
export function calcDamage(base: number, element: Element, atk: AttackerCtx, def: DefenderCtx): number {
  let d = base + (atk.status.puissance ?? 0) + atk.dom;
  if (atk.status.faiblesse) d *= atk.weakMul ?? 0.75;
  const r = Math.min(100, def.res?.[element] ?? 0);
  if (r) d *= 1 - r / 100;
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
interface Handler { trigger: TriggerDef; reward: RewardDef; amount: number; used: number; src: string; limit: number; once: boolean; cd: number; ready: number }

/** Résultat d'une prévisualisation de carte : PV et armure retirés à chaque ennemi touché, effet sur le joueur. */
export interface Preview {
  enemies: Record<number, { lost: number; blockLost: number; dead: boolean }>;
  player: { lost: number; healed: number; block: number };
}

/** Copie profonde d'un combat qui garde les prototypes et partage les données figées. */
function cloneCombat(c: Combat): Combat {
  const shared = new Set<unknown>([c.lib, ...Object.values(c.lib.cards), ...Object.values(c.lib.monsters), ...c.enemies.map((e) => e.def), ...Object.values(TRIGGER_BY_ID), ...Object.values(REWARD_BY_ID)]);
  const memo = new Map<unknown, unknown>();
  const copy = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object' || shared.has(v)) return v;
    if (memo.has(v)) return memo.get(v);
    if (v instanceof Set) { const s = new Set(); memo.set(v, s); for (const x of v) s.add(copy(x)); return s; }
    if (v instanceof Map) { const m = new Map(); memo.set(v, m); for (const [k, x] of v) m.set(k, copy(x)); return m; }
    if (Array.isArray(v)) { const a: unknown[] = []; memo.set(v, a); for (const x of v) a.push(copy(x)); return a; }
    const o = Object.create(Object.getPrototypeOf(v)) as Record<string, unknown>;
    memo.set(v, o);
    for (const k of Object.keys(v)) {
      const x = (v as Record<string, unknown>)[k];
      // Méthodes posées sur l'objet lui-même (enregistrement de la sauvegarde) : liées à l'original,
      // elles agiraient sur le vrai combat. La copie garde les méthodes de la classe.
      if (typeof x === 'function' && v === c) continue;
      o[k] = copy(x);
    }
    return o;
  };
  const sim = copy(c) as Combat;
  sim.log = [];
  return sim;
}

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
  readonly rules: Set<RuleId> = new Set();
  private readonly handlers: Partial<Record<EventId, Handler[]>> = {};
  /** Passif de classe. */
  readonly classe: ClassId | null;
  /** Visée du Crâ : attaques comptées depuis le dernier tir doublé (0 à VISEE-1). */
  aim = 0;
  /** Attaques jouées ce tour (Courroux) et nombre de lancers de chaque carte ce combat. */
  turnAttacks = 0;
  playedById: Record<string, number> = {};
  /** Pouvoirs actifs (cartes de pouvoir jouées), pour l'affichage. */
  powers: { id: string; name: string; icon?: string; n: number }[] = [];
  /** Type de la carte jouée juste avant, ce tour (enchaînements). */
  prevType: CardDef['type'] | null = null;
  /** Prochaines attaques lancées une fois de plus (Dédoublement). */
  echo = 0;
  /** Multiplicateur de la carte en cours (Visée). */
  private dmgMul = 1;
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

  /** Xélor : Téléfrag consommés ce tour et ce combat, pioches du passif déjà données ce tour. */
  telefragTurn = 0;
  telefragCombat = 0;
  telefragDraws = 0;

  /** Sablier : PA gardé du tour précédent ; pioche à main vide déjà faite ce tour. */
  private leftover = 0;
  private emptyDrawn = false;
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
    this.classe = init.classe ?? null;
    for (const e of init.effects ?? []) this.addEffect(e, e.src ?? '');
    this.reviveAvailable = !!init.revive;
    for (const id of enemyIds) this.spawn(id);
    for (const e of this.enemies) {
      if (this.rules.has('ocre')) this.addStatus(e, 'puissance', 1);
      if (this.rules.has('cauchemar')) this.addStatus(e, 'vulnerabilite', 3);
      if (this.rules.has('colosse')) this.addStatus(e, 'puissance', 2);
    }
    if (this.rules.has('colosse')) this.addStatus(this.player, 'puissance', 3);
    this.drawPile = this.rng.shuffle([...deck]);
    // Cartes innées : sur le dessus de la pioche (la pioche se fait par la fin du tableau).
    const innate = this.drawPile.filter((i) => this.cardDef(i).innate);
    if (innate.length) this.drawPile = [...this.drawPile.filter((i) => !innate.includes(i)), ...innate];
    for (const e of this.enemies) this.chooseMove(e);
    this.startPlayerTurn(true);
    this.emit('combatStart');
    this.checkEnd();
  }

  /** Branche un effet (objet, Dofus ou pouvoir) sur les événements du combat. */
  private addEffect(e: ItemEffect | GrantFx, src: string): void {
    if (e.kind === 'rule') { this.rules.add(e.rule as RuleId); return; }
    for (const p of e.parts as EffectPart[]) {
      const trigger = TRIGGER_BY_ID[p.trigger], reward = REWARD_BY_ID[p.reward];
      if (!trigger || !reward) continue;
      (this.handlers[trigger.event] ??= []).push({ trigger, reward, amount: p.amount, used: 0, src, limit: p.once || p.recharge ? 1 : p.limit ?? perTurn(reward), once: !!p.once, cd: p.recharge ?? 0, ready: 0 });
    }
  }

  // ───────────── lecture ─────────────

  /** Valeur d'un bonus de carte (« par attaque jouée ce tour »…) à cet instant. */
  scaleCount(per: ScaleId, target?: Enemy, cardId?: string): number {
    switch (per) {
      case 'attaques': return this.turnAttacks;
      case 'puissance': return Math.max(0, this.player.status.puissance ?? 0);
      case 'armure': return this.player.block;
      case 'ennemis': return this.living().length;
      case 'statuts': return target ? DEBUFFS.filter((s) => (target.status[s] ?? 0) > 0).length : 0;
      case 'main': return this.hand.length;
      case 'lancers': return cardId ? this.playedById[cardId] ?? 0 : 0;
      case 'visee': return this.aim;
      case 'epuisees': return this.exhaustPile.length;
      case 'telefrag': return this.living().filter((e) => (e.status.telefrag ?? 0) > 0).length;
      case 'telefrag_tour': return this.telefragTurn;
    }
  }

  /** Montant de base d'un effet de dégâts ou d'armure, bonus compris. */
  baseAmount(fx: Effect, target?: Enemy, cardId?: string): number {
    if ((fx.type === 'damage' || fx.type === 'block') && fx.bonus) return fx.amount + fx.bonus.n * this.scaleCount(fx.bonus.per, target, cardId);
    return 'amount' in fx ? (fx.amount as number) : 0;
  }

  /** Visée : la prochaine attaque sera-t-elle doublée ? */
  aimReady(): boolean {
    return this.classe === 'cra' && this.aim >= VISEE() - 1;
  }

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
      if (h.src !== src || !['cardPlayed', 'enemyKilled', 'hpLost', 'blockGained', 'telefragConsumed'].includes(h.trigger.event) || h.trigger.single) continue;
      used = Math.max(used, h.used);
      limit = Math.max(limit, h.limit);
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
  estimateDamage(fx: Effect, enemy: Enemy, card?: CardDef): number {
    if (fx.type !== 'damage' && fx.type !== 'drain') return 0;
    const mul = card?.type === 'attaque' && this.aimReady() ? PASSIVE_VALUES.visee.multiplicateur : 1;
    const per = this.playerHit(enemy, this.baseAmount(fx, enemy, card?.id), fx.element) * mul;
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
    let slow = e.status.ralenti ?? 0;
    if (!stunned) for (const fx of move.effects) {
      if (fx.type === 'damage' || fx.type === 'drain') {
        const n = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
        for (let h = 0; h < n; h++) {
          const d = this.enemyHit(e, fx.amount, fx.element), cut = Math.min(slow, d);
          slow -= cut;
          damage += d - cut;
        }
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

  // ───────────── prévisualisation ─────────────

  /**
   * Ce que ferait la carte si on la jouait maintenant : on la joue sur une copie du combat (même tirage aléatoire,
   * mêmes objets et passifs), puis on compare. Les données figées (bibliothèque, fiches des monstres) sont partagées.
   * Pour une carte à cible unique, `targetUid` choisit la cible.
   */
  preview(handIndex: number, targetUid?: number): Preview | null {
    const inst = this.hand[handIndex];
    if (!inst || this.outcome !== 'ongoing') return null;
    const def = this.cardDef(inst);
    if (def.unplayable || this.costOf(inst) > this.player.energy) return null;
    const sim = cloneCombat(this);
    try { sim.playCard(handIndex, targetUid); } catch { return null; }
    const enemies: Preview['enemies'] = {};
    for (const e of this.enemies) {
      if (e.dead) continue;
      const after = sim.enemies.find((x) => x.uid === e.uid);
      if (!after) continue;
      const lost = e.hp - after.hp, blockLost = Math.max(0, e.block - after.block);
      if (lost > 0 || blockLost > 0 || after.dead) enemies[e.uid] = { lost, blockLost, dead: after.dead || after.hp <= 0 };
    }
    return {
      enemies,
      player: { lost: Math.max(0, this.player.hp - sim.player.hp), healed: Math.max(0, sim.player.hp - this.player.hp), block: Math.max(0, sim.player.block - this.player.block) },
    };
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
    let twice = this.rules.has('double_premier') && this.combatCards === 0;
    if (!twice && this.echo > 0 && def.type === 'attaque') { this.echo--; twice = true; }
    // Visée (Crâ) : toutes les VISEE attaques, l'attaque est doublée. Une carte qui consomme la Visée ne la fait pas avancer.
    this.dmgMul = 1;
    const spendsAim = def.effects.some((f) => f.type === 'spend' && f.what === 'visee');
    if (this.classe === 'cra' && def.type === 'attaque' && !spendsAim) {
      if (this.aimReady()) { this.dmgMul = PASSIVE_VALUES.visee.multiplicateur; this.aim = 0; this.fired['classe'] = (this.fired['classe'] ?? 0) + 1; this.log.push('Visée : dégâts doublés'); }
      else this.aim++;
    }
    if (def.type === 'attaque' && this.rules.has('critique') && this.rng.next() < 0.25) { this.dmgMul *= 2; this.log.push('Coup critique !'); }
    if (def.type === 'attaque' && this.rules.has('premier_double') && this.turnAttacks === 0) twice = true;
    // Téléfrag : seules les marques posées avant cette carte sont consommées par elle.
    const marked = new Set(this.living().filter((e) => (e.status.telefrag ?? 0) > 0));
    const hits = this.resolveEffects(def, target);
    if (twice && this.outcome === 'ongoing') {
      const again = target && target.dead ? undefined : target;
      if (def.target !== 'enemy' || again || this.living().length) {
        this.log.push(`${def.name} est lancé une seconde fois`);
        for (const e of this.resolveEffects(def, again ?? (def.target === 'enemy' ? this.living()[0] : undefined))) hits.add(e);
      }
    }
    this.dmgMul = 1;
    // Téléfrag (Xélor) : une attaque qui touche un ennemi marqué consomme la marque.
    if (def.type === 'attaque') {
      const used = [...hits].filter((e) => marked.has(e) && (e.status.telefrag ?? 0) > 0);
      for (const e of used) delete e.status.telefrag;
      if (used.length) this.onTelefrag(used.length, target);
    }
    if (def.type === 'pouvoir') { /* un pouvoir reste en jeu : il ne retourne pas dans le deck de ce combat */ }
    else if (def.exhaust) this.exhaustPile.push(inst);
    else this.discardPile.push(inst);
    if (def.type === 'attaque') this.turnAttacks++;
    this.prevType = def.type;
    this.playedById[def.id] = (this.playedById[def.id] ?? 0) + 1;

    // Rage : toutes les x cartes jouées ; Colère : toutes les x attaques jouées.
    for (const e of this.living()) {
      const p = power(e, 'rage') ?? (def.type === 'attaque' ? power(e, 'colere') : undefined);
      if (!p) continue;
      if (++e.m.count >= p.every) {
        e.m.count = 0;
        this.addStatus(e, 'puissance', p.n);
        this.log.push(`${e.def.name} : ${p.kind === 'rage' ? 'Rage' : 'Colère'}, +${p.n} puissance`);
      }
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
    if (this.rules.has('pioche_vide') && !this.emptyDrawn && this.hand.length === 0 && this.outcome === 'ongoing') {
      this.emptyDrawn = true;
      this.drawCards(2);
    }
    this.checkEnd();
  }

  endTurn(): void {
    if (this.outcome !== 'ongoing') throw new Error('Combat terminé');
    if (this.classe === 'iop' && this.turnAttacks >= PASSIVE_VALUES.courroux.attaques) {
      this.addStatus(this.player, 'puissance', PASSIVE_VALUES.courroux.puissance);
      this.fired['classe'] = (this.fired['classe'] ?? 0) + 1;
      this.log.push('Courroux : +1 puissance');
    }
    this.emit('turnEnd');
    if (this.rules.has('armure_offensive') && this.player.block >= 2) {
      const e = this.pickFoe();
      if (e) this.fxDamage(e, Math.floor(this.player.block / 2), 'neutre');
    }
    if (this.checkEnd()) return;
    // Fin du tour du joueur : sa brûlure (son armure du tour l'absorbe).
    this.tickBurn(this.player);
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
    this.leftover = Math.min(1, this.player.energy);
    if (!this.rules.has('main_gardee')) {
      // Les cartes conservées restent en main (et la première carte avec Retenue).
      const keep = this.hand.filter((i, k) => this.cardDef(i).retain || (k === 0 && this.rules.has('retenue') && !this.cardDef(i).status));
      this.discardPile.push(...this.hand.filter((i) => !keep.includes(i)));
      this.hand = keep;
    }
    for (const e of this.enemies) e.m.lostThisTurn = 0;

    // Chaque monstre : le poison le ronge au début de son tour (il peut en mourir avant d'agir),
    // il agit, puis la brûlure le consume à la fin de son tour (son armure du tour l'absorbe).
    for (const e of [...this.living()]) {
      if (e.dead) continue;
      e.block = 0;
      this.tickPoison(e);
      if (this.checkEnd()) return;
      if (e.dead) continue;
      this.enemyAct(e);
      if (this.checkEnd()) return;
      this.tickBurn(e);
      if (this.checkEnd()) return;
      // Fin de son tour : le ralenti s'efface, l'échéance tombe.
      delete e.status.ralenti;
      this.tickDeadline(e);
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
    // Début du tour du joueur : son poison d'abord.
    this.tickPoison(this.player);
    if (this.checkEnd()) return;
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

  /** Visée : rapproche le prochain tir doublé (s'arrête juste avant). */
  fxCharge(n: number): void {
    if (this.classe === 'cra') this.aim = Math.min(VISEE() - 1, this.aim + n);
  }

  fxLoseHp(n: number): void {
    this.applyHit(this.player, n, { pierce: true, dot: true });
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
      if (h.used >= h.limit) continue;
      if (h.cd && this.turn < h.ready) continue;
      h.used++;
      if (h.cd) h.ready = this.turn + h.cd;
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
    if (id === 'telefrag') e.status.telefrag = 1;
    if (id === 'ralenti') e.status.ralenti = Math.min(RALENTI_CAP, e.status.ralenti ?? 0);
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
    this.turnAttacks = 0;
    this.prevType = null;
    this.turnEl = ZERO_EL();
    this.tripleDone = false;
    this.telefragTurn = 0;
    this.telefragDraws = 0;
    for (const list of Object.values(this.handlers)) for (const h of list ?? []) if (!h.once) h.used = 0;
    if (this.rules.has('sablier') && !first) this.player.energy += this.leftover;
    this.leftover = 0;
    this.emptyDrawn = false;
    const target = HAND_SIZE - (this.rules.has('pa_plus') ? 1 : 0) + (this.rules.has('pioche_plus') ? 1 : 0);
    this.drawCards(target);
    // Téléfrag (Xélor) : des ennemis au hasard, de préférence sans marque, en reçoivent une.
    if (this.classe === 'xelor') for (let i = 0; i < PASSIVE_VALUES.telefrag.marques; i++) {
      const free = this.living().filter((e) => !e.status.telefrag);
      if (free.length) this.statusOnEnemy(this.rng.pick(free), 'telefrag', 1);
    }
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
      m: { turns: 0, hurtOnce: false, asleep: 0, lostThisTurn: 0, artefact: 0, stolen: 0, lastEl: null, phased: false, split: false, count: 0 },
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

  /** Résistances d'un monstre à cet instant : Peau de roche ajoute 50 % dans l'élément du dernier coup reçu. */
  resOf(e: Enemy): Record<Element, number> {
    const r = { ...e.def.res };
    if (power(e, 'cameleon') && e.m.lastEl) r[e.m.lastEl] = capRes(r[e.m.lastEl] + 50);
    return r;
  }

  private defCtx(e: Enemy): DefenderCtx {
    return {
      status: e.status, res: this.resOf(e),
      vulnMul: this.rules.has('vulne_forte') ? 1.75 : 1.5,
      stunMul: this.rules.has('etourdi_fragile') ? 2 : 1,
    };
  }

  private playerHit(e: Enemy, base: number, element: Element): number {
    return calcDamage(base, element, { status: this.player.status, dom: this.player.dom[element] }, this.defCtx(e)) * this.dmgMul;
  }

  private enemyHit(e: Enemy, base: number, element: Element): number {
    const d = calcDamage(
      Math.round(base * this.scale.damage),
      element,
      { status: this.rules.has('poison_affaiblit') && (e.status.poison ?? 0) > 0 && !(e.status.faiblesse ?? 0) ? { ...e.status, faiblesse: 1 } : e.status, dom: 0, weakMul: this.rules.has('faiblesse_forte') ? 0.5 : 0.75 },
      { status: this.player.status },
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
      // Épines (règle) : la moitié de ce que l'armure du joueur absorbe d'un coup revient à l'attaquant.
      if (a > 0 && t === this.player && o.attacker && !o.attacker.dead && !o.dot && this.rules.has('epines_armure')) {
        if (a >= 2) { this.applyHit(o.attacker, Math.floor(a / 2), { dot: true }); this.markIfDead(o.attacker); }
      }
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
    if (n - room >= 2 && this.rules.has('soin_bouclier')) this.addStatus(this.player, 'bouclier', Math.floor((n - room) / 2));
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
    this.runEffects(def.effects, def, targets, target, hit);
    this.srcElement = null;
    return hit;
  }

  /** Condition d'un effet « si … », au moment où il se résout. */
  checkCond(cond: CondId, target: Enemy | undefined): boolean {
    switch (cond) {
      case 'cible_morte': return !!target && target.dead;
      case 'cible_blessee': return !!target && !target.dead && target.hp * 2 < target.maxHp;
      case 'cible_vulnerable': return !!target && (target.status.vulnerabilite ?? 0) > 0;
      case 'cible_empoisonnee': return !!target && (target.status.poison ?? 0) > 0;
      case 'cible_brule': return !!target && (target.status.brulure ?? 0) > 0;
      case 'pv_bas': return this.player.hp * 2 < this.player.maxHp;
      case 'apres_attaque': return this.prevType === 'attaque';
      case 'apres_competence': return this.prevType === 'competence';
      case 'premiere_carte': return this.turnCards === 0;
      case 'main_vide': return this.hand.length === 0;
      case 'cible_telefrag': return !!target && !target.dead && (target.status.telefrag ?? 0) > 0;
      case 'cible_ralentie': return !!target && !target.dead && (target.status.ralenti ?? 0) > 0;
    }
  }

  private runEffects(effects: Effect[], def: CardDef, targets: Enemy[], target: Enemy | undefined, hit: Set<Enemy>): void {
    for (const fx of effects) {
      switch (fx.type) {
        case 'damage':
        case 'drain': {
          const hits = fx.type === 'damage' ? (fx.hits ?? 1) : 1;
          const pierce = (fx.type === 'damage' && !!fx.pierce) || (fx.element === 'air' && this.rules.has('air_perce'));
          for (let h = 0; h < hits; h++) {
            for (const e of targets) {
              if (e.dead) continue;
              const blood = def.type === 'attaque' && this.rules.has('sang') ? Math.floor((this.player.maxHp - this.player.hp) / 8) : 0;
              const dmg = this.playerHit(e, this.baseAmount(fx, e, def.id) + blood, fx.element);
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
          this.gainBlock(this.baseAmount(fx, targets[0], def.id));
          break;
        case 'heal':
          this.heal(fx.amount);
          break;
        case 'loseHp':
          this.applyHit(this.player, fx.amount, { pierce: true, dot: true });
          break;
        case 'charge':
          this.fxCharge(fx.amount);
          break;
        case 'multiply':
          for (const e of targets) {
            const cur = e.status[fx.status] ?? 0;
            if (cur > 0 && !e.dead) e.status[fx.status] = fx.status === 'ralenti' ? Math.min(RALENTI_CAP, cur * fx.factor) : cur * fx.factor;
          }
          break;
        case 'grant': {
          for (const g of fx.fx) this.addEffect(g, `pouvoir:${def.id}`);
          const have = this.powers.find((p) => p.id === def.id);
          if (have) have.n++;
          else this.powers.push({ id: def.id, name: def.name, icon: def.icon, n: 1 });
          break;
        }
        case 'addCard':
          for (let i = 0; i < fx.count; i++) {
            const inst = { uid: 900000 + this.statusUid++, id: fx.card, upgraded: false };
            if (fx.pile === 'hand' && this.hand.length < MAX_HAND) this.hand.push(inst);
            else if (fx.pile === 'draw') this.drawPile.splice(this.rng.int(this.drawPile.length + 1), 0, inst);
            else this.discardPile.push(inst);
          }
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
        case 'if':
          if (this.checkCond(fx.cond, target ?? targets[0])) this.runEffects(fx.then, def, targets, target, hit);
          break;
        case 'spend':
          if (fx.what === 'puissance') delete this.player.status.puissance;
          else this.aim = 0;
          break;
        case 'echo':
          this.echo += fx.count;
          break;
        case 'spread':
          for (const e of targets) {
            const n = e.status[fx.status] ?? 0;
            if (n > 0) for (const o of this.living()) if (o !== e) this.statusOnEnemy(o, fx.status, n);
          }
          break;
        case 'detonate':
          for (const e of targets) {
            const n = e.status[fx.status] ?? 0;
            if (n <= 0 || e.dead) continue;
            this.applyHit(e, n, { pierce: fx.status === 'poison', dot: true });
            hit.add(e);
            this.markIfDead(e);
          }
          break;
        case 'exhaustHand':
          this.exhaustPile.push(...this.hand);
          this.hand = [];
          break;
        case 'consume': {
          let n = 0;
          for (const e of [...targets]) {
            if (e.dead || !(e.status.telefrag ?? 0)) continue;
            delete e.status.telefrag;
            n++;
            this.runEffects(fx.then, def, [e], e, hit);
          }
          if (n) this.onTelefrag(n, target);
          break;
        }
      }
    }
  }

  /** Xélor : des Téléfrag viennent d'être consommés (passif, puis pouvoirs « quand tu consommes un Téléfrag »). */
  private onTelefrag(n: number, target: Enemy | undefined): void {
    this.telefragTurn += n;
    this.telefragCombat += n;
    const v = PASSIVE_VALUES.telefrag;
    if (this.classe === 'xelor' && this.telefragDraws < v.parTour && v.pioche > 0) {
      this.telefragDraws++;
      this.fired['classe'] = (this.fired['classe'] ?? 0) + 1;
      this.drawCards(v.pioche);
      this.log.push(`Téléfrag : pioche ${v.pioche}`);
    }
    this.emit('telefragConsumed', { target, amount: n });
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
            // Ralenti : retiré du total de l'action, coup après coup.
            let d = this.enemyHit(e, fx.amount, fx.element);
            const slow = Math.min(e.status.ralenti ?? 0, d);
            if (slow > 0) { d -= slow; e.status.ralenti! -= slow; }
            const lost = this.applyHit(this.player, d, { attacker: e });
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
  /** Poison : au début du tour de celui qui le porte, sans que l'armure ni le bouclier ne protègent, puis divisé par 2. */
  private tickPoison(t: Entity): void {
    const poison = t.status.poison ?? 0;
    if (poison <= 0 || t.hp <= 0) return;
    const mine = t !== this.player; // statuts posés par le joueur : les règles légendaires s'appliquent
    this.srcElement = null;
    this.applyHit(t, poison, { dot: true, pierce: true });
    t.status.poison = mine && this.rules.has('poison_tenace') ? poison - 1 : Math.floor(poison / 2);
    if (mine) this.markIfDead(t as Enemy);
  }

  /** Brûlure : à la fin du tour de celui qui la porte (l'armure et le bouclier l'absorbent), puis diminue de 1. */
  private tickBurn(t: Entity): void {
    const burn = t.status.brulure ?? 0;
    if (burn <= 0 || t.hp <= 0) return;
    const mine = t !== this.player;
    this.srcElement = 'feu';
    this.applyHit(t, mine && this.rules.has('brulure_double') ? burn * 2 : burn, { dot: true });
    if (!(mine && this.rules.has('brulure_tenace'))) t.status.brulure = burn - 1;
    this.srcElement = null;
    if (mine) this.markIfDead(t as Enemy);
  }

  /** Échéance (Xélor) : à la fin du tour du monstre, il subit les dégâts Feu annoncés (l'armure absorbe), puis elle disparaît. */
  private tickDeadline(e: Enemy): void {
    const n = e.status.echeance ?? 0;
    if (n <= 0 || e.dead) return;
    delete e.status.echeance;
    this.srcElement = 'feu';
    this.applyHit(e, n, { dot: true });
    this.srcElement = null;
    this.markIfDead(e);
  }

  /** Fin de round : usure des durées (faiblesse, vulnérabilité, érosion, renvoi). */
  private endOfRound(): void {
    const entities: Entity[] = [this.player, ...this.living()];
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
