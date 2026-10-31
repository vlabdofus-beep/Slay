// Salons à plusieurs en local : la même logique que le Durable Object (worker/salon.ts), en mémoire, derrière un petit
// serveur WebSocket écrit à la main (Node n'en a pas). Utilisé par tools/serve.mjs, donc par `npm run preview`.
import { createHash } from 'node:crypto';
import { Salon } from '../worker/salon.ts';

const rooms = new Map();

function room(code) {
  let r = rooms.get(code);
  if (r) return r;
  const store = new Map();
  const socks = new Set();
  const salon = new Salon({
    get: async (k) => structuredClone(store.get(k)),
    put: async (e) => { for (const [k, v] of Object.entries(e)) store.set(k, structuredClone(v)); },
    list: async (p) => new Map([...store].filter(([k]) => k.startsWith(p))),
    sockets: () => [...socks].map((s) => ({ ws: s, id: s.id })),
    send: (s, msg) => s.send(JSON.stringify(msg)),
  }, () => Date.now(), Math.random);
  r = { salon, socks, queue: Promise.resolve() };
  rooms.set(code, r);
  return r;
}

/** Trame WebSocket texte (serveur → navigateur, sans masque). */
function frame(text, op = 0x1) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => {
    const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b;
  })();
  return Buffer.concat([head, data]);
}

/** Branche une demande de mise à niveau WebSocket sur /salon/<CODE>. Renvoie false si ce n'est pas un salon. */
export function upgrade(req, socket) {
  const url = new URL(req.url, 'http://local');
  const m = url.pathname.match(/^\/salon\/([A-Z0-9]{4,8})$/i);
  if (!m || !req.headers['sec-websocket-key']) return false;
  const code = m[1].toUpperCase();
  const id = (url.searchParams.get('id') ?? '').slice(0, 64);
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const r = room(code);
  const s = { id, send: (t) => { if (!socket.destroyed) socket.write(frame(t)); } };
  r.socks.add(s);
  // Les messages d'un salon passent un par un, comme dans un Durable Object.
  const run = (fn) => { r.queue = r.queue.then(fn).catch((e) => console.error(e)); };
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 0x0f;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 0x80;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const data = Buffer.from(buf.subarray(off, off + len));
      buf = buf.subarray(off + len);
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      if (op === 0x8) { socket.end(frame('', 0x8)); return; }
      if (op === 0x9) { socket.write(frame(data.toString(), 0xA)); continue; }
      if (op !== 0x1) continue;
      const text = data.toString();
      run(async () => {
        const refused = await r.salon.message(code, id, text);
        if (refused) { s.send(JSON.stringify({ t: 'err', msg: refused })); socket.end(frame('', 0x8)); }
      });
    }
  });
  const gone = () => { if (r.socks.delete(s)) run(() => r.salon.closed()); };
  socket.on('close', gone);
  socket.on('error', gone);
  return true;
}
