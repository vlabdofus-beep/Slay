// Sauvegarde automatique d'une run : la graine et la suite des actions du joueur.
//
// Tout le jeu est déterministe (cartes, combats, butin, événements : un seul générateur pseudo-aléatoire par run),
// donc rejouer les mêmes actions depuis la même graine reconstruit exactement le même état, combat en cours compris.
// La sauvegarde est petite (quelques dizaines de Ko pour une run complète) et ne dépend pas de la forme interne
// des objets : on peut changer le code de l'état sans casser les sauvegardes, tant que les règles ne changent pas.
import type { ClassId } from '../core/types.ts';
import { Run } from './run.ts';

/** Une action : nom de la méthode (préfixe « c. » pour le combat) et ses arguments. */
export type Action = [string, ...(string | number | null)[]];

export interface SaveFile {
  v: 1;
  classe: ClassId;
  seed: number;
  gender: 'm' | 'f';
  actions: Action[];
  /** Résumé lisible sans rejouer (écran d'accueil), et contrôle après rejeu. */
  meta: { act: number; floor: number; hp: number; maxHp: number; kamas: number; phase: string; deck: number; at: number };
}

/** Méthodes de la run qui changent l'état, appelées par l'interface. */
const RUN_ACTIONS = [
  'enterNode', 'checkCombatEnd', 'takeCard', 'takeItem', 'leaveReward', 'takeDofus',
  'buyCard', 'buyItem', 'removeCard', 'leaveShop', 'zaapRest', 'zaapUpgrade', 'leaveZaap',
  'takeBoon', 'leaveGod', 'chooseOption', 'leaveEvent', 'resolvePick', 'chooseCard', 'chooseItem', 'skipPending',
] as const;
const COMBAT_ACTIONS = ['playCard', 'endTurn'] as const;

type Fn = (...a: unknown[]) => unknown;

export function metaOf(run: Run): SaveFile['meta'] {
  return { act: run.act, floor: run.stats.floor, hp: run.hp, maxHp: run.maxHp, kamas: run.kamas, phase: run.phase, deck: run.deck.length, at: Date.now() };
}

/**
 * Branche l'enregistrement sur une run : chaque action réussie (qui n'a pas levé d'erreur) est ajoutée au journal,
 * puis `onChange` reçoit la sauvegarde à écrire. Les appels internes (une méthode qui en appelle une autre) ne
 * comptent qu'une fois. Un combat créé par une action est branché à son tour.
 */
export function record(run: Run, onChange: (s: SaveFile) => void, actions: Action[] = []): void {
  let depth = 0;
  let combat: unknown = null;
  const save = (): SaveFile => ({ v: 1, classe: run.classe, seed: run.seed, gender: run.gender, actions, meta: metaOf(run) });
  const wrap = (obj: Record<string, unknown>, name: string, prefix: string) => {
    const orig = (obj[name] as Fn).bind(obj);
    obj[name] = (...args: unknown[]) => {
      const phase = run.phase;
      depth++;
      try {
        const out = orig(...args);
        // checkCombatEnd est appelé après chaque geste : on ne le note que s'il a fait quelque chose.
        if (depth === 1 && !(name === 'checkCombatEnd' && run.phase === phase)) {
          while (args.length && args[args.length - 1] === undefined) args.pop();
          actions.push([prefix + name, ...(args as (string | number | null)[]).map((a) => (a === undefined ? null : a))]);
          hookCombat();
          onChange(save());
        }
        return out;
      } finally { depth--; }
    };
  };
  const hookCombat = () => {
    if (!run.combat || run.combat === combat) return;
    combat = run.combat;
    for (const n of COMBAT_ACTIONS) wrap(run.combat as unknown as Record<string, unknown>, n, 'c.');
  };
  for (const n of RUN_ACTIONS) wrap(run as unknown as Record<string, unknown>, n, '');
  hookCombat();
}

/** Rejoue une sauvegarde. Renvoie null si elle ne se rejoue pas (règles changées depuis, fichier abîmé). */
export function replay(s: SaveFile): { run: Run; drift: boolean } | null {
  if (!s || s.v !== 1 || !Array.isArray(s.actions)) return null;
  try {
    const run = new Run(s.classe, s.seed, s.gender);
    for (const [name, ...args] of s.actions) {
      const a = args.map((x) => (x === null ? undefined : x));
      // Sauvegardes d'avant le sanctuaire : le dieu s'ouvrait seul au début de l'acte.
      if ((name === 'takeBoon' || name === 'leaveGod') && run.phase === 'map' && run.availableNodes()[0] === 'dieu') run.enterNode('dieu');
      if (name.startsWith('c.')) {
        const c = run.combat as unknown as Record<string, Fn> | null;
        if (!c) throw new Error(`Pas de combat pour ${name}`);
        c[name.slice(2)](...a);
      } else (run as unknown as Record<string, Fn>)[name](...a);
    }
    const m = metaOf(run), w = s.meta;
    const drift = !w || m.act !== w.act || m.floor !== w.floor || m.hp !== w.hp || m.kamas !== w.kamas || m.phase !== w.phase || m.deck !== w.deck;
    return { run, drift };
  } catch {
    return null;
  }
}
