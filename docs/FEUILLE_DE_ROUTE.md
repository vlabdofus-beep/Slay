# Feuille de route : La Main des Douze

Le tableau de bord partagé entre le propriétaire du projet et les IA qui y travaillent.
**Avant de commencer une tâche** : vérifie qu'elle n'a pas déjà quelqu'un dans « Qui », inscris-toi (sur ta branche),
puis mets le statut à jour en terminant. Statuts : à faire, en cours, en relecture, fait.

## Où en est le jeu (31/10/2026)
- 3 classes jouables : Iop (Courroux), Crâ (Visée) et Xélor (Téléfrag, 58 cartes). 3 actes de 12 étages + boss, carte façon Slay.
- 121 cartes, ~150 monstres aux résistances de Dofus (plafond 50 %), 132 objets à effet tiré par partie, 18 Dofus.
- 12 dieux et 72 bénédictions (sanctuaire en début d'acte), 45 événements à l'aveugle, 18 reliques, 3 malédictions.
- Prévisualisation des dégâts, sauvegarde automatique, son (coupé par défaut), bestiaire complet avec recherche.
- `equilibrage.json` réglable sur GitHub. Bot : ≈ 35 % des parties battent le boss 1, ≈ 10 % le boss 2, 2 à 3 % gagnent.

## Tâches

### Équilibrage
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Mesurer chaque bénédiction au bot (taux de victoire avec / sans), proposer des corrections | `src/sim/`, `docs/BALANCE.md`, `equilibrage.json` | Grok | fait |
| Ajouter les reliques au fichier d'équilibrage (même format que les dieux) | `src/data/balance.ts`, `src/data/relics.ts`, `tools/export-balance.ts`, `equilibrage.json` | Grok | fait |
| Ajouter les événements au fichier d'équilibrage (prix, gains, chances) | `src/data/balance.ts`, `src/data/events.ts` | Grok | fait |
| Réduire l'écart Crâ / Iop (le Crâ passe plus souvent l'acte 2) | `src/data/cards.ts`, `src/data/monsters.ts`, `src/data/bestiary.ts`, `equilibrage.json`, `docs/BALANCE.md` | Grok | en relecture |
| Échelle pour 2, 3 et 4 joueurs qui jouent en même temps (PV des monstres, dégâts inchangés) | `equilibrage.json`, `src/data/monsters.ts`, `docs/BALANCE.md` | Grok | fait |
| Donner aux objets une stat fixe qui se voit, sans compter l'effet tiré | `src/data/items.ts`, `docs/BALANCE.md` | Grok | fait |
| Reprendre les PV et dégâts des monstres après les stats d'objets | `equilibrage.json`, `src/data/monsters.ts`, `docs/BALANCE.md` | Grok | fait |
| Parties jouées par des humains : noter difficulté ressentie, cartes trop fortes ou inutiles | `docs/BALANCE.md` | propriétaire | à faire |

### Contenu
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Illustrations des cartes sans image (elles affichent leurs initiales) : trouver l'icône de sort Dofus la plus proche ou une illustration adaptée | `src/data/cards.ts` (champ `icon`), `public/assets` | | à faire |
| Relire les 45 événements et les phrases d'ambiance des bénédictions (ton, fautes, cohérence avec les effets) | `src/data/events.ts`, `src/data/gods.ts`, `src/data/relics.ts` | | à faire |
| Concevoir une 3e classe sur le papier : passif, deck de départ, ~35 cartes, dans l'esprit du dieu (le code prévoit Eniripsa, Xélor, Osamodas) | `docs/CLASSE_XELOR.md` (proposition), puis `src/data/cards.ts` | Claude (Xélor) | fait |
| Intégrer la 3e classe (passif dans le moteur, écran d'accueil, animations) | `src/core/classes.ts`, `src/ui/`, `tools/import-survivors-assets.mjs` | Claude (Xélor) | fait |
| Xélor, lot 2 : effets « au prochain tour », rembobinage, PV perdus regagnés, retour en main, puis les 8 cartes ② de `docs/CLASSE_XELOR.md` | `src/core/combat.ts`, `src/data/cards.ts` | Claude (Xélor) | fait |
| Voix des autres classes et sons des monstres | `src/ui/sound.ts`, `public/game/sfx` | | à faire |

### Multijoueur (décisions du propriétaire du 31/10/2026, voir `docs/DESIGN.md`, « Multijoueur »)
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| 1. Combat à plusieurs héros : tours simultanés, les monstres jouent une fois et frappent tous les héros, héros hors combat à 0 PV | `src/core/combat.ts`, `src/core/party.test.ts` | Claude | fait |
| 2. Run à plusieurs : carte votée à la majorité, récompenses, objets, marchand et kamas à chacun, retour à 1 PV après un combat gagné, dieux et événements | `src/game/run.ts`, `src/game/party.ts`, `src/sim/party.ts` | Claude | fait |
| 3. Échelle mesurée (PV ×2,5 / ×3,6 / ×5,5, dégâts ×1). La passer au combat quand la run à plusieurs existera | `src/data/monsters.ts`, `equilibrage.json`, `docs/BALANCE.md` | Grok | mesure faite |
| 4. Salon en ligne : Worker et Durable Object Cloudflare, WebSockets, journal d'actions ordonné par le serveur, reconnexion, minuteur | `worker/`, `wrangler.jsonc` | Claude | fait |
| 5. Interface : créer ou rejoindre un salon, plusieurs héros sur la scène, « Prêt », minuteur, vote de la carte | `src/ui/` | Claude | fait (minuteur à faire) |
| 6. Cartes à plusieurs, obtenables seulement en multijoueur (plus tard) | `src/data/cards.ts` | | à décider |

### Systèmes (à valider avec le propriétaire avant de commencer)
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Zaap plus riche (plus de deux options) | `src/game/run.ts`, `src/ui/app.ts` | | à décider |
| Niveaux de difficulté après une victoire (façon Ascension) | `src/game/run.ts`, `src/data/monsters.ts` | | à décider |
| Mode à 2, 3 ou 4 joueurs (tout le monde en même temps ; l'échelle est prête, `scaleForParty`) | `src/core/combat.ts`, `src/game/run.ts`, `src/ui/` | | à décider |
| Bestiaire qui se remplit au fil des rencontres (`known()` est prêt) | `src/ui/bestiary.ts`, sauvegarde du bestiaire | | à décider |
| Historique des parties, statistiques | `src/ui/`, stockage navigateur | | à décider |
| Première partie guidée / tutoriel | `src/ui/` | | à décider |

### Qualité
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Tester les combats sur mobile et sur une machine modeste, corriger | `src/ui/`, `src/ui/scene/` | | à faire |
| Prévenir le joueur quand une mise à jour rend sa partie sauvegardée impossible à reprendre | `src/game/save.ts`, `src/ui/app.ts` | | à faire |
| Tests automatiques à chaque demande de fusion (GitHub Actions : `npm test`, `npm run typecheck`, `npm run build`) | `.github/workflows/tests.yml` | Claude | fait |

## Décisions écartées (ne pas réintroduire sans accord du propriétaire)
- Potions ou consommables de combat : retirés pour garder une fin de combat propre.
- Forgemagie au Zaap : retirée.
- Panoplies, bonus selon le nombre d'objets équipés, effets actifs d'objets : remplacés par un effet tiré au hasard par partie.
- Réactions élémentaires : gardées de côté (idée pour un éventuel Huppermage).
- Plafonds de piles (brûlure, poison) et limites globales d'effets par tour : refusés ; on limite par objet.

## Journal
- 31/10/2026 : le jeu s'appelle désormais **La Main des Douze** (accueil, onglet, documentation). Dépôt et Worker gardent leur nom technique.
- 31/10/2026 : Claude — multijoueur, étape 5 : on joue à plusieurs dans le jeu. Salon depuis l'accueil (« Jouer à plusieurs », code ou lien), votes sur la carte, alliés et bouton « Prêt » en combat, reprise après coupure. `npm run preview` fait tourner les salons en local (deux onglets pour jouer à deux).
- 31/10/2026 : Claude — multijoueur, étape 4 : le salon en ligne (`worker/`) : un Durable Object Cloudflare par code de salon, WebSockets, journal d'actions numéroté, retour d'un joueur avec tout le journal, effacement après une journée.
- 31/10/2026 : Grok — monstres relevés après les stats d'objets. Acte 1 ×1,15 PV et ×1,08 dégâts, acte 2 ×1,35 et ×1,22, acte 3 ×1,50 et ×1,32. 72 runs : Iop 40/13/1 (14,9), Crâ 33/14/4 (13,6), Xélor 36/10/3 (14,3), contre 38/8/2, 34/12/3 et 36/12/2 avant les objets.
- 31/10/2026 : Claude — multijoueur, étape 2 : la partie à plusieurs (`src/game/party.ts`) : une run par joueur, carte et combats communs, vote à la majorité, journal d'actions rejouable ; bot à plusieurs (`src/sim/party.ts`, `botParty`).
- 31/10/2026 : Grok — stats fixes des objets. Un commun Terre passe de +1 à +2–3, un légendaire de +2 à +9–12, les PV d'un mythique de +12 à +32–42. L'effet tiré ne change pas. Les monstres ne sont pas retouchés : à mesurer ensuite.
- 31/10/2026 : Grok — échelle recalée sur le draft (les monstres frappent tout le monde). PV ×2,5 / ×3,6 / ×5,5 pour 2, 3 et 4 joueurs. Dégâts inchangés. L'ancienne échelle rendait les élites d'acte 2 trop faciles.
- 31/10/2026 : Claude — multijoueur, étape 1 : le combat accepte plusieurs héros (tours simultanés, monstres qui frappent tout le monde, héros hors combat). Le solo ne change pas (mêmes résultats au bot, graine par graine).
- 31/10/2026 : Grok — correction de l'échelle à plusieurs. Les joueurs jouent en même temps : les monstres ne gagnent pas une action par joueur, et leurs dégâts restent ×1. Les PV restent ×1,85 / ×2,7 / ×3,55.
- 31/10/2026 : Grok — accueil : l'herbe n'est plus un papier peint, les noms sont sur une plaque, le choix (pitch, passif, bouton) est sur une dalle sombre.
- 31/10/2026 : Grok — 72 bénédictions mesurées (200 runs par classe). Bouclier Féca 18 → 6, Mot de régénération 2 → 1, Horloge pioche 2 → 1. Reliques et événements ajoutés à equilibrage.json. Trois phrases corrigées (Bracelet du Minotoboule, gué des Crocodailles, Shushu).
- 31/10/2026 : Grok — zones du Crâ −2 dégâts (10 cartes). 600 runs : Iop 37/9/3, Crâ 35/12/2, étages 14,53 contre 14,58. L'écart de boss 2 passe de 7 à 3 points. Visée à 6, PV du Crâ et échelle de l'acte 2 mesurés et écartés.
- 31/10/2026 : Grok — écart Crâ / Iop mesuré (37/8/3 contre 35/16/5). Visée à 6 écartée (trop dur pour l'acte 1). Poison de zone du Crâ baissé, trois zones du Iop relevées, huit monstres ramenés vers la médiane de leur salle.
- 31/10/2026 : dépôt réorganisé (sources à la racine, build par Cloudflare), AGENTS.md et feuille de route créés.
- 31/10/2026 : le Xélor (lot 1) entre en jeu : Téléfrag, ralenti, échéance, 50 cartes, bot ; mesure dans BALANCE.md.
- 31/10/2026 : les IA fusionnent elles-mêmes leurs demandes quand les tests passent, et préviennent le propriétaire.
- 31/10/2026 : le Xélor (lot 2) : effets au prochain tour, Rembobinage, Raulebaque, Régulateur ; 58 cartes.
- 31/10/2026 : Claude — accueil : nouveau fond, le chemin d'une run au crépuscule (Amakna, Abraknydes, Frigost, Brâkmar).
