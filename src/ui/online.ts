// Partie en ligne, côté navigateur : la connexion au salon (worker/salon.ts) et la partie rejouée (src/game/party.ts).
//
// Le navigateur n'applique jamais un geste tout seul. Un geste du joueur part au salon ; le salon le numérote et le
// renvoie à tous ; chacun l'applique alors, dans l'ordre des numéros. Pour que l'interface n'ait presque rien à savoir,
// les méthodes de la run du joueur (et de ses combats) sont remplacées : appelées par l'interface, elles envoient le
// geste ; appelées pendant l'application du journal, elles font le vrai travail.
import type { Combat } from '../core/combat.ts';
import type { ClassId } from '../core/types.ts';
import { Party, type Member, type PartyAction } from '../game/party.ts';
import type { Run } from '../game/run.ts';

export interface LobbyMember { name: string; classe: ClassId; gender: 'm' | 'f'; host: boolean; online: boolean }
export interface Lobby { code: string; members: LobbyMember[]; you: number; started: boolean }

type ServerMsg =
  | ({ t: 'lobby' } & Lobby)
  | { t: 'start'; seed: number; members: Member[]; you: number; log: PartyAction[] }
  | { t: 'act'; n: number; a: PartyAction }
  | { t: 'err'; msg: string };

/** Gestes de la run qui passent par le salon (le reste de l'interface lit seulement). */
const RUN_ACTIONS = [
  'enterNode', 'checkCombatEnd', 'takeCard', 'takeItem', 'leaveReward', 'takeDofus',
  'buyCard', 'buyItem', 'removeCard', 'leaveShop', 'zaapRest', 'zaapUpgrade', 'leaveZaap',
  'takeBoon', 'leaveGod', 'chooseOption', 'leaveEvent', 'resolvePick', 'chooseCard', 'chooseItem', 'skipPending',
];
type Fn = (...a: unknown[]) => unknown;

/** Version du jeu : le nom du fichier construit (app.<empreinte>.js) change à chaque mise à jour. */
const BUILD = (() => { try { return new URL(import.meta.url).pathname.split('/').pop() ?? ''; } catch { return ''; } })();

/** Code de salon : 5 lettres et chiffres sans confusion possible (pas de O, 0, I, 1). */
export function newCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

/** Identifiant du navigateur : il permet de revenir dans son salon après une coupure. */
export function clientId(): string {
  try {
    let id = localStorage.getItem('slay.id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('slay.id', id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export class Online {
  readonly code: string;
  name: string;
  lobby: Lobby | null = null;
  party: Party | null = null;
  me = -1;
  error = '';
  status: 'connexion' | 'salon' | 'partie' | 'coupé' | 'fermé' = 'connexion';
  /** Prochain numéro d'action attendu. */
  private next = 0;
  private ws: WebSocket | null = null;
  private applying = false;
  private closedByUs = false;
  private retry = 0;
  private hooked = new WeakSet<object>();
  /**
   * `onChange` : redessiner. `onAction` : une action du journal va s'appliquer ; la fonction reçue l'applique
   * (l'interface s'en sert pour animer le combat autour).
   */
  private onChange: () => void;
  private onAction: (a: PartyAction, apply: () => void) => void;
  constructor(code: string, name: string, onChange: () => void, onAction: (a: PartyAction, apply: () => void) => void) {
    this.onChange = onChange;
    this.onAction = onAction;
    this.code = code.toUpperCase();
    this.name = name;
    this.connect();
  }

  /** Run de ce joueur (null avant le départ). */
  get run(): Run | null { return this.party && this.me >= 0 ? this.party.runs[this.me] : null; }

  private connect(): void {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/salon/${this.code}?id=${encodeURIComponent(clientId())}`;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { this.fail('Connexion impossible au salon.'); return; }
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.send({ t: 'join', name: this.name, v: BUILD }); };
    ws.onmessage = (ev) => { try { this.receive(JSON.parse(String(ev.data)) as ServerMsg); } catch (e) { console.error(e); } };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUs || this.status === 'fermé') return;
      this.status = 'coupé';
      this.onChange();
      // Reconnexion : le salon renverra tout le journal, on n'applique que ce qui manque.
      const wait = Math.min(8000, 800 * 2 ** this.retry++);
      setTimeout(() => { if (!this.closedByUs) this.connect(); }, wait);
    };
  }

  private fail(msg: string): void {
    this.error = msg;
    this.status = 'fermé';
    this.onChange();
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Choix dans le salon avant le départ. */
  pick(classe: ClassId, gender: 'm' | 'f'): void { this.send({ t: 'pick', classe, gender, name: this.name }); }
  start(): void { this.send({ t: 'start' }); }

  /** Quitte le salon (avant le départ, la place se libère ; après, on peut revenir avec le même code). */
  leave(): void {
    if (this.status === 'salon') this.send({ t: 'leave' });
    this.closedByUs = true;
    this.status = 'fermé';
    this.ws?.close();
  }

  /** Envoie un geste du joueur au salon. */
  act(name: string, ...args: (string | number | null | undefined)[]): void {
    while (args.length && args[args.length - 1] === undefined) args.pop();
    this.send({ t: 'act', a: [name, ...args.map((x) => (x === undefined ? null : x))] });
  }

  private receive(msg: ServerMsg): void {
    if (msg.t === 'err') {
      this.error = msg.msg;
      if (!this.party && this.status !== 'salon') { this.closedByUs = true; this.status = 'fermé'; }
      this.onChange();
      return;
    }
    if (msg.t === 'lobby') {
      this.lobby = msg;
      if (!this.party) this.status = 'salon';
      this.onChange();
      return;
    }
    if (msg.t === 'start') {
      if (!this.party) {
        this.party = new Party(msg.members, msg.seed);
        this.me = msg.you;
        this.next = 0;
      }
      this.status = 'partie';
      // Au départ ou au retour : on rattrape tout ce qui manque, sans animation.
      for (let n = this.next; n < msg.log.length; n++) this.applyNow(msg.log[n]);
      this.next = Math.max(this.next, msg.log.length);
      this.hook();
      this.onChange();
      return;
    }
    if (msg.t === 'act') {
      if (!this.party || msg.n < this.next) return;
      if (msg.n > this.next) { this.ws?.close(); return; } // trou dans le journal : on se reconnecte pour tout reprendre
      this.next++;
      this.onAction(msg.a, () => this.applyNow(msg.a));
    }
  }

  private applyNow(a: PartyAction): void {
    const p = this.party!;
    this.applying = true;
    try { p.apply(a); } catch { /* geste impossible : ignoré partout de la même façon */ } finally { this.applying = false; }
    this.hook();
    // L'interface agit toujours pour le héros de ce joueur
    const c = this.run?.combat;
    if (c) c.useSeat(this.run!.seat);
  }

  /** Remplace les gestes de la run du joueur (et de son combat) par des envois au salon. */
  private hook(): void {
    const run = this.run;
    if (!run) return;
    if (!this.hooked.has(run)) {
      this.hooked.add(run);
      const r = run as unknown as Record<string, Fn>;
      for (const name of RUN_ACTIONS) {
        const orig = r[name].bind(run);
        r[name] = (...args: unknown[]) => {
          if (this.applying) return orig(...args);
          // La fin d'un combat se règle à l'application du dernier geste ; une case de la carte se vote.
          if (name === 'checkCombatEnd') return undefined;
          if (name === 'enterNode' && args[0] !== 'dieu') return this.act('vote', args[0] as string);
          // Les réponses d'un événement se votent aussi
          if (name === 'chooseOption') return this.act('eventVote', args[0] as number);
          return this.act(name, ...(args as (string | number | undefined)[]));
        };
      }
    }
    const c = run.combat as (Combat & Record<string, unknown>) | null;
    if (c && !this.hooked.has(c)) {
      this.hooked.add(c);
      const play = c.playCard.bind(c), end = c.endTurn.bind(c);
      c.playCard = (i: number, target?: number) => (this.applying ? play(i, target) : this.act('c.playCard', i, target));
      c.endTurn = () => (this.applying ? end() : this.act('c.endTurn'));
    }
  }
}
