// Une partie (run) : carte de l'acte, combats, récompenses, Zaap. Aucune dépendance au DOM :
// l'interface ne fait qu'appeler ces méthodes et afficher l'état.
import { Combat } from '../core/combat.ts';
import { rollEffect } from '../core/effects.ts';
import { computeLoadout, type EffectTable, type Equipment, type Loadout } from '../core/loadout.ts';
import { generateMap, type ActMap, type MapNode } from '../core/map.ts';
import { itemOffer, lootChance, type LootSource } from '../core/offers.ts';
import { Rng } from '../core/rng.ts';
import type { CardInstance, ClassId } from '../core/types.ts';
import { ITEMS, ITEM_LIST } from '../data/items.ts';
import { CLASS_START_HP, LIBRARY, newCard, rewardPool, starterDeck } from '../data/library.ts';
import { ACT1_SCALE, ENCOUNTERS, encountersOfTier, type EncounterTier } from '../data/monsters.ts';

export type Phase = 'map' | 'combat' | 'reward' | 'zaap' | 'victory' | 'defeat';

export interface Reward {
  cards: string[];
  cardTaken: string | null;
  items: string[];
  /** Source du butin (élite : objets plus rares), null si le combat n'a pas donné d'objet. */
  itemSource: LootSource | null;
  itemTaken: string | null;
  /** Prospection au moment du butin. */
  prospection: number;
}

export const ZAAP_HEAL = 0.3;
const FIRST_NORMAL_FLOOR = 4;

export class Run {
  readonly classe: ClassId;
  /** Apparence du personnage (animations homme / femme). */
  readonly gender: 'm' | 'f';
  readonly seed: number;
  readonly rng: Rng;
  readonly map: ActMap;
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
  stats = { combats: 0, elites: 0, floor: 0 };
  /** Rencontre de chaque case de combat, tirée dès la génération : la carte peut l'afficher au survol. */
  readonly encounters: Record<string, string> = {};

  constructor(classe: ClassId, seed: number, gender: 'm' | 'f' = 'm') {
    this.classe = classe;
    this.gender = gender;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.map = generateMap(seed ^ 0x5bd1e995);
    this.deck = starterDeck(classe);
    this.baseMaxHp = CLASS_START_HP[classe] as number;
    this.hp = this.baseMaxHp;
    this.assignEncounters(new Rng(seed ^ 0x2c1b3c6d));
    const fxRng = new Rng(seed ^ 0x7f4a7c15);
    for (const it of ITEM_LIST) this.itemEffects[it.id] = rollEffect(it.rarity, fxRng);
  }

  /** Étage par étage, chaque case de combat reçoit une rencontre différente de celles de ses parents. */
  private assignEncounters(rng: Rng): void {
    const nodes = Object.values(this.map.nodes).sort((a, b) => a.floor - b.floor || a.col - b.col);
    for (const node of nodes) {
      if (node.type === 'zaap') continue;
      const tier = Run.tierOf(node);
      const parents = nodes.filter((n) => n.next.includes(node.id)).map((n) => this.encounters[n.id]);
      const pool = encountersOfTier(tier);
      const fresh = pool.filter((e) => !parents.includes(e));
      this.encounters[node.id] = rng.pick(fresh.length ? fresh : pool);
    }
  }

  static tierOf(node: MapNode): EncounterTier {
    return node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : node.floor < FIRST_NORMAL_FLOOR ? 'faible' : 'normal';
  }

  // ───────────── lecture ─────────────

  loadout(): Loadout {
    return computeLoadout(this.equipment, ITEMS, this.itemEffects);
  }

  /** Prospection actuelle : objets + gains de la run + bonus du prochain combat. */
  prospection(): number {
    return this.loadout().prospection + this.prospRun + this.prospNext + this.extraProspection;
  }

  get maxHp(): number {
    return this.baseMaxHp + this.loadout().pvBonus;
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
    this.startCombat(this.encounters[id]);
  }

  private startCombat(encounter: string): void {
    const l = this.loadout();
    this.encounter = encounter;
    this.combat = new Combat(
      LIBRARY, this.deck,
      { hp: this.hp, maxHp: this.maxHp, dom: l.dom, blockBonus: l.blockBonus, effects: [...l.effects, ...this.extraEffects] },
      ENCOUNTERS[encounter].monsters, this.rng.int(2 ** 31), ACT1_SCALE,
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
    this.stats.combats++;
    const type = this.node?.type;
    if (type === 'boss') {
      this.phase = 'victory';
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
      cards: this.cardOffer(type === 'elite' ? 0.5 : 0.25),
      cardTaken: null,
      items: drops ? itemOffer(this.offerContext(), source, prosp, this.rng) : [],
      itemSource: drops ? source : null,
      itemTaken: null,
      prospection: prosp,
    };
    this.phase = 'reward';
  }

  offerContext() {
    return { cards: LIBRARY, items: ITEMS, deck: this.deck, equipment: this.equipment, table: this.itemEffects };
  }

  private cardOffer(rareChance: number): string[] {
    const pool = rewardPool(this.classe);
    const byRarity = (r: string) => pool.filter((id) => LIBRARY.cards[id].rarity === r);
    const offer: string[] = [];
    while (offer.length < 3) {
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
    this.reward = null;
    this.combat = null;
    this.phase = 'map';
  }

  // ───────────── Zaap ─────────────

  zaapHealAmount(): number {
    return Math.min(this.maxHp - this.hp, Math.round(this.maxHp * ZAAP_HEAL));
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
}
