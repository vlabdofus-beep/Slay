// Salon à plusieurs, sans Cloudflare : stockage en mémoire et fausses connexions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Salon, type ServerMsg } from './salon.ts';
import { Party, type PartyAction } from '../src/game/party.ts';

function harness() {
  const store = new Map<string, unknown>();
  const socks: { ws: { id: string; got: ServerMsg[] }; id: string }[] = [];
  let t = 1000;
  const salon = new Salon({
    get: async (k) => structuredClone(store.get(k)) as never,
    put: async (e) => { for (const [k, v] of Object.entries(e)) store.set(k, structuredClone(v)); },
    list: async (p) => new Map([...store].filter(([k]) => k.startsWith(p))),
    sockets: () => socks,
    send: (ws, msg) => { (ws as { got: ServerMsg[] }).got.push(structuredClone(msg)); },
  }, () => t++, () => 0.5);
  const connect = async (id: string, name = id) => {
    const ws = { id, got: [] as ServerMsg[] };
    socks.push({ ws, id });
    const err = await salon.message('ABCDE', id, JSON.stringify({ t: 'join', name }));
    return { ws, err, send: (m: object) => salon.message('ABCDE', id, JSON.stringify(m)), last: (k: ServerMsg['t']) => [...ws.got].reverse().find((m) => m.t === k) };
  };
  return { salon, connect, socks, store };
}

test('Salon : les joueurs arrivent, le premier est l\'hôte, chacun choisit sa classe', async () => {
  const h = harness();
  const a = await h.connect('a', 'Anna');
  const b = await h.connect('b', 'Bob');
  assert.equal(a.err, null);
  await b.send({ t: 'pick', classe: 'xelor', gender: 'f' });
  const lobby = a.last('lobby') as Extract<ServerMsg, { t: 'lobby' }>;
  assert.equal(lobby.code, 'ABCDE');
  assert.deepEqual(lobby.members.map((m) => [m.name, m.classe, m.gender, m.host]), [['Anna', 'iop', 'm', true], ['Bob', 'xelor', 'f', false]]);
  assert.equal((b.last('lobby') as Extract<ServerMsg, { t: 'lobby' }>).you, 1);
});

test('Salon : 4 joueurs au plus ; seul l\'hôte lance ; personne n\'entre après le départ', async () => {
  const h = harness();
  const ps = [];
  for (const id of ['a', 'b', 'c', 'd']) ps.push(await h.connect(id));
  const e = await h.connect('e');
  assert.match(e.err ?? '', /plein/);
  await ps[1].send({ t: 'start' });
  assert.equal(ps[1].last('start'), undefined);
  assert.match((ps[1].last('err') as { msg: string }).msg, /hôte/);
  await ps[0].send({ t: 'start' });
  const st = ps[2].last('start') as Extract<ServerMsg, { t: 'start' }>;
  assert.equal(st.members.length, 4);
  assert.equal(st.you, 2);
  const late = await h.connect('z');
  assert.match(late.err ?? '', /commencé/);
});

test('Salon : chaque action reçoit son numéro et la place de son auteur ; un retour reçoit tout le journal', async () => {
  const h = harness();
  const a = await h.connect('a');
  const b = await h.connect('b');
  await a.send({ t: 'start' });
  const st = a.last('start') as Extract<ServerMsg, { t: 'start' }>;
  const p = new Party(st.members.map((m) => ({ name: m.name, classe: m.classe, gender: m.gender })), st.seed);
  // Chacun visite son sanctuaire (les actions passent par le salon)
  for (const [who, i] of [[a, 0], [b, 1]] as const) {
    await who.send({ t: 'act', a: ['enterNode', 'dieu'] });
    await who.send({ t: 'act', a: ['takeBoon', p.runs[i].god!.offer[0]] });
  }
  const acts = a.ws.got.filter((m) => m.t === 'act') as Extract<ServerMsg, { t: 'act' }>[];
  assert.deepEqual(acts.map((m) => m.n), [0, 1, 2, 3]);
  assert.deepEqual(acts.map((m) => m.a[0]), [0, 0, 1, 1]);
  for (const m of acts) p.apply(m.a as PartyAction);
  assert.ok(p.voteOptions().length > 0);
  // Bob se reconnecte : il retrouve sa place et le journal entier
  h.socks.splice(1, 1);
  const b2 = await h.connect('b');
  const again = b2.last('start') as Extract<ServerMsg, { t: 'start' }>;
  assert.equal(again.you, 1);
  assert.deepEqual(again.log, acts.map((m) => m.a));
});

test('Salon : un message mal formé ou une action avant le départ ne change rien', async () => {
  const h = harness();
  const a = await h.connect('a');
  await h.salon.message('ABCDE', 'a', '{pas du json');
  await a.send({ t: 'act', a: ['vote', 'x'] });
  assert.equal(a.ws.got.filter((m) => m.t === 'act').length, 0);
});

test('Salon : un navigateur sur une autre version du jeu est refusé', async () => {
  const h = harness();
  const a = await h.salon.message('ABCDE', 'a', JSON.stringify({ t: 'join', name: 'A', v: 'app.111.js' }));
  const b = await h.salon.message('ABCDE', 'b', JSON.stringify({ t: 'join', name: 'B', v: 'app.222.js' }));
  assert.equal(a, null);
  assert.match(b ?? '', /version/);
});
