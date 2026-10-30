// Types de données du jeu. Tout le contenu (cartes, monstres, items) est décrit
// en données qui respectent ces types : un script de build pourra les générer
// depuis DofusDB / Spire Codex sans toucher au moteur.

export type Element = 'terre' | 'feu' | 'eau' | 'air' | 'neutre';
export const ELEMENTS: readonly Element[] = ['terre', 'feu', 'eau', 'air'];

export type ClassId = 'iop' | 'cra' | 'eniripsa' | 'xelor' | 'osamodas';

/** puissance : +dégâts fixes. faiblesse : -25 % dégâts infligés. vulnerabilite : +50 % dégâts subis.
 *  brulure : dégâts en fin de round égaux aux cumuls, puis -1. */
export type StatusId = 'puissance' | 'faiblesse' | 'vulnerabilite' | 'brulure';
export type StatusMap = Partial<Record<StatusId, number>>;

/** Pour un effet de statut : 'target' = la cible de la carte (ou le joueur pour un monstre),
 *  'self' = le lanceur, 'all_enemies' = tous les ennemis vivants. */
export type StatusTarget = 'target' | 'self' | 'all_enemies';

export type Effect =
  | { type: 'damage'; amount: number; element: Element; hits?: number }
  /** Dégâts dont les PV réellement perdus par la cible sont rendus au lanceur (Eau). */
  | { type: 'drain'; amount: number; element: Element }
  | { type: 'block'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'draw'; amount: number }
  | { type: 'energy'; amount: number }
  | { type: 'status'; status: StatusId; amount: number; on: StatusTarget };

export type CardType = 'attaque' | 'competence';
export type CardTarget = 'enemy' | 'all_enemies' | 'self';
export type Rarity = 'base' | 'commune' | 'rare';

export interface CardDef {
  id: string;
  name: string;
  classe: ClassId | 'neutre';
  cost: number;
  type: CardType;
  element: Element;
  target: CardTarget;
  rarity: Rarity;
  effects: Effect[];
  exhaust?: boolean;
  /** Version améliorée : remplace le coût et/ou les effets. */
  upgrade?: { cost?: number; effects?: Effect[] };
  /** Sort Dofus d'origine (nom, élément, coût et icône en viennent). */
  spellId?: number;
  icon?: string;
  /** Description du sort dans Dofus (ambiance, pas les règles de la carte). */
  lore?: string;
}

export interface MonsterMove {
  name: string;
  effects: Effect[];
}

export type MovePattern =
  | { kind: 'cycle'; order: string[] }
  | { kind: 'random'; weights: Record<string, number>; maxRepeat: number };

export interface MonsterDef {
  id: string;
  name: string;
  hp: [number, number];
  /** Éléments subis à +50 %. */
  weak: Element[];
  /** Éléments subis à -50 %. */
  resist: Element[];
  moves: Record<string, MonsterMove>;
  pattern: MovePattern;
  dofusId?: number;
  image?: string;
  level?: [number, number];
}

export interface CardInstance {
  uid: number;
  id: string;
  upgraded: boolean;
  /** Forgemagie : nouvel élément de la carte (remplace aussi l'élément de ses dégâts). */
  element?: Element;
}

export interface Library {
  cards: Record<string, CardDef>;
  monsters: Record<string, MonsterDef>;
}

// ───────────── Items, panoplies, affinités ─────────────

export type Slot = 'coiffe' | 'cape' | 'amulette' | 'anneau' | 'ceinture' | 'bottes';
export const SLOTS: readonly Slot[] = ['coiffe', 'cape', 'amulette', 'anneau', 'ceinture', 'bottes'];

/** Stats d'équipement. Tout est additif. */
export interface Stats {
  /** PV max */
  pv?: number;
  /** Armure ajoutée à chaque gain d'armure */
  armure?: number;
  /** Dégâts fixes ajoutés par coup, par élément */
  dom?: Partial<Record<Element, number>>;
  /** Voie multi : +N dégâts par coup, par élément différent déjà joué ce tour */
  prisme?: number;
}

export interface ActiveDef {
  name: string;
  target: CardTarget;
  effects: Effect[];
}

export type ItemRarity = 'commun' | 'rare';

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: ItemRarity;
  /** Éléments de l'item : 1 point d'affinité chacun. Vide = neutre. */
  elements: Element[];
  stats: Stats;
  panoplie?: string;
  /** Réservé aux items rares : utilisable une fois par combat, rechargé au début de chaque combat. */
  active?: ActiveDef;
  dofusId?: number;
  icon?: string;
  level?: number;
}

export interface PanoplieDef {
  id: string;
  name: string;
  /** Famille : mono-élément, duo, multi (prisme) ou neutre. Sert à orienter les offres. */
  kind?: 'mono' | 'duo' | 'multi' | 'neutre';
  items: string[];
  /** Bonus cumulatifs par nombre de pièces équipées (ex. 2 et 4). */
  bonuses: Record<number, Stats>;
}

/** Effets secondaires élémentaires débloqués par les paliers d'affinité. */
export interface Passives {
  /** Jouer une carte Terre donne N armure */
  terreArmure: number;
  /** Les attaques Feu appliquent N brûlure à chaque cible touchée */
  feuBrulure: number;
  /** Les attaques Eau soignent N */
  eauSoin: number;
  /** Les N premières cartes Air jouées chaque tour piochent 1 carte */
  airPioche: number;
  /** Voie multi (voir Stats.prisme) */
  prisme: number;
}

export const NO_PASSIVES: Passives = { terreArmure: 0, feuBrulure: 0, eauSoin: 0, airPioche: 0, prisme: 0 };
