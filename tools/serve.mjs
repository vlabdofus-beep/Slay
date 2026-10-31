// Petit serveur local pour essayer la version construite : node tools/serve.mjs [dossier] [port]
// (npm run preview construit puis lance ce serveur sur http://localhost:8080). Les salons à plusieurs marchent aussi
// (tools/salon-local.mjs) : ouvre deux onglets pour jouer à deux.
import { createServer } from 'node:http';
import { upgrade } from './salon-local.mjs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ogg': 'audio/ogg' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end('Introuvable');
  }
}).on('upgrade', (req, socket) => { if (!upgrade(req, socket)) socket.destroy(); })
  .listen(port, () => console.log(`La Main des Douze : http://localhost:${port} (dossier ${root})`));
