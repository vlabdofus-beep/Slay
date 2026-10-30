// Construit la version jouable dans un dossier (par défaut ../ : la racine du dépôt Slay).
//   node tools/build-site.mjs [dossier de sortie]
// Les fichiers JS et CSS sont nommés d'après leur contenu (app.<empreinte>.js) : chaque mise à jour
// change leur nom, si bien qu'aucun navigateur ni cache Cloudflare ne peut servir une ancienne version.
// esbuild : celui du projet (installé avec Vite), ou ESBUILD_BIN pour un autre chemin.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, '..'));
const esbuild = process.env.ESBUILD_BIN ?? join(root, 'node_modules', '.bin', 'esbuild');
if (!existsSync(esbuild)) {
  console.error(`esbuild introuvable (${esbuild}). Lance d'abord « npm install », ou définis ESBUILD_BIN.`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

// Anciennes versions
for (const f of readdirSync(out)) {
  if (/^(app|style)(\.[0-9a-f]{10})?\.(js|css)$/.test(f)) rmSync(join(out, f));
}

// JS
const tmp = join(out, '.app.tmp.js');
execFileSync(esbuild, [join(root, 'src/ui/app.ts'), '--bundle', '--minify', '--format=esm', '--target=es2022', `--outfile=${tmp}`, '--log-level=warning'], { stdio: 'inherit' });
const js = readFileSync(tmp, 'utf8');
rmSync(tmp);
const jsName = `app.${hash(js)}.js`;
writeFileSync(join(out, jsName), js);

// CSS : chemins relatifs, pour fonctionner à la racine d'un domaine comme dans un sous-dossier
const css = readFileSync(join(root, 'src/ui/style.css'), 'utf8').replaceAll("url('/assets/", "url('assets/");
const cssName = `style.${hash(css)}.css`;
writeFileSync(join(out, cssName), css);

// Assets, HTML, en-têtes de cache
rmSync(join(out, 'assets'), { recursive: true, force: true });
cpSync(join(root, 'public/assets'), join(out, 'assets'), { recursive: true });
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('/src/ui/style.css', cssName)
  .replace('/src/ui/app.ts', jsName);
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '_headers'), `# index.html n'est jamais gardé en cache : il pointe toujours vers les derniers fichiers.
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`);
console.log(`Version jouable écrite dans ${out} : ${jsName}, ${cssName}`);
