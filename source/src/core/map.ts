// Carte d'un acte, façon Slay the Spire : des étages, des chemins qui montent, des nœuds typés.
import { Rng } from './rng.ts';

export type NodeType = 'combat' | 'elite' | 'zaap' | 'marchand' | 'boss';

export interface MapNode {
  id: string;
  floor: number;
  col: number;
  type: NodeType;
  next: string[];
}

export interface ActMap {
  floors: number;
  cols: number;
  nodes: Record<string, MapNode>;
  /** Nœuds du premier étage. */
  starts: string[];
  boss: string;
}

export const MAP_FLOORS = 12; // + l'étage du boss
export const MAP_COLS = 5;
const PATHS = 4;

const nodeId = (floor: number, col: number) => `${floor}:${col}`;

/** Règles d'étage : 1-3 combats (faibles) ; marchands à partir du 4e ; élites et Zaaps à partir du 5e ;
 *  le 12e est un Zaap ; puis le boss. Jamais deux élites, deux Zaaps ou deux marchands d'affilée. */
function pickType(rng: Rng, floor: number, parents: MapNode[]): NodeType {
  if (floor <= 3) return 'combat';
  if (floor === MAP_FLOORS) return 'zaap';
  const banned = new Set<NodeType>();
  if (floor < 5) banned.add('elite').add('zaap');
  if (floor === MAP_FLOORS - 1) banned.add('zaap'); // pas deux Zaaps d'affilée avant le boss
  for (const p of parents) if (p.type === 'elite' || p.type === 'zaap' || p.type === 'marchand') banned.add(p.type);
  const weights: [NodeType, number][] = [['combat', 56], ['elite', 16], ['zaap', 14], ['marchand', 10]];
  const pool = weights.filter(([t]) => !banned.has(t));
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [t, w] of pool) {
    roll -= w;
    if (roll < 0) return t;
  }
  return 'combat';
}

export function generateMap(seed: number): ActMap {
  const rng = new Rng(seed);
  const nodes: Record<string, MapNode> = {};
  const ensure = (floor: number, col: number) => {
    const id = nodeId(floor, col);
    nodes[id] ??= { id, floor, col, type: 'combat', next: [] };
    return nodes[id];
  };

  // Chemins : chaque chemin part d'une colonne et monte en se décalant d'au plus une colonne.
  // Un pas en diagonale est refusé s'il croiserait la diagonale inverse déjà tracée : la carte se lit sans croisement.
  const crosses = (floor: number, from: number, to: number) =>
    from !== to && (nodes[nodeId(floor - 1, to)]?.next.includes(nodeId(floor, from)) ?? false);
  const startCols = rng.shuffle([0, 1, 2, 3, 4]).slice(0, PATHS);
  startCols.push(startCols[0]); // un chemin en double pour créer des embranchements
  for (const start of startCols) {
    let col = start;
    let prev = ensure(1, col);
    for (let floor = 2; floor <= MAP_FLOORS; floor++) {
      const options = rng.shuffle([col - 1, col, col + 1].filter((c) => c >= 0 && c < MAP_COLS));
      col = options.find((c) => !crosses(floor, col, c)) ?? col;
      const node = ensure(floor, col);
      if (!prev.next.includes(node.id)) prev.next.push(node.id);
      prev = node;
    }
  }

  // Boss au sommet, relié à tout le dernier étage.
  const boss: MapNode = { id: 'boss', floor: MAP_FLOORS + 1, col: Math.floor(MAP_COLS / 2), type: 'boss', next: [] };
  nodes.boss = boss;
  for (const n of Object.values(nodes)) if (n.floor === MAP_FLOORS) n.next = ['boss'];

  // Types, étage par étage, en tenant compte des parents.
  const parentsOf = (id: string) => Object.values(nodes).filter((n) => n.next.includes(id));
  for (let floor = 1; floor <= MAP_FLOORS; floor++) {
    for (const n of Object.values(nodes).filter((x) => x.floor === floor).sort((a, b) => a.col - b.col)) {
      n.type = pickType(rng, floor, parentsOf(n.id));
    }
  }
  // Au moins un marchand par acte, au milieu de la carte.
  if (!Object.values(nodes).some((n) => n.type === 'marchand')) {
    const mid = Object.values(nodes).filter((n) => n.floor >= 6 && n.floor <= 9 && n.type === 'combat'
      && !parentsOf(n.id).some((p) => p.type === 'marchand') && !n.next.some((id) => nodes[id].type === 'marchand'));
    if (mid.length) rng.pick(mid).type = 'marchand';
  }
  for (const n of Object.values(nodes)) n.next.sort();

  const starts = Object.values(nodes).filter((n) => n.floor === 1).map((n) => n.id).sort();
  return { floors: MAP_FLOORS + 1, cols: MAP_COLS, nodes, starts, boss: 'boss' };
}
