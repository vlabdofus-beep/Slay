# Dofus Slay

Deckbuilder roguelike façon Slay the Spire dans l'univers de Dofus. Fan game non officiel :
données issues de DofusDB (via Dofdle), univers © Ankama.

## Lancer le jeu
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # version de production dans dist/
```

## Développement
```bash
npm test           # tests du moteur, des items et de la run
npm run sim        # simulations d'équilibrage (npm run sim 1000 pour plus de runs)
npm run typecheck
node tools/build-dofus-data.mjs ../dofdle/data   # régénère src/data/dofus.json
python3 tools/spire_benchmarks.py reference/     # repères StS2 (exports Spire Codex dans reference/)
```

## Organisation
- `src/core` : moteur sans interface (combat, items, offres, carte de l'acte, RNG).
- `src/data` : contenu (cartes, monstres, items) relié aux données Dofus de `dofus.json`.
- `src/game` : déroulé d'une partie (carte, combats, récompenses, Zaap).
- `src/ui` : interface DOM.
- `src/sim` : bot et simulations.
- `docs/DESIGN.md` : règles du jeu. `docs/BALANCE.md` : repères et résultats d'équilibrage.
