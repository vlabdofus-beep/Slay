// Worker Cloudflare de Dofus Slay : sert le jeu (fichiers de dist/) et les salons à plusieurs.
//   /salon/<CODE>?id=<identifiant du navigateur>  →  WebSocket vers le Durable Object du salon.
// Tout le reste est servi par les fichiers statiques.
// Un salon est un Durable Object : un seul exemplaire par code dans le monde, qui garde la liste des joueurs, la graine
// et le journal des actions (voir salon.ts). Il s'endort quand personne ne parle (API WebSocket Hibernation) et
// s'efface après une journée sans activité.
import { DurableObject } from 'cloudflare:workers';
import { Salon, type SalonState, type ServerMsg } from './salon.ts';

interface Env {
  SALONS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const DAY = 24 * 3600 * 1000;
const CODE = /^\/salon\/([A-Z0-9]{4,8})$/i;

interface Attachment { id: string; code: string }

export class SalonDO extends DurableObject<Env> {
  private salon: Salon;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const storage = ctx.storage;
    this.salon = new Salon({
      get: (key) => storage.get(key),
      put: (entries) => storage.put(entries),
      list: (prefix) => storage.list({ prefix }),
      sockets: () => ctx.getWebSockets().map((ws) => ({ ws, id: (ws.deserializeAttachment() as Attachment).id })),
      send: (ws, msg: ServerMsg) => { try { (ws as WebSocket).send(JSON.stringify(msg)); } catch { /* connexion fermée */ } },
    }, () => Date.now(), Math.random);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    const url = new URL(request.url);
    const code = (url.pathname.match(CODE)?.[1] ?? '').toUpperCase();
    const id = (url.searchParams.get('id') ?? '').slice(0, 64);
    if (!code || !id) return new Response('Salon ou joueur manquant', { status: 400 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, code } satisfies Attachment);
    await this.ctx.storage.setAlarm(Date.now() + DAY);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 4000) return;
    const { id, code } = ws.deserializeAttachment() as Attachment;
    const refused = await this.salon.message(code, id, message);
    if (refused) {
      ws.send(JSON.stringify({ t: 'err', msg: refused } satisfies ServerMsg));
      ws.close(4000, 'refus');
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try { ws.close(code, reason); } catch { /* déjà fermée */ }
    await this.salon.closed();
  }

  /** Une journée sans activité : le salon s'efface. */
  async alarm(): Promise<void> {
    const s = await this.ctx.storage.get<SalonState>('state');
    if (s && Date.now() - s.touched < DAY) { await this.ctx.storage.setAlarm(s.touched + DAY); return; }
    for (const ws of this.ctx.getWebSockets()) try { ws.close(4001, 'salon fermé'); } catch { /* déjà fermée */ }
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const m = new URL(request.url).pathname.match(CODE);
    if (m) return env.SALONS.get(env.SALONS.idFromName(m[1].toUpperCase())).fetch(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
