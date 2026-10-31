# Feuille de route

Le tableau de bord partagé entre le propriétaire du projet et les IA qui y travaillent.
**Avant de commencer une tâche** : vérifie qu'elle n'a pas déjà quelqu'un dans « Qui », inscris-toi (sur ta branche),
puis mets le statut à jour en terminant. Statuts : à faire, en cours, en relecture, fait.

## Où en est le jeu (31/10/2026)
- 2 classes jouables : Iop (Courroux) et Crâ (Visée). 3 actes de 12 étages + boss, carte façon Slay.
- 121 cartes, ~150 monstres aux résistances de Dofus (plafond 50 %), 132 objets à effet tiré par partie, 18 Dofus.
- 12 dieux et 72 bénédictions (sanctuaire en début d'acte), 45 événements à l'aveugle, 18 reliques, 3 malédictions.
- Prévisualisation des dégâts, sauvegarde automatique, son (coupé par défaut), bestiaire complet avec recherche.
- `equilibrage.json` réglable sur GitHub. Bot : ≈ 35 % des parties battent le boss 1, ≈ 10 % le boss 2, 2 à 3 % gagnent.

## Tâches

### Équilibrage
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Mesurer chaque bénédiction au bot (taux de victoire avec / sans), proposer des corrections | `src/sim/`, `docs/BALANCE.md`, `equilibrage.json` | | à faire |
| Ajouter les reliques au fichier d'équilibrage (même format que les dieux) | `src/data/balance.ts`, `src/data/relics.ts`, `tools/export-balance.ts`, `equilibrage.json` | | à faire |
| Ajouter les événements au fichier d'équilibrage (prix, gains, chances) | `src/data/balance.ts`, `src/data/events.ts` | | à faire |
| Réduire l'écart Crâ / Iop (le Crâ passe plus souvent l'acte 2) | `src/data/cards.ts`, `src/data/monsters.ts`, `src/data/bestiary.ts`, `equilibrage.json`, `docs/BALANCE.md` | Grok | en cours |
| Parties jouées par des humains : noter difficulté ressentie, cartes trop fortes ou inutiles | `docs/BALANCE.md` | propriétaire | à faire |

### Contenu
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Illustrations des cartes sans image (elles affichent leurs initiales) : trouver l'icône de sort Dofus la plus proche ou une illustration adaptée | `src/data/cards.ts` (champ `icon`), `public/assets` | | à faire |
| Relire les 45 événements et les phrases d'ambiance des bénédictions (ton, fautes, cohérence avec les effets) | `src/data/events.ts`, `src/data/gods.ts`, `src/data/relics.ts` | | à faire |
| Concevoir une 3e classe sur le papier : passif, deck de départ, ~35 cartes, dans l'esprit du dieu (le code prévoit Eniripsa, Xélor, Osamodas) | `docs/` (proposition), puis `src/data/cards.ts` | | à faire |
| Intégrer la 3e classe (passif dans le moteur, écran d'accueil, animations) | `src/core/classes.ts`, `src/ui/`, `tools/import-survivors-assets.mjs` | | à faire |
| Voix des autres classes et sons des monstres | `src/ui/sound.ts`, `public/game/sfx` | | à faire |

### Systèmes (à valider avec le propriétaire avant de commencer)
| Tâche | Fichiers | Qui | Statut |
|---|---|---|---|
| Zaap plus riche (plus de deux options) | `src/game/run.ts`, `src/ui/app.ts` | | à décider |
| Niveaux de difficulté après une victoire (façon Ascension) | `src/game/run.ts`, `src/data/monsters.ts` | | à décider |
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
- 31/10/2026 : Grok — écart Crâ / Iop mesuré (37/8/3 contre 35/16/5). Visée à 6 écartée (trop dur pour l'acte 1). Poison de zone du Crâ baissé, trois zones du Iop relevées, huit monstres ramenés vers la médiane de leur salle.
- 31/10/2026 : dépôt réorganisé (sources à la racine, build par Cloudflare), AGENTS.md et feuille de route créés.
