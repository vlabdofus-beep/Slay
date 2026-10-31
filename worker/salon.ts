// Salon de jeu à plusieurs : la logique, sans dépendre de Cloudflare (testée sous Node, voir salon.test.ts).
//
// Le salon ne fait pas tourner le jeu : il tient la liste des joueurs, la graine et le journal des actions. Il donne à
// chaque action son numéro d'ordre et le numéro du joueur qui l'envoie (on ne peut pas jouer pour un autre), puis la
// renvoie à tout le monde. Chaque navigateur rejoue le journal dans cet ordre sur le moteur, qui est déterministe :
// tout le monde voit la même partie. Une action impossible lève la même erreur partout et ne change rien.

export const MAX_PLAYERS = 4;
export const CLASSES = ['iop', 'cra', 'xelor'] as const;
export type Classe = (typeof CLASSES)[number];

export interface Member { id: string; name: string; classe: Classe; gender: 'm' | 'f' }
export interface SalonState { code: string; host: string | null; members: Member[]; seed: number | null; count: number; touched: number; version?: string }

/** Messages du navigateur vers le salon. */
export type ClientMsg =
  | { t: 'join'; name?: string; v?: string }
  | { t: 'pick'; name?: string; classe?: string; gender?: string }
  | { t: 'start' }
  | { t: 'act'; a: (string | number | null)[] }
  | { t: 'leave' };

/** Messages du salon vers les navigateurs. */
export type ServerMsg =
  | { t: 'lobby'; code: string; members: (Omit<Member, 'id'> & { host: boolean; online: boolean })[]; you: number; started: boolean }
  | { t: 'start'; seed: number; members: Omit<Member, 'id'>[]; you: number; log: (string | number | null)[][] }
  | { t: 'act'; n: number; a: (string | number | null)[] }
  | { t: 'err'; msg: string };

/** Ce dont le salon a besoin autour de lui : un stockage clé → valeur, et les connexions ouvertes. */
export interface SalonIO {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  list(prefix: string): Promise<Map<string, unknown>>;
  /** Connexions ouvertes et l'identifiant du joueur de chacune. */
  sockets(): { ws: unknown; id: string }[];
  send(ws: unknown, msg: ServerMsg): void;
}

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const pad = (n: number) => String(n).padStart(7, '0');

export class Salon {
  private io: SalonIO;
  private now: () => number;
  private random: () => number;
  constructor(io: SalonIO, now: () => number, random: () => number) {
    this.io = io; this.now = now; this.random = random;
  }

  private async state(code: string): Promise<SalonState> {
    return (await this.io.get<SalonState>('state')) ?? { code, host: null, members: [], seed: null, count: 0, touched: this.now() };
  }

  private async save(s: SalonState): Promise<void> {
    s.touched = this.now();
    await this.io.put({ state: s });
  }

  /** Un navigateur ouvre la connexion : il demande sa place (`join`), puis envoie ses messages. */
  async message(code: string, id: string, raw: string): Promise<string | null> {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return null; }
    if (msg.t === 'join') return this.join(code, id, String(msg.name ?? ''), String(msg.v ?? ''));
    await this.handle(id, msg);
    return null;
  }

  /** Un navigateur arrive (ou revient). Avant le départ, il prend une place s'il en reste ; après, seuls les joueurs reviennent. */
  async join(code: string, id: string, name: string, version = ''): Promise<string | null> {
    const s = await this.state(code);
    // Tout le monde doit jouer la même version du jeu, sinon les parties divergent.
    if (version && s.version && version !== s.version) return 'Ta version du jeu n\'est pas celle du salon : recharge la page.';
    if (version && !s.version) s.version = version;
    let m = s.members.find((x) => x.id === id);
    if (!m) {
      if (s.seed !== null) return 'La partie a déjà commencé.';
      if (s.members.length >= MAX_PLAYERS) return `Le salon est plein (${MAX_PLAYERS} joueurs).`;
      m = { id, name: clean(name, 20) || `Joueur ${s.members.length + 1}`, classe: CLASSES[s.members.length % CLASSES.length], gender: 'm' };
      s.members.push(m);
      if (!s.host) s.host = id;
    }
    await this.save(s);
    await this.broadcastLobby(s);
    if (s.seed !== null) await this.sendStart(s, id);
    return null;
  }

  private async handle(id: string, msg: ClientMsg): Promise<void> {
    const s = await this.state('');
    const seat = s.members.findIndex((m) => m.id === id);
    if (seat < 0) return;
    if (msg.t === 'pick' && s.seed === null) {
      const m = s.members[seat];
      if (msg.name !== undefined) m.name = clean(msg.name, 20) || m.name;
      if (msg.classe && (CLASSES as readonly string[]).includes(msg.classe)) m.classe = msg.classe as Classe;
      if (msg.gender === 'm' || msg.gender === 'f') m.gender = msg.gender;
      await this.save(s);
      await this.broadcastLobby(s);
    } else if (msg.t === 'start' && s.seed === null) {
      if (id !== s.host) { this.error(id, 'Seul l\'hôte lance la partie.'); return; }
      s.seed = Math.floor(this.random() * 2 ** 31);
      await this.save(s);
      for (const c of this.io.sockets()) await this.sendStart(s, c.id);
    } else if (msg.t === 'act' && s.seed !== null && Array.isArray(msg.a) && typeof msg.a[0] === 'string' && msg.a.length <= 8) {
      const a = [seat, ...msg.a.map((x) => (typeof x === 'number' || typeof x === 'string' ? x : null))] as (string | number | null)[];
      const n = s.count++;
      await this.io.put({ [`a:${pad(n)}`]: a, state: { ...s, touched: this.now() } });
      for (const c of this.io.sockets()) this.io.send(c.ws, { t: 'act', n, a });
    } else if (msg.t === 'leave' && s.seed === null) {
      s.members.splice(seat, 1);
      if (s.host === id) s.host = s.members[0]?.id ?? null;
      await this.save(s);
      await this.broadcastLobby(s);
    }
  }

  /** Une connexion se ferme : le salon prévient les autres (le joueur garde sa place et peut revenir). */
  async closed(): Promise<void> {
    const s = await this.io.get<SalonState>('state');
    if (s) await this.broadcastLobby(s);
  }

  private error(id: string, msg: string): void {
    for (const c of this.io.sockets()) if (c.id === id) this.io.send(c.ws, { t: 'err', msg });
  }

  private async broadcastLobby(s: SalonState): Promise<void> {
    const online = new Set(this.io.sockets().map((c) => c.id));
    const members = s.members.map(({ id, ...m }) => ({ ...m, host: id === s.host, online: online.has(id) }));
    for (const c of this.io.sockets()) {
      this.io.send(c.ws, { t: 'lobby', code: s.code, members, you: s.members.findIndex((m) => m.id === c.id), started: s.seed !== null });
    }
  }

  private async sendStart(s: SalonState, id: string): Promise<void> {
    const entries = await this.io.list('a:');
    const log = [...entries.keys()].sort().map((k) => entries.get(k) as (string | number | null)[]);
    const members = s.members.map(({ id: _id, ...m }) => m);
    for (const c of this.io.sockets()) if (c.id === id) this.io.send(c.ws, { t: 'start', seed: s.seed!, members, you: s.members.findIndex((m) => m.id === id), log });
  }
}
