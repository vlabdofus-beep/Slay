// Une partie (run) : carte de l'acte, combats, récompenses, Zaap. Aucune dépendance au DOM :
// l'interface ne fait qu'appeler ces méthodes et afficher l'état.
import { Combat } from '../core/combat.ts';
import { computeLoadout, type Equipment, type Loadout } from '../core/loadout.ts';
import { generateMap, type ActMap, type MapNode } from '../core/map.ts';
import { itemOffer } from '../core/offers.ts';
import { Rng } from '../core/rng.ts';
import type { CardInstance, ClassId, Element, ItemRarity } from '../core/types.ts';
import { ITEMS } from '../data/items.ts';
import { CLASS_START_HP, LIBRARY, newCard, rewardPool, starterDeck } from '../data/library.ts';
import { ACT1_SCALE, ENCOUNTERS, encountersOfTier, type EncounterTier } from '../data/monsters.ts';

export type Phase = 'map' | 'combat' | 'reward' | 'zaap' | 'victory' | 'defeat';

export interface Reward {
  cards: string[];
  cardTaken: string | null;
  items: string[];
  itemRarity: ItemRarity | null;
  itemTaken: string | null;
}

export const ZAAP_HEAL = 0.3;
const FIRST_NORMAL_FLOOR = 4;

export class Run {
  readonly classe: ClassId;
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
  hallwayFights = 0;
  stats = { combats: 0, elites: 0, floor: 0 };
  private lastEncounter = '';

  constructor(classe: ClassId, seed: number) {
    this.classe = classe;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.map = generateMap(seed ^ 0x5bd1e995);
    this.deck = starterDeck(classe);
    this.baseMaxHp = CLASS_START_HP[classe] as number;
    this.hp = this.baseMaxHp;
  }

  // ───────────── lecture ─────────────

  loadout(): Loadout {
    return computeLoadout(LIBRARY, this.deck, this.equipment, ITEMS);
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
    const tier: EncounterTier =
      node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : node.floor < FIRST_NORMAL_FLOOR ? 'faible' : 'normal';
    this.startCombat(this.pickEncounter(tier));
  }

  private pickEncounter(tier: EncounterTier): string {
    const pool = encountersOfTier(tier);
    const choices = pool.length > 1 ? pool.filter((e) => e !== this.lastEncounter) : pool;
    const enc = this.rng.pick(choices);
    this.lastEncounter = enc;
    return enc;
  }

  private startCombat(encounter: string): void {
    const l = this.loadout();
    this.encounter = encounter;
    this.combat = new Combat(
      LIBRARY, this.deck,
      { hp: this.hp, maxHp: this.maxHp, dom: l.dom, blockBonus: l.blockBonus, passives: l.passives, actives: l.actives },
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
    let itemRarity: ItemRarity | null = null;
    if (type === 'elite') itemRarity = 'rare';
    else if (++this.hallwayFights % 2 === 0) itemRarity = 'commun';
    this.reward = {
      cards: this.cardOffer(type === 'elite' ? 0.5 : 0.25),
      cardTaken: null,
      items: itemRarity ? itemOffer({ cards: LIBRARY, items: ITEMS, deck: this.deck, equipment: this.equipment }, itemRarity, this.rng) : [],
      itemRarity,
      itemTaken: null,
    };
    this.phase = 'reward';
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

  /** Forgemagie : change l'élément d'une carte (et de ses dégâts). */
  zaapForge(uid: number, element: Element): void {
    const card = this.deck.find((c) => c.uid === uid);
    if (!card) throw new Error('Carte introuvable');
    const current = card.element ?? LIBRARY.cards[card.id].element;
    if (current === element) throw new Error('La carte a déjà cet élément');
    this.useZaap();
    card.element = element;
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
