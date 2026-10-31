# Dofus Slay

Deckbuilder roguelike façon Slay the Spire dans l'univers de Dofus. Fan game non officiel :
données issues de DofusDB (via Dofdle), animations, décors, effets et musiques de Dofus 3 repris de Dofus Survivors,
illustrations des dieux tirées des fichiers de Dofus 3, univers © Ankama.

## Lancer le jeu
```bash
npm install
npm run preview    # construit dans dist/ et sert sur http://localhost:8080
npm test           # tests du moteur, des données, de la run, de la sauvegarde
npm run typecheck
npm run sim        # simulations d'équilibrage (npm run sim 1000 pour plus de runs)
```
Guide de style : ouvrir le jeu avec `#styleguide` à la fin de l'adresse.

## Mise en ligne
Chaque push sur `main` est construit et publié par Cloudflare (Workers Builds, voir `wrangler.jsonc`) :
`npm install`, `npm run build` (dans `dist/`), puis publication de `dist/`. Si le build échoue, la version en ligne
reste la précédente. Rien de construit n'est versionné : `dist/` est ignoré par git.

## Équilibrage
`equilibrage.json`, à la racine, contient toutes les valeurs réglables (classes, passifs, échelle des monstres,
cartes, monstres, dieux). Il se modifie directement sur GitHub ; le jeu en ligne le relit à chaque démarrage.
Mode d'emploi : `docs/EQUILIBRAGE.md`.

## Travailler sur le projet
- **Humains et IA** : lire d'abord `AGENTS.md` (règles, architecture, pièges), puis `docs/FEUILLE_DE_ROUTE.md` (qui fait quoi).
- `docs/DESIGN.md` : règles du jeu et choix de conception. `docs/BALANCE.md` : mesures et repères d'équilibrage.

## Organisation
- `src/core` : moteur sans interface (combat, effets d'objets, offres, carte de l'acte, RNG).
- `src/data` : contenu (cartes, monstres, objets, Dofus, dieux, reliques, événements), fichier d'équilibrage.
- `src/game` : déroulé d'une partie (carte, combats, récompenses, Zaap, dieux, événements, sauvegarde).
- `src/ui` : interface DOM, son, bestiaire. `src/ui/scene` : scène de combat (squelettes de Dofus 3 en WebGL, décors peints).
- `src/sim` : bot et simulations.
- `public/assets` : icônes, polices, illustrations. `public/game` : animations, décors, effets et musiques importés
  par `node tools/import-survivors-assets.mjs <dépôt Dofus Survivors>`.
- `tools` : construction du site, serveur local, export de l'équilibrage, imports de données.
