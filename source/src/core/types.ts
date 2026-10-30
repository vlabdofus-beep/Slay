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
  | { type: 'status'; status: StatusId; amount: number; on: StatusTarget }
  /** Monstre : invoque un allié (5 monstres vivants au plus). */
  | { type: 'summon'; monster: string; count?: number }
  /** Monstre : glisse des cartes de statut dans le deck du joueur. */
  | { type: 'addCard'; card: string; count: number; pile: 'discard' | 'draw' | 'hand' };

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
  /** Carte de statut (glissée par un monstre) : injouable, éphémère (épuisée si encore en main en fin de tour),
   *  dégâts subis si elle est encore en main en fin de tour. */
  unplayable?: boolean;
  ethereal?: boolean;
  endTurnDamage?: number;
  status?: boolean;
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
  /** Mécaniques propres au monstre (voir MonsterPower). */
  powers?: MonsterPower[];
  /** Monstre qui apparaît (×2) quand il se divise. */
  splitInto?: string;
  /** Seconde phase (boss) : sous ce seuil de PV, gagne de la puissance et change de cycle. */
  phase2?: { at: number; puissance: number; pattern: MovePattern; name: string };
}

/**
 * Mécaniques de monstres (repères : Slay the Spire, adaptées et complétées) :
 * - carapace n : gagne n armure à la fin de chacun de ses tours
 * - epines n : renvoie n dégâts à chaque coup qu'il reçoit
 * - colere n : gagne n puissance chaque fois qu'il perd des PV
 * - enroulement n : la première fois qu'il perd des PV, gagne n armure
 * - rituel n : gagne n puissance à la fin de chacun de ses tours (sauf le premier)
 * - spores n : en mourant, applique n vulnérabilité au joueur
 * - explosion t d : explose au bout de t tours, inflige d dégâts et meurt
 * - division : à la moitié de ses PV, se divise en deux (splitInto) qui gardent ses PV restants
 * - voleur n t : vole n kamas par coup porté, s'enfuit avec au bout de t tours (les rend s'il meurt avant)
 * - gardien : subit moitié moins de dégâts tant qu'un autre monstre est en vie
 * - regeneration n : se soigne de n à la fin de ses tours
 * - esquive n : commence le combat avec n esquive
 * - cameleon : résiste à l'élément du dernier coup reçu
 * - rage n : gagne n puissance chaque fois que le joueur joue une compétence
 * - sommeil t a : dort t tours (gagne a armure par tour), se réveille plus tôt s'il perd des PV
 * - plafond n : ne perd jamais plus de n PV par tour
 * - artefact n : annule les n prochains malus qu'on lui applique
 */
export type MonsterPower =
  | { kind: 'carapace'; n: number } | { kind: 'epines'; n: number } | { kind: 'colere'; n: number }
  | { kind: 'enroulement'; n: number } | { kind: 'rituel'; n: number } | { kind: 'spores'; n: number }
  | { kind: 'explosion'; turns: number; dmg: number } | { kind: 'division' } | { kind: 'voleur'; n: number; turns: number }
  | { kind: 'gardien' } | { kind: 'regeneration'; n: number } | { kind: 'esquive'; n: number } | { kind: 'cameleon' }
  | { kind: 'rage'; n: number } | { kind: 'sommeil'; turns: number; block: number } | { kind: 'plafond'; n: number }
  | { kind: 'artefact'; n: number };

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
