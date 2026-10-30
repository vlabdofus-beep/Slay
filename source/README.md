# Dofus Slay

Deckbuilder roguelike façon Slay the Spire dans l'univers de Dofus. Fan game non officiel :
données issues de DofusDB (via Dofdle), animations, décors et effets de Dofus 3 repris de Dofus Survivors, univers © Ankama.

## Lancer le jeu
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # version de production dans dist/ (Vite)
npm run site       # version jouable à la racine du dépôt Slay (fichiers à empreinte, sans cache périmé)
```

## Développement
```bash
npm test           # tests du moteur, des items et de la run
npm run sim        # simulations d'équilibrage (npm run sim 1000 pour plus de runs)
npm run typecheck
# Guide de style : ouvrir le jeu avec #styleguide à la fin de l'adresse
node tools/build-dofus-data.mjs ../dofdle/data   # régénère src/data/dofus.json
python3 tools/spire_benchmarks.py reference/     # repères StS2 (exports Spire Codex dans reference/)
```

## Combat
Le personnage (Iop ou Crâ, homme ou femme au choix sur l'écran titre) se tient à gauche, les monstres à droite,
sur un décor d'Amakna propre à chaque rencontre. On joue une carte en la glissant sur un monstre (flèche de visée)
ou, pour une carte sans cible, en la lâchant au-dessus de la main ; le clic et les touches 1 à 9 restent possibles.
Le personnage lance l'animation du sort ; l'effet s'applique à l'impact.

## Organisation
- `src/core` : moteur sans interface (combat, items, offres, carte de l'acte, RNG).
- `src/data` : contenu (cartes, monstres, items) relié aux données Dofus de `dofus.json`.
- `src/game` : déroulé d'une partie (carte, combats, récompenses, Zaap).
- `src/ui` : interface DOM.
- `src/ui/scene` : scène de combat sur canevas. `rt.js` cuit les squelettes de Dofus 3 en planches d'animation (WebGL),
  `stage.ts` peint le lieu de la rencontre, le personnage et les effets de sorts.
- `public/game` : animations, lieux et effets importés par `node tools/import-survivors-assets.mjs <dépôt Survivors>`.
- `src/sim` : bot et simulations.
- `docs/DESIGN.md` : règles du jeu. `docs/BALANCE.md` : repères et résultats d'équilibrage.

Les animations, lieux et effets (`public/game`) ne sont pas recopiés ici : ils sont publiés à la racine du dépôt, dans `game/`. Pour les régénérer : `node tools/import-survivors-assets.mjs <dépôt Survivors>`.
