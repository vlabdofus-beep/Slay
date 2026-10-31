// Une partie (run) : carte de l'acte, combats, récompenses, Zaap. Aucune dépendance au DOM :
// l'interface ne fait qu'appeler ces méthodes et afficher l'état.
import { Combat } from '../core/combat.ts';
import { rollEffect } from '../core/effects.ts';
import { computeLoadout, type EffectTable, type Equipment, type Loadout } from '../core/loadout.ts';
import { generateMap, type ActMap, type MapNode } from '../core/map.ts';
import { itemOffer, lootChance, prospFactor, rollRarity, type LootSource } from '../core/offers.ts';
import { Rng } from '../core/rng.ts';
import type { CardInstance, ClassId, ItemRarity } from '../core/types.ts';
import { EGGS, EGG_BY_ID } from '../data/eggs.ts';
import { ITEMS, ITEM_LIST } from '../data/items.ts';
import { CLASS_START_HP, LIBRARY, newCard, rewardPool, starterDeck } from '../data/library.ts';
import { TIER_SCALE, ENCOUNTERS, encountersOfTier, type Act, type EncounterTier } from '../data/monsters.ts';
import { GODS, BOON_BY_ID, type GodId } from '../data/gods.ts';
import { RELICS, RELIC_BY_ID } from '../data/relics.ts';
import { EVENTS, EVENT_BY_ID } from '../data/events.ts';
import { NO_PERKS, type Boon, type PickWhat, type RunOp, type RunPerks } from './boons.ts';

export type Phase = 'dieu' | 'map' | 'combat' | 'reward' | 'zaap' | 'marchand' | 'evenement' | 'dofus' | 'victory' | 'defeat';

/** Un choix en attente pendant une bénédiction ou un événement. */
export type Pending =
  | { kind: 'pick'; what: PickWhat; left: number }
  | { kind: 'card'; options: string[] }
  | { kind: 'item'; options: string[] };

export interface GodVisit { id: GodId; offer: string[]; taken: string | null }
export interface EventVisit {
  id: string;
  /** Option choisie, et ce qui s'est passé (texte du résultat). */
  chosen: number | null;
  result: string;
  /** Ce que le choix a donné, pour le récapitulatif. */
  gains: string[];
}

export interface Reward {
  cards: string[];
  cardTaken: string | null;
  items: string[];
  /** Source du butin (élite : objets plus rares), null si le combat n'a pas donné d'objet. */
  itemSource: LootSource | null;
  itemTaken: string | null;
  /** Prospection au moment du butin. */
  prospection: number;
  /** Kamas gagnés, et volés par des monstres en fuite. */
  kamas: number;
  stolen: number;
}

export interface ShopEntry { id: string; price: number; sold: boolean }
export interface Shop {
  cards: ShopEntry[];
  items: ShopEntry[];
  /** Prix du retrait d'une carte (augmente à chaque retrait de la run). */
  removePrice: number;
  removed: boolean;
}

export const START_KAMAS = 60;
export const CARD_PRICE = { commune: 50, rare: 80 };
export const ITEM_PRICE: Record<ItemRarity, number> = { commun: 75, rare: 115, mythique: 170, legendaire: 260 };
const KAMAS_BY_TIER: Record<EncounterTier, [number, number]> = { faible: [12, 18], normal: [16, 24], elite: [30, 40], boss: [70, 80] };

export const ZAAP_HEAL = 0.3;
const FIRST_NORMAL_FLOOR = 4;

export class Run {
  readonly classe: ClassId;
  /** Apparence du personnage (animations homme / femme). */
  readonly gender: 'm' | 'f';
  readonly seed: number;
  readonly rng: Rng;
  map: ActMap;
  act: Act = 1;
  kamas = START_KAMAS;
  /** Dofus obtenus (ids de data/eggs.ts). */
  dofus: string[] = [];
  /** Trois Dofus proposés après un boss. */
  dofusOffer: string[] = [];
  /** Résurrections déjà utilisées (Dokoko, Neuf vies, Potion de résurrection : une chacune). */
  revivesUsed = 0;
  /** Bénédictions des dieux et reliques d'événement. */
  boons: string[] = [];
  relics: string[] = [];
  /** PV max gagnés ou perdus hors équipement (événements, bénédictions). */
  maxHpBonus = 0;
  god: GodVisit | null = null;
  godsSeen: GodId[] = [];
  event: EventVisit | null = null;
  eventsSeen: string[] = [];
  /** Choix en attente, et opérations qui restent à faire derrière lui. */
  pending: Pending | null = null;
  private queue: RunOp[] = [];
  /** Combat lancé par un événement : sa prime, donnée à la victoire. */
  private eventPrize: RunOp[] | null = null;
  /** Désactive les dieux (tests ciblés). */
  readonly gods: boolean;
  shop: Shop | null = null;
  removals = 0;
  deck: CardInstance[];
  equipment: Equipment = {};
  hp: number;
  readonly baseMaxHp: number;
  phase: Phase = 'map';
  position: string | null = null;
  /** Nœuds visités, dans l'ordre. */
  path: string[] = [];
  node: MapNode | null = null;
  combat: Combat | null = null;
  encounter: string | null = null;
  reward: Reward | null = null;
  zaapUsed = false;
  /** Effet de chaque objet pour cette run (tiré à la création : un même objet garde son effet toute la run). */
  readonly itemEffects: EffectTable = {};
  /** Prospection gagnée pour le reste de la run, et pour le prochain combat seulement. */
  prospRun = 0;
  prospNext = 0;
  /** Effets hors équipement (outils de simulation : chiffrage d'un effet isolé). */
  extraEffects: import('../core/effects.ts').ItemEffect[] = [];
  extraProspection = 0;
  /** Simulation : désactive le passif de classe (pour le chiffrer). */
  noPassive = false;
  stats = { combats: 0, elites: 0, floor: 0, kamas: 0 };
  /** Rang d'un combat lancé par un événement (sinon celui de la case). */
  private fightTier: EncounterTier | null = null;
  /** Rencontre de chaque case de combat, tirée dès la génération : la carte peut l'afficher au survol. */
  encounters: Record<string, string> = {};

  constructor(classe: ClassId, seed: number, gender: 'm' | 'f' = 'm', o: { gods?: boolean } = {}) {
    this.gods = o.gods ?? true;
    this.classe = classe;
    this.gender = gender;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.map = generateMap(Run.mapSeed(seed, 1));
    this.deck = starterDeck(classe);
    this.baseMaxHp = CLASS_START_HP[classe] as number;
    this.hp = this.baseMaxHp;
    this.assignEncounters(new Rng(seed ^ 0x2c1b3c6d));
    const fxRng = new Rng(seed ^ 0x7f4a7c15);
    for (const it of ITEM_LIST) this.itemEffects[it.id] = rollEffect(it.rarity, fxRng);
    this.meetGod();
  }

  static mapSeed(seed: number, act: number): number {
    return (seed ^ (0x5bd1e995 + (act - 1) * 0x9e3779b9)) >>> 0;
  }

  /** Étage par étage, chaque case de combat reçoit une rencontre différente de celles de ses parents. */
  private assignEncounters(rng: Rng): void {
    this.encounters = {};
    const nodes = Object.values(this.map.nodes).sort((a, b) => a.floor - b.floor || a.col - b.col);
    for (const node of nodes) {
      if (node.type === 'zaap' || node.type === 'marchand' || node.type === 'evenement') continue;
      const tier = Run.tierOf(node);
      const parents = nodes.filter((n) => n.next.includes(node.id)).map((n) => this.encounters[n.id]);
      const pool = encountersOfTier(tier, this.act);
      const fresh = pool.filter((e) => !parents.includes(e));
      this.encounters[node.id] = rng.pick(fresh.length ? fresh : pool);
    }
  }

  static tierOf(node: MapNode): EncounterTier {
    return node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : node.floor < FIRST_NORMAL_FLOOR ? 'faible' : 'normal';
  }

  // ───────────── lecture ─────────────

  /** Équipement + Dofus. */
  loadout(): Loadout {
    const l = computeLoadout(this.equipment, ITEMS, this.itemEffects);
    for (const id of this.dofus) {
      const egg = EGG_BY_ID[id];
      l.pvBonus += egg.stats?.pv ?? 0;
      l.prospection += egg.stats?.prospection ?? 0;
      l.effects.push(...egg.effects.map((fx) => ({ ...fx, src: `dofus:${id}` })));
    }
    for (const [src, b] of this.blessings()) {
      const st = b.stats ?? {};
      l.pvBonus += st.pv ?? 0;
      l.blockBonus += st.armure ?? 0;
      l.prospection += st.prospection ?? 0;
      for (const [el, v] of Object.entries(st.dom ?? {})) l.dom[el as keyof typeof l.dom] += v ?? 0;
      l.effects.push(...(b.effects ?? []).map((fx) => ({ ...fx, src })));
    }
    return l;
  }

  /** Bénédictions et reliques, avec leur source (« dieu:… », « relique:… »). */
  blessings(): [string, Boon][] {
    return [
      ...this.boons.map((id): [string, Boon] => [`dieu:${id}`, BOON_BY_ID[id]]),
      ...this.relics.map((id): [string, Boon] => [`relique:${id}`, RELIC_BY_ID[id]]),
    ];
  }

  /** Avantages de run cumulés (kamas, remises, cartes en plus, résurrections). */
  perks(): RunPerks {
    const p = NO_PERKS();
    for (const [, b] of this.blessings()) for (const [k, v] of Object.entries(b.perks ?? {})) p[k as keyof RunPerks] += v ?? 0;
    return p;
  }

  private revivesLeft(): number {
    return (this.dofus.includes('dokoko') ? 1 : 0) + this.perks().revive - this.revivesUsed;
  }

  /** Prospection actuelle : objets + gains de la run + bonus du prochain combat. */
  prospection(): number {
    return this.loadout().prospection + this.prospRun + this.prospNext + this.extraProspection;
  }

  get maxHp(): number {
    return Math.max(1, this.baseMaxHp + this.maxHpBonus + this.loadout().pvBonus);
  }

  /** Nœuds où le joueur peut aller maintenant. */
  availableNodes(): string[] {
    if (this.phase !== 'map') return [];
    if (this.position === null) return this.map.starts;
    return this.map.nodes[this.position].next;
  }

  // ───────────── carte ─────────────

  enterNode(id: string): void {
    if (!this.availableNodes().includes(id)) throw new Error(`Nœud ${id} inaccessible`);
    const node = this.map.nodes[id];
    this.position = id;
    this.path.push(id);
    this.node = node;
    this.stats.floor = node.floor;
    if (node.type === 'zaap') {
      this.phase = 'zaap';
      this.zaapUsed = false;
      return;
    }
    if (node.type === 'marchand') {
      this.openShop();
      return;
    }
    if (node.type === 'evenement') {
      this.openEvent();
      return;
    }
    this.startCombat(this.encounters[id]);
  }

  private startCombat(encounter: string): void {
    const l = this.loadout();
    this.encounter = encounter;
    this.combat = new Combat(
      LIBRARY, this.deck,
      { hp: this.hp, maxHp: this.maxHp, dom: l.dom, blockBonus: l.blockBonus, effects: [...l.effects, ...this.extraEffects], revive: this.revivesLeft() > 0, classe: this.noPassive ? undefined : this.classe },
      ENCOUNTERS[encounter].monsters, this.rng.int(2 ** 31), TIER_SCALE[this.act][ENCOUNTERS[encounter].tier],
    );
    this.phase = 'combat';
  }

  // ───────────── combat ─────────────

  /** À appeler après chaque action de combat : passe à la récompense, à la victoire ou à la défaite. */
  checkCombatEnd(): void {
    const c = this.combat;
    if (this.phase !== 'combat' || !c || c.outcome === 'ongoing') return;
    if (c.outcome === 'lost') {
      this.hp = 0;
      this.phase = 'defeat';
      return;
    }
    this.hp = c.player.hp; // seul ce qui survit au combat
    if (c.result().revived) this.revivesUsed++;
    const stolen = c.result().kamasStolen;
    this.kamas = Math.max(0, this.kamas - stolen);
    this.stats.combats++;
    const prize = this.eventPrize;
    this.eventPrize = null;
    const type = this.fightTier ?? this.node?.type;
    const tier = this.fightTier ?? (this.node ? Run.tierOf(this.node) : 'normal');
    this.fightTier = null;
    const [kmin, kmax] = KAMAS_BY_TIER[tier];
    const kamas = Math.round((kmin + this.rng.int(kmax - kmin + 1)) * (1 + 0.5 * (this.act - 1)) * (1 + 0.5 * prospFactor(this.prospection())) * (1 + this.perks().kamasMul));
    this.kamas += kamas;
    this.stats.kamas += kamas;
    if (type === 'boss') {
      if (this.act === 3) { this.phase = 'victory'; return; }
      const owned = new Set(this.dofus);
      this.dofusOffer = this.rng.shuffle(EGGS.filter((e) => !owned.has(e.id)).map((e) => e.id)).slice(0, 3);
      this.phase = 'dofus';
      return;
    }
    if (type === 'elite') this.stats.elites++;
    // Butin : la prospection de ce combat inclut le bonus gagné au combat précédent ;
    // les gains de ce combat-ci valent pour la suite.
    const prosp = this.prospection();
    const gained = c.result().prospection;
    this.prospRun += gained.run;
    this.prospNext = gained.next;
    const source: LootSource = type === 'elite' ? 'elite' : 'normal';
    const drops = this.rng.next() < lootChance(source, prosp);
    this.reward = {
      cards: this.cardOffer(type === 'elite' ? 0.5 : 0.25, 3 + this.perks().cardChoices),
      cardTaken: null,
      items: drops ? itemOffer(this.offerContext(), source, prosp, this.rng) : [],
      itemSource: drops ? source : null,
      itemTaken: null,
      prospection: prosp,
      kamas,
      stolen,
    };
    this.phase = 'reward';
    if (prize) this.runOps(prize);
  }

  offerContext() {
    return { cards: LIBRARY, items: ITEMS, deck: this.deck, equipment: this.equipment, table: this.itemEffects };
  }

  private cardOffer(rareChance: number, count = 3, neutral = false): string[] {
    const pool = rewardPool(this.classe).filter((id) => !neutral || LIBRARY.cards[id].classe === 'neutre');
    const byRarity = (r: string) => pool.filter((id) => LIBRARY.cards[id].rarity === r);
    const offer: string[] = [];
    while (offer.length < Math.min(count, pool.length)) {
      const tier = this.rng.next() < rareChance ? byRarity('rare') : byRarity('commune');
      const candidates = tier.filter((id) => !offer.includes(id));
      if (!candidates.length) continue;
      offer.push(this.rng.pick(candidates));
    }
    return offer;
  }

  // ───────────── récompenses ─────────────

  takeCard(id: string): void {
    const r = this.reward;
    if (this.phase !== 'reward' || !r || r.cardTaken) throw new Error('Aucune carte à prendre');
    if (!r.cards.includes(id)) throw new Error(`Carte ${id} non proposée`);
    this.deck.push(newCard(id));
    r.cardTaken = id;
  }

  takeItem(id: string): void {
    const r = this.reward;
    if (this.phase !== 'reward' || !r || r.itemTaken) throw new Error('Aucun item à prendre');
    if (!r.items.includes(id)) throw new Error(`Item ${id} non proposé`);
    this.equip(id);
    r.itemTaken = id;
  }

  /** Équipe un item (remplace celui de l'emplacement). Les PV suivent la variation des PV max. */
  equip(id: string): void {
    const before = this.maxHp;
    this.equipment = { ...this.equipment, [ITEMS.items[id].slot]: id };
    const after = this.maxHp;
    this.hp = after > before ? this.hp + (after - before) : Math.min(this.hp, after);
  }

  leaveReward(): void {
    if (this.phase !== 'reward') throw new Error('Pas de récompense en cours');
    if (this.pending) throw new Error('Un choix est en attente');
    this.reward = null;
    this.combat = null;
    this.phase = 'map';
  }

  // ───────────── Dofus et passage d'acte ─────────────

  takeDofus(id: string): void {
    if (this.phase !== 'dofus' || !this.dofusOffer.includes(id)) throw new Error('Dofus non proposé');
    const before = this.maxHp;
    this.dofus.push(id);
    this.hp += Math.max(0, this.maxHp - before);
    this.dofusOffer = [];
    this.nextAct();
  }

  /** Acte suivant : nouvelle carte, nouvelles rencontres, PV remis au maximum. */
  private nextAct(): void {
    this.act = (this.act + 1) as Act;
    this.map = generateMap(Run.mapSeed(this.seed, this.act));
    this.assignEncounters(new Rng(this.seed ^ (0x2c1b3c6d + this.act)));
    this.position = null;
    this.path = [];
    this.node = null;
    this.combat = null;
    this.encounter = null;
    this.reward = null;
    this.prospNext = 0;
    this.stats.floor = 0;
    this.hp = this.maxHp;
    this.phase = 'map';
    this.meetGod();
  }

  // ───────────── marchand ─────────────

  private openShop(): void {
    const pool = rewardPool(this.classe);
    const of = (r: string) => this.rng.shuffle(pool.filter((id) => LIBRARY.cards[id].rarity === r));
    const off = 1 - Math.min(0.6, this.perks().shopDiscount);
    const vary = (n: number) => Math.round(n * (0.9 + this.rng.next() * 0.2) * off);
    const cards = [...of('commune').slice(0, 3), ...of('rare').slice(0, 2)].map((id) => ({
      id, price: vary(CARD_PRICE[LIBRARY.cards[id].rarity === 'rare' ? 'rare' : 'commune']), sold: false,
    }));
    const prosp = this.prospection();
    const equipped = new Set(Object.values(this.equipment));
    const items: ShopEntry[] = [];
    for (let i = 0; i < 3; i++) {
      const rarity = rollRarity('normal', prosp + 60, this.rng);
      const choices = ITEM_LIST.filter((it) => it.rarity === rarity && !equipped.has(it.id) && !items.some((x) => x.id === it.id));
      if (!choices.length) continue;
      const it = this.rng.pick(choices);
      items.push({ id: it.id, price: vary(ITEM_PRICE[it.rarity]), sold: false });
    }
    this.shop = { cards, items, removePrice: Math.round((50 + 25 * this.removals) * off), removed: false };
    this.phase = 'marchand';
  }

  private pay(price: number): void {
    if (this.phase !== 'marchand' || !this.shop) throw new Error('Pas chez le marchand');
    if (this.kamas < price) throw new Error('Pas assez de kamas');
    this.kamas -= price;
  }

  buyCard(id: string): void {
    const e = this.shop?.cards.find((x) => x.id === id && !x.sold);
    if (!e) throw new Error('Carte indisponible');
    this.pay(e.price);
    e.sold = true;
    this.deck.push(newCard(id));
  }

  buyItem(id: string): void {
    const e = this.shop?.items.find((x) => x.id === id && !x.sold);
    if (!e) throw new Error('Objet indisponible');
    this.pay(e.price);
    e.sold = true;
    this.equip(id);
  }

  /** Retire définitivement une carte du deck (une fois par marchand). */
  removeCard(uid: number): void {
    const shop = this.shop;
    if (!shop || shop.removed) throw new Error('Retrait indisponible');
    const i = this.deck.findIndex((c) => c.uid === uid);
    if (i < 0) throw new Error('Carte introuvable');
    this.pay(shop.removePrice);
    shop.removed = true;
    this.removals++;
    this.deck.splice(i, 1);
  }

  leaveShop(): void {
    if (this.phase !== 'marchand') throw new Error('Pas chez le marchand');
    this.shop = null;
    this.phase = 'map';
  }

  // ───────────── Zaap ─────────────

  zaapHealAmount(): number {
    return Math.min(this.maxHp - this.hp, Math.round(this.maxHp * (ZAAP_HEAL + this.perks().zaapHeal)));
  }

  zaapRest(): void {
    this.useZaap();
    this.hp += this.zaapHealAmount();
  }

  zaapUpgrade(uid: number): void {
    const card = this.deck.find((c) => c.uid === uid);
    if (!card || card.upgraded) throw new Error('Carte non améliorable');
    this.useZaap();
    card.upgraded = true;
  }

  leaveZaap(): void {
    if (this.phase !== 'zaap') throw new Error('Pas au Zaap');
    this.phase = 'map';
  }

  private useZaap(): void {
    if (this.phase !== 'zaap') throw new Error('Pas au Zaap');
    if (this.zaapUsed) throw new Error('Zaap déjà utilisé');
    this.zaapUsed = true;
  }

  // ───────────── dieux ─────────────

  /** Au début de chaque acte, un dieu jamais croisé dans la run propose trois de ses six bénédictions. */
  private meetGod(): void {
    if (!this.gods) return;
    const rng = new Rng((this.seed ^ (0x51ed270b + this.act * 0x2545f491)) >>> 0);
    const left = GODS.filter((g) => !this.godsSeen.includes(g.id));
    const god = rng.pick(left.length ? left : GODS);
    this.godsSeen.push(god.id);
    this.god = { id: god.id, offer: rng.shuffle(god.boons.map((b) => b.id)).slice(0, 3), taken: null };
    this.phase = 'dieu';
  }

  takeBoon(id: string): void {
    const g = this.god;
    if (this.phase !== 'dieu' || !g || g.taken || !g.offer.includes(id)) throw new Error('Bénédiction non proposée');
    g.taken = id;
    this.boons.push(id);
    this.grant(BOON_BY_ID[id]);
  }

  /** Repartir sans bénédiction (le dieu ne revient pas). */
  leaveGod(): void {
    if (this.phase !== 'dieu' || this.pending) throw new Error('Pas devant un dieu');
    this.phase = 'map';
  }

  /** Une bénédiction ou une relique prend effet : PV max tout de suite, puis ses opérations. */
  private grant(b: Boon): void {
    if (b.stats?.pv) this.hp += b.stats.pv;
    this.runOps(b.now ?? []);
  }

  gainRelic(id: string): void {
    if (this.relics.includes(id)) return;
    this.relics.push(id);
    this.event?.gains.push(`Relique : ${RELIC_BY_ID[id].name}`);
    this.grant(RELIC_BY_ID[id]);
  }

  // ───────────── événements ─────────────

  private openEvent(): void {
    const pool = EVENTS.filter((e) => e.act === this.act && !this.eventsSeen.includes(e.id));
    const ev = this.rng.pick(pool.length ? pool : EVENTS.filter((e) => e.act === this.act));
    this.eventsSeen.push(ev.id);
    this.event = { id: ev.id, chosen: null, result: '', gains: [] };
    this.phase = 'evenement';
  }

  /** Un choix d'événement est-il possible ? (kamas suffisants, prix en PV qui ne tue pas, cartes à choisir). */
  optionState(i: number): { ok: boolean; why: string } {
    const ev = this.event ? EVENT_BY_ID[this.event.id] : null;
    const opt = ev?.options[i];
    if (!opt) return { ok: false, why: '' };
    let kamas = 0, hp = 0, max = 0;
    for (const o of opt.ops) {
      if (o.op === 'kamas' && o.n < 0) kamas -= o.n;
      if (o.op === 'loseHp') hp += o.n;
      if (o.op === 'maxHp' && o.n < 0) max -= o.n;
      if (o.op === 'pick' && this.pickCandidates(o.what).length === 0) return { ok: false, why: 'Aucune carte possible' };
    }
    if (kamas > this.kamas) return { ok: false, why: `Il te faut ${kamas} kamas` };
    if (hp && this.hp <= hp) return { ok: false, why: `Il te faut plus de ${hp} PV` };
    if (max && this.maxHp <= max + 1) return { ok: false, why: 'PV max trop bas' };
    return { ok: true, why: '' };
  }

  chooseOption(i: number): void {
    const v = this.event;
    if (this.phase !== 'evenement' || !v || v.chosen !== null) throw new Error('Pas de choix possible');
    if (!this.optionState(i).ok) throw new Error('Choix impossible');
    const opt = EVENT_BY_ID[v.id].options[i];
    v.chosen = i;
    v.result = opt.after;
    this.runOps(opt.ops);
  }

  leaveEvent(): void {
    if (this.phase !== 'evenement' || !this.event || this.event.chosen === null || this.pending) throw new Error('Événement en cours');
    this.event = null;
    this.phase = 'map';
  }

  // ───────────── opérations de run ─────────────

  runOps(ops: RunOp[]): void {
    this.queue.push(...ops);
    this.drain();
  }

  private drain(): void {
    while (!this.pending && this.queue.length && this.phase !== 'combat') this.applyOp(this.queue.shift()!);
    if (!this.pending && !this.queue.length && this.phase === 'dieu' && this.god?.taken) this.phase = 'map';
  }

  private note(t: string): void { this.event?.gains.push(t); }

  private applyOp(o: RunOp): void {
    switch (o.op) {
      case 'heal': { const n = Math.min(o.n, this.maxHp - this.hp); this.hp += n; if (n) this.note(`+${n} PV`); break; }
      case 'healPct': { const n = Math.min(Math.round(this.maxHp * o.pct), this.maxHp - this.hp); this.hp += n; if (n) this.note(`+${n} PV`); break; }
      case 'maxHp':
        this.maxHpBonus += o.n;
        this.hp = o.n > 0 ? this.hp + o.n : Math.max(1, Math.min(this.hp, this.maxHp));
        this.note(`${o.n > 0 ? '+' : ''}${o.n} PV max`);
        break;
      case 'loseHp': this.hp = Math.max(1, this.hp - o.n); this.note(`−${o.n} PV`); break;
      case 'kamas': this.kamas = Math.max(0, this.kamas + o.n); this.note(o.n > 0 ? `+${o.n} kamas` : `−${-o.n} kamas`); break;
      case 'prosp': this.prospRun += o.n; this.note(`+${o.n} prospection`); break;
      case 'upgrade': {
        const can = this.rng.shuffle(this.pickCandidates('upgrade')).slice(0, o.n);
        for (const c of can) c.upgraded = true;
        if (can.length) this.note(`Amélioré : ${can.map((c) => LIBRARY.cards[c.id].name).join(', ')}`);
        break;
      }
      case 'upgradeAll': {
        const can = this.pickCandidates('upgrade').filter((c) => LIBRARY.cards[c.id].type === o.type);
        for (const c of can) c.upgraded = true;
        this.note(`${can.length} carte${can.length > 1 ? 's' : ''} améliorée${can.length > 1 ? 's' : ''}`);
        break;
      }
      case 'pick':
        if (this.pickCandidates(o.what).length) this.pending = { kind: 'pick', what: o.what, left: o.n };
        break;
      case 'cardChoice':
        this.pending = { kind: 'card', options: this.cardOffer(o.rarity === 'rare' ? 1 : o.rarity === 'commune' ? 0 : 0.35, 3, o.neutral) };
        break;
      case 'curse':
        this.deck.push(newCard(o.id));
        this.note(`Malédiction : ${LIBRARY.cards[o.id].name}`);
        break;
      case 'itemChoice': {
        const equipped = new Set(Object.values(this.equipment));
        const pool = this.rng.shuffle(ITEM_LIST.filter((it) => it.rarity === o.rarity && !equipped.has(it.id)));
        const picked: string[] = [];
        for (const it of pool) if (picked.length < 3 && !picked.some((p) => ITEMS.items[p].slot === it.slot)) picked.push(it.id);
        if (picked.length) this.pending = { kind: 'item', options: picked };
        break;
      }
      case 'relic': {
        const free = RELICS.filter((r) => !this.relics.includes(r.id)).map((r) => r.id);
        const id = o.id && !this.relics.includes(o.id) ? o.id : free.length ? this.rng.pick(free) : null;
        if (id) this.gainRelic(id);
        else this.note('Plus aucune relique à trouver : +100 kamas'), (this.kamas += 100);
        break;
      }
      case 'fight': {
        const pool = encountersOfTier(o.tier, this.act);
        this.fightTier = o.tier;
        this.eventPrize = [...(o.then ?? []), ...this.queue];
        this.queue = [];
        this.startCombat(this.rng.pick(pool));
        break;
      }
      case 'chance': {
        const win = this.rng.next() < o.p;
        if (this.event) this.event.result = [this.event.result, win ? o.winText : o.loseText].filter(Boolean).join(' ');
        this.queue.unshift(...(win ? o.win : o.lose));
        break;
      }
    }
  }

  /** Cartes du deck sur lesquelles un choix peut porter. */
  pickCandidates(what: PickWhat): CardInstance[] {
    switch (what) {
      case 'remove': return [...this.deck];
      case 'upgrade': return this.deck.filter((c) => !c.upgraded && !!LIBRARY.cards[c.id].upgrade);
      case 'transform': return [...this.deck];
      case 'duplicate': return this.deck.filter((c) => !LIBRARY.cards[c.id].curse);
    }
  }

  resolvePick(uid: number): void {
    const p = this.pending;
    if (!p || p.kind !== 'pick') throw new Error('Aucun choix de carte en attente');
    const card = this.pickCandidates(p.what).find((c) => c.uid === uid);
    if (!card) throw new Error('Carte non éligible');
    const name = LIBRARY.cards[card.id].name;
    if (p.what === 'remove') { this.deck.splice(this.deck.indexOf(card), 1); this.note(`Retirée : ${name}`); }
    if (p.what === 'upgrade') { card.upgraded = true; this.note(`Améliorée : ${name}`); }
    if (p.what === 'duplicate') { this.deck.push({ ...newCard(card.id), upgraded: card.upgraded }); this.note(`Copiée : ${name}`); }
    if (p.what === 'transform') {
      const pool = rewardPool(this.classe).filter((id) => id !== card.id);
      const id = this.rng.pick(pool);
      this.deck.splice(this.deck.indexOf(card), 1, newCard(id));
      this.note(`${name} devient ${LIBRARY.cards[id].name}`);
    }
    p.left--;
    if (p.left <= 0 || !this.pickCandidates(p.what).length) this.pending = null;
    this.drain();
  }

  /** Carte choisie parmi trois (ou null pour passer). */
  chooseCard(id: string | null): void {
    const p = this.pending;
    if (!p || p.kind !== 'card') throw new Error('Aucun choix de carte en attente');
    if (id) {
      if (!p.options.includes(id)) throw new Error('Carte non proposée');
      this.deck.push(newCard(id));
      this.note(`Carte : ${LIBRARY.cards[id].name}`);
    }
    this.pending = null;
    this.drain();
  }

  chooseItem(id: string | null): void {
    const p = this.pending;
    if (!p || p.kind !== 'item') throw new Error('Aucun choix d\'objet en attente');
    if (id) {
      if (!p.options.includes(id)) throw new Error('Objet non proposé');
      this.equip(id);
      this.note(`Objet : ${ITEMS.items[id].name}`);
    }
    this.pending = null;
    this.drain();
  }

  /** Passer le choix en cours (retrait, amélioration… restant). */
  skipPending(): void {
    if (!this.pending) return;
    this.pending = null;
    this.drain();
  }
}
