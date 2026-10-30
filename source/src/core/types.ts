// Types de données du jeu. Tout le contenu (cartes, monstres, items) est décrit
// en données qui respectent ces types : un script de build pourra les générer
// depuis DofusDB / Spire Codex sans toucher au moteur.

export type Element = 'terre' | 'feu' | 'eau' | 'air' | 'neutre';
export const ELEMENTS: readonly Element[] = ['terre', 'feu', 'eau', 'air'];

export type ClassId = 'iop' | 'cra' | 'eniripsa' | 'xelor' | 'osamodas';

/** Statuts. Durées : faiblesse, vulnérabilité, érosion et renvoi perdent 1 en fin de round ;
 *  puissance, bouclier et esquive restent tout le combat ; étourdi est consommé par l'action sautée.
 *  - puissance : +N dégâts par coup
 *  - faiblesse : -25 % de dégâts infligés
 *  - vulnerabilite : +50 % de dégâts subis
 *  - brulure : en fin de round, N dégâts (l'armure et le bouclier absorbent), puis -1
 *  - poison : en fin de round, N dégâts qui ignorent armure et bouclier, puis divisé par 2
 *  - bouclier : absorbe les dégâts après l'armure, ne disparaît pas en fin de tour
 *  - renvoi : chaque coup reçu renvoie N dégâts à l'attaquant
 *  - erosion : armure et soins reçus divisés par 2
 *  - esquive : chaque charge annule entièrement un coup reçu
 *  - etourdi : saute sa prochaine action (les boss doivent en cumuler 2) */
export type StatusId =
  | 'puissance' | 'faiblesse' | 'vulnerabilite' | 'brulure'
  | 'poison' | 'bouclier' | 'renvoi' | 'erosion' | 'esquive' | 'etourdi';
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
  /** Boss : il faut 2 étourdis pour lui faire sauter une action. */
  boss?: boolean;
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

// ───────────── Objets ─────────────

export type Slot = 'coiffe' | 'cape' | 'amulette' | 'anneau' | 'ceinture' | 'bottes';
export const SLOTS: readonly Slot[] = ['coiffe', 'cape', 'amulette', 'anneau', 'ceinture', 'bottes'];

/** Stat fixe d'un objet (elle ne change jamais d'une run à l'autre). Tout est additif. */
export interface Stats {
  /** PV max */
  pv?: number;
  /** Armure ajoutée à chaque gain d'armure */
  armure?: number;
  /** Dégâts fixes ajoutés par coup, par élément */
  dom?: Partial<Record<Element, number>>;
  /** Prospection : chance de butin et rareté des objets trouvés */
  prospection?: number;
}

export type ItemRarity = 'commun' | 'rare' | 'mythique' | 'legendaire';
export const ITEM_RARITIES: readonly ItemRarity[] = ['commun', 'rare', 'mythique', 'legendaire'];

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: ItemRarity;
  stats: Stats;
  dofusId?: number;
  icon?: string;
  level?: number;
}
