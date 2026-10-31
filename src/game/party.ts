// Partie à plusieurs (jusqu'à 4 joueurs) : une run par joueur, une carte et des combats communs.
//
// Chaque joueur garde sa run (src/game/run.ts) : deck, objets, kamas, PV, récompenses, marchand, Zaap, dieu,
// événements. La table partage la carte (même graine, donc mêmes cases, mêmes rencontres, mêmes dieux), choisit la
// prochaine case au vote, et joue ses combats ensemble (src/core/combat.ts, un héros par joueur).
//
// Tout passe par `apply(action)` : une action est [joueur, nom, ...arguments]. Rejouer les mêmes actions depuis la
// même graine reconstruit la même partie. C'est ce que fait chaque navigateur avec le journal du salon en ligne :
// le serveur ordonne les actions, chacun les rejoue. Une action impossible lève une erreur partout de la même façon,
// donc elle est ignorée partout.
import { Combat } from '../core/combat.ts';
import { Rng } from '../core/rng.ts';
import type { ClassId } from '../core/types.ts';
import { LIBRARY } from '../data/library.ts';
import { ENCOUNTERS, TIER_SCALE, scaleForParty } from '../data/monsters.ts';
import { Run } from './run.ts';

export const MAX_PLAYERS = 4;

export interface Member { name: string; classe: ClassId; gender: 'm' | 'f' }

/** Une action de la partie : [joueur, nom, ...arguments]. « c.playCard » et « c.endTurn » visent le combat du joueur. */
export type PartyAction = [number, string, ...(string | number | null)[]];

/** Gestes personnels qu'un joueur fait dans sa propre run (récompenses, marchand, Zaap, dieu, événement…). */
const RUN_ACTIONS = new Set([
  'takeCard', 'takeItem', 'leaveReward', 'takeDofus',
  'buyCard', 'buyItem', 'removeCard', 'leaveShop', 'zaapRest', 'zaapUpgrade', 'leaveZaap',
  'takeBoon', 'leaveGod', 'chooseOption', 'leaveEvent', 'resolvePick', 'chooseCard', 'chooseItem', 'skipPending',
]);

export class Party {
  readonly seed: number;
  readonly members: Member[];
  readonly runs: Run[];
  /** Tirages communs : graine des combats, départage des votes. */
  readonly rng: Rng;
  /** Vote de chaque joueur pour la prochaine case (null : pas encore voté). */
  votes: (string | null)[];
  /** Combat commun en cours (null hors combat). */
  combat: Combat | null = null;

  constructor(members: Member[], seed: number) {
    if (members.length < 1 || members.length > MAX_PLAYERS) throw new Error(`De 1 à ${MAX_PLAYERS} joueurs`);
    this.seed = seed;
    this.members = members.map((m) => ({ ...m }));
    this.rng = new Rng((seed ^ 0x6a09e667) >>> 0);
    this.runs = members.map((m, i) => new Run(m.classe, seed, m.gender, { party: true, rngSeed: (seed + 0x9e3779b9 * (i + 1)) >>> 0 }));
    this.votes = members.map(() => null);
  }

  get size(): number { return this.runs.length; }

  // ───────────── lecture ─────────────

  /** La partie est finie : victoire (boss de l'acte 3 battu) ou défaite (toute la table tombée). */
  get over(): 'victory' | 'defeat' | null {
    if (this.runs.some((r) => r.phase === 'victory')) return 'victory';
    if (this.runs.some((r) => r.phase === 'defeat')) return 'defeat';
    return null;
  }

  /** Le joueur est de retour sur la carte, sans choix en attente, et son sanctuaire du dieu est fait. */
  onMap(i: number): boolean {
    const r = this.runs[i];
    return r.phase === 'map' && !r.pending && r.availableNodes()[0] !== 'dieu';
  }

  /** Cases sur lesquelles la table peut voter maintenant ([] tant qu'un joueur n'est pas revenu sur la carte). */
  voteOptions(): string[] {
    if (this.over || !this.runs.every((_, i) => this.onMap(i))) return [];
    return this.runs[0].availableNodes();
  }

  /** Voix de chaque case. */
  tally(): Record<string, number> {
    const t: Record<string, number> = {};
    for (const v of this.votes) if (v) t[v] = (t[v] ?? 0) + 1;
    return t;
  }

  /** Combat où joue ce joueur : le combat commun, ou un combat d'événement qu'il joue seul. */
  combatOf(i: number): Combat | null {
    return this.runs[i].combat;
  }

  // ───────────── actions ─────────────

  /** Applique une action du journal. Lève une erreur si elle est impossible (elle est alors ignorée partout). */
  apply([player, name, ...raw]: PartyAction): void {
    const run = this.runs[player];
    if (!run) throw new Error(`Pas de joueur ${player}`);
    const args = raw.map((x) => (x === null ? undefined : x));
    if (name === 'vote') return this.vote(player, String(args[0]));
    if (name === 'enterNode') {
      // Seul le sanctuaire du dieu se visite seul ; les cases de la carte se votent.
      if (args[0] !== 'dieu') throw new Error('Les cases se choisissent au vote');
      run.enterNode('dieu');
      return;
    }
    if (name === 'c.playCard' || name === 'c.endTurn') {
      const c = run.combat;
      if (!c || run.phase !== 'combat') throw new Error('Pas de combat');
      c.useSeat(run.seat);
      if (name === 'c.playCard') c.playCard(Number(args[0]), args[1] === undefined ? undefined : Number(args[1]));
      else c.endTurn();
      this.afterCombat(c);
      return;
    }
    if (!RUN_ACTIONS.has(name)) throw new Error(`Action inconnue : ${name}`);
    (run as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
    // Un événement peut lancer un combat : le joueur le joue seul, puis sa run passe à la suite.
    if (run.phase === 'combat' && run.combat && run.combat !== this.combat) run.checkCombatEnd();
  }

  /** Vote pour une case. La case est choisie dès qu'elle a la majorité ; sinon quand tout le monde a voté (égalité : tirage). */
  vote(player: number, node: string): void {
    const options = this.voteOptions();
    if (!options.includes(node)) throw new Error(`Case ${node} impossible maintenant`);
    this.votes[player] = node;
    const t = this.tally();
    const best = Math.max(...Object.values(t));
    const leaders = Object.keys(t).filter((k) => t[k] === best).sort();
    if (best * 2 > this.size) return this.go(leaders[0]);
    if (this.votes.every((v) => v !== null)) this.go(leaders.length === 1 ? leaders[0] : this.rng.pick(leaders));
  }

  /** La table entre sur la case : un combat commun, ou chacun de son côté (Zaap, marchand, événement). */
  private go(node: string): void {
    this.votes = this.votes.map(() => null);
    const n = this.runs[0].map.nodes[node];
    if (n.type === 'zaap' || n.type === 'marchand' || n.type === 'evenement') {
      for (const r of this.runs) r.enterNode(node);
      return;
    }
    for (const r of this.runs) r.joinFight(node);
    const first = this.runs[0];
    const enc = ENCOUNTERS[first.encounter!];
    const members = this.runs.map((r) => r.combatMember());
    const scale = scaleForParty(TIER_SCALE[first.act][enc.tier], this.size);
    const c = new Combat(LIBRARY, members[0].deck, members[0].init, enc.monsters, this.rng.int(2 ** 31), scale, members.slice(1));
    this.combat = c;
    this.runs.forEach((r, i) => { r.combat = c; r.seat = i; });
    this.afterCombat(c);
  }

  /** Après chaque geste de combat : à la fin du combat commun, chaque run passe à sa récompense (ou à la défaite). */
  private afterCombat(c: Combat): void {
    if (c.outcome === 'ongoing') return;
    if (c === this.combat) {
      this.combat = null;
      for (const r of this.runs) r.checkCombatEnd();
    } else {
      for (const r of this.runs) if (r.combat === c) r.checkCombatEnd();
    }
  }
}
