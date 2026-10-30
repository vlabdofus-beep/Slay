# Dofus Slay

Deckbuilder roguelike façon Slay the Spire dans l'univers de Dofus. Fan game non officiel :
données issues de DofusDB, univers © Ankama.

- **Racine du dépôt** : la version jouable, compilée (`index.html`, `app.js`, `style.css`, `assets/`),
  servie par Cloudflare Workers (`wrangler.jsonc`, site statique).
- **`source/`** : le code source TypeScript (moteur, données, interface, simulations, tests). Non publié.

## Mettre à jour la version jouable
```bash
cd source
npm install
npm test
npx esbuild src/ui/app.ts --bundle --minify --format=esm --target=es2022 --outfile=../app.js
sed "s#url('/assets/#url('assets/#g" src/ui/style.css > ../style.css
cp -r public/assets ..
```
Puis commit et push sur `main` : Cloudflare redéploie automatiquement.
