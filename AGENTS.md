# Instructions pour les IA (et les humains) qui travaillent sur Dofus Slay

Plusieurs IA travaillent sur ce dépôt, chacune de son côté. Ce fichier est le point d'entrée commun : lis-le en entier
avant de toucher au code, puis lis `docs/FEUILLE_DE_ROUTE.md` pour savoir ce qui est en cours et par qui.

## Le projet en bref
Deckbuilder roguelike façon Slay the Spire dans l'univers de Dofus, en français, jouable dans le navigateur.
TypeScript sans framework, construit avec esbuild, publié par Cloudflare à chaque push sur `main`.
Règles du jeu et historique des décisions : `docs/DESIGN.md`. Mesures d'équilibrage : `docs/BALANCE.md`.

## Commandes
```bash
npm install
npm test            # obligatoire avant chaque push : tout doit passer
npm run typecheck   # obligatoire aussi
npm run preview     # construit dans dist/ et sert sur http://localhost:8080
npm run sim         # bot : parties complètes, pour mesurer la difficulté
npm run balance:export   # ajoute à equilibrage.json les cartes, monstres, bénédictions nouveaux (sans écraser)
```
Node 22.18 ou plus (les fichiers .ts s'exécutent directement, sans compilation).

## Façon de travailler
1. **Jamais de push direct sur `main`.** Travaille sur une branche à ton nom et au nom de la tâche
   (`ia-<nom>/<tâche>`, par exemple `ia-gpt/illustrations-cartes`), puis ouvre une demande de fusion (pull request)
   avec un résumé en français de ce qui change et de comment c'est vérifié.
2. **Fusionne toi-même ta demande quand les tests passent** (coche verte « tests » de GitHub, décision du propriétaire
   du 31/10/2026), puis préviens le propriétaire en une ou deux phrases : ce qui est en ligne et le lien de la demande.
   Ne fusionne pas si un test échoue, s'il reste un conflit, ou si la demande touche le travail d'une autre IA en cours :
   dans ce cas, laisse-la ouverte et signale-le. L'échec « Workers Builds » sur une branche ne compte pas
   (seul le build de `main` publie le site).
3. **Prends une tâche dans `docs/FEUILLE_DE_ROUTE.md`**, inscris-toi dessus (colonne « Qui ») dans ta branche,
   et mets son statut à jour en terminant. Ne prends pas une tâche déjà attribuée.
4. **Reste dans ton périmètre.** Les tâches de la feuille de route disent quels fichiers elles touchent. Si tu dois
   modifier un fichier hors de ton périmètre (moteur de combat, déroulé de la run, sauvegarde), dis-le dans la demande de fusion.
5. **Récupère `main` avant de commencer et avant d'ouvrir ta demande** (`git pull --rebase origin main`).
6. **Documente** : une règle de jeu qui change va dans `docs/DESIGN.md` ; une mesure d'équilibrage dans `docs/BALANCE.md`.

## Règles du projet (à respecter partout)
- **Tout est en français** : textes du jeu, commentaires, documentation, messages de commit.
- **« le Iop », jamais « l'Iop »** (pas d'élision devant Iop : « de Iop », « du Iop »). Les autres classes s'élident
  normalement (« d'Eniripsa », « l'Écaflip »).
- **Ton des textes** : tutoiement, phrases courtes, humour léger de l'univers Dofus. Pas de majuscules décoratives.
- **`equilibrage.json` fait foi** sur les valeurs écrites dans le code : il s'applique au chargement et le jeu en ligne
  le relit à chaque démarrage. Le propriétaire du projet le modifie directement sur GitHub : ne l'écrase jamais
  (`npm run balance:export` sans `--reset` ajoute seulement ce qui manque). Si tu changes une valeur dans le code
  (`src/data/*.ts`), change-la aussi dans le fichier, sinon le fichier l'emporte. Un test vérifie que les dieux
  du code et ceux du fichier sont identiques.
- **Les textes d'effets sont générés à partir des données** (`src/ui/describe.ts`, `src/game/boons.ts`, `src/core/effects.ts`) :
  n'écris jamais à la main la description d'une carte, d'un objet ou d'une bénédiction, elle ne suivrait pas les valeurs.
  Les phrases d'ambiance (`lore`), elles, sont écrites à la main : si tu changes un effet, relis sa phrase.
- **Déterminisme** : `src/core`, `src/data`, `src/game` n'utilisent jamais `Math.random` ni l'heure ; tout le hasard
  passe par `Rng` (une graine par partie). La sauvegarde en dépend (voir plus bas).
- **Le moteur ne connaît pas l'interface** : rien dans `src/core`, `src/data`, `src/game` ne touche au DOM.
  Le bot (`src/sim`) et les tests jouent des parties complètes sans navigateur.
- **Chaque règle de jeu ajoutée ou modifiée a son test** (`src/core/*.test.ts`, `src/game/*.test.ts`).
- **Résistances des monstres plafonnées à 50 %** (`RES_CAP`). Poison au début du tour de celui qui le porte,
  brûlure à la fin.
- **Pas de potions, pas de forgemagie, pas de panoplies, pas de réactions élémentaires** : décisions déjà prises,
  voir « Décisions écartées » dans la feuille de route.

## Architecture
| Dossier | Rôle |
|---|---|
| `src/core` | Moteur : `combat.ts` (combat, statuts, règles, prévisualisation), `effects.ts` (déclencheurs × récompenses des objets, règles légendaires et divines), `map.ts`, `offers.ts`, `rng.ts`, `types.ts` |
| `src/data` | Contenu : `cards.ts`, `monsters.ts` + `bestiary.ts` (monstres et rencontres), `items.ts`, `eggs.ts` (Dofus), `gods.ts` (12 dieux, 72 bénédictions), `relics.ts`, `events.ts` (45 événements), `statusCards.ts` (statuts et malédictions), `balance.ts` (lecture et validation d'equilibrage.json) |
| `src/game` | Partie : `run.ts` (carte, combats, récompenses, marchand, Zaap, dieux, événements, opérations de run), `boons.ts` (bénédictions et reliques, textes), `save.ts` (sauvegarde) |
| `src/ui` | Interface : `app.ts` (écrans, rendu, interactions), `describe.ts` (textes d'effets), `bestiary.ts`, `sound.ts`, `style.css`, `scene/` (rendu WebGL des personnages Dofus 3, décors peints) |
| `src/sim` | Bot (`bot.ts`, `policy.ts`, `itemPolicy.ts`) et simulations (`run.ts`, `calibrate.ts`) |
| `public/assets` | Icônes, polices, illustrations des dieux (versionnés) |
| `public/game` | Animations, décors, effets de sorts, musiques et voix, importés de Dofus Survivors (versionnés, lourds : ne pas les régénérer sans raison) |

## Pièges connus
- **Sauvegarde = graine + actions rejouées** (`src/game/save.ts`). Une partie est reconstruite en rejouant les actions
  du joueur. Conséquences :
  - toute méthode de `Run` qui change l'état et qui est appelée par l'interface doit figurer dans `RUN_ACTIONS` ;
  - changer une règle peut rendre une partie sauvegardée impossible à rejouer : c'est accepté (l'accueil le signale),
    mais ne casse pas les sauvegardes sans raison ;
  - ajouter un déclencheur d'objet change les effets tirés pour toutes les parties : un déclencheur réservé aux
    bénédictions prend `noRoll: true`.
- **Prévisualisation des dégâts** (`Combat.preview`) : joue la carte sur une copie du combat. La copie ne doit jamais
  partager d'état ni de méthode liée avec le vrai combat (un bug l'a déjà fait jouer les cartes pour de vrai).
- **Événements** : une réponse avec une seconde scène (`next`) ne doit pas lancer de combat ; le combat termine l'événement.
- **Identifiants de cartes** propres à chaque partie (`Run.card`) : n'utilise pas `newCard` dans `src/game`.

## Mise en ligne
Fusionner dans `main` suffit : Cloudflare construit (`npm run build`) et publie `dist/`. Si le build échoue,
le site garde la version précédente. Avant de fusionner : `npm test`, `npm run typecheck`, `npm run preview`
et un coup d'œil au jeu.
