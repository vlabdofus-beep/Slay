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
npm run site      # recompile à la racine du dépôt : app.<empreinte>.js, style.<empreinte>.css, assets/, _headers
```
Puis commit et push sur `main` : Cloudflare redéploie automatiquement. Les noms de fichiers changent à chaque
version, et `index.html` n'est jamais mis en cache : pas de mélange entre ancienne et nouvelle version.

Guide de style : ajouter `#styleguide` à l'adresse du jeu.
