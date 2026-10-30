# Dofus Slay — conception (décisions validées)

Deckbuilder roguelike façon Slay the Spire dans l'univers de Dofus. Fan game non officiel.

## Technique
- TypeScript + Vite, navigateur. Déploiement Cloudflare comme Dofdle / Survivors.
- `src/core` : moteur de combat sans rendu (état, RNG à seed, effets). Tourne aussi en Node → simulations d'équilibrage.
- `src/data` : contenu décrit en données typées (cartes, monstres). Destiné à être généré depuis DofusDB.
- `src/sim` : politique de jeu gloutonne + runner de simulations (`npm run sim`).
- Spire Codex = référence de structure et d'équilibrage (courbes de coût, patterns, scaling), jamais de textes ni de visuels copiés.

## Classes (5)
Iop (puissance, gros coups), Cra (distance, brûlure/marques), Eniripsa (soin→dégâts, drain), Xelor (temps, rejeu, PA), Osamodas (invocations).
Réserve : Sram, Sacrieur, Ecaflip, Enutrof, Sadida. **Huppermage** : prévu plus tard, c'est lui qui portera les réactions élémentaires (idée mise de côté).

## Éléments
- Cartes de base (Frappe/Défense) neutres, seule la carte signature porte un élément : aucun deck de départ n'est pénalisé.
Terre (armure, coups lourds) · Feu (brûlure, zone) · Eau (drain, économie) · Air (tempo, multi-coups) · Neutre.
- Chaque monstre : faiblesse (+50 %) et résistance (−50 %) élémentaires, visibles dans ses intentions.
- Paliers d'affinité par élément (cartes + items) → bonus passifs. Les offres d'items s'accentuent autour des voies choisies.
- Voie multi-élément : plus de liberté de construction, portée par des panoplies multi calibrées pour rester viables sans écraser les voies pures (ex. deux voies jouables en parallèle).

## Items et récompenses
- Fin de combat : Kamas auto, puis un seul écran « 1 carte parmi 3 » + « 1 item parmi 3 ».
- **Pas de potions.** Rien ne traîne après un combat : seuls les PV persistent.
- Items courants = équipement (coiffe, cape, amulette, anneau, ceinture, bottes) avec stats uniquement, regroupés en panoplies (bonus 2/4/6 pièces). Emplacements limités.
- Items rares (élites, events) : peuvent avoir un effet actif, une fois par combat, rechargé au début de chaque combat.
- Boss : choix de 3 Dofus (relique-like), emplacements dédiés.
- Zaap (repos) : soin, amélioration ou **forgemagie** (changer l'élément d'une carte / d'un item).

## Items (implémentés en v1)
- 6 panoplies de 4 pièces : Bouftou (Terre), Flammèche (Feu), Larve (Eau), Tofu (Air), Piou (multi), Aventurier (neutre).
  Bonus à 2 pièces (+1 dommage de l'élément) et 4 pièces (+1 dommage, +1 armure, +8 PV). Noms et stats provisoires (→ DofusDB).
- 6 items rares d'élite avec un actif (une fois par combat, rechargé au combat suivant).
- Affinité = cartes + items de l'élément. Paliers à 4 / 8 / 12 points. Effets secondaires :
  Terre → armure par carte Terre (2/4/6), Feu → brûlure par cible touchée (1/2/3), Eau → soin par attaque (1/2/3),
  Air → les N premières cartes Air du tour piochent 1 (1/2/3).
- Voie multi : stat « prisme » = +N dégâts par coup et par élément différent déjà joué ce tour (cartes neutres comprises).
- Offres : découverte (3 familles différentes) tant qu'aucun palier n'est atteint ; ensuite 1 item de la voie,
  1 de la 2e voie / multi (ou encore la voie dominante à partir du palier 2), 1 joker hors voie.
  Pièces d'une panoplie commencée ×3.
- Cadence retenue : 1 offre commune tous les 2 combats de couloir, 1 offre rare après chaque élite.

## Données Dofus (v2)
- `tools/build-dofus-data.mjs <dossier data de Dofdle>` extrait le sous-ensemble utilisé dans `src/data/dofus.json` :
  sorts Iop/Crâ, 14 monstres, 7 panoplies et 6 objets rares.
- Cartes = vrais sorts (nom, élément, icône, description ; coût : 1-2 PA → 0, 3 → 1, 4-5 → 2, 6+ → 3).
  Cartes de base : Coup d'épée / Coup d'arc (neutres), Vitalité / Tir de Repli, signature Pression (Iop) / Flèche Glacée (Crâ).
- Monstres = vrais monstres d'Amakna ; faiblesses / résistances dérivées des résistances Dofus (écart ≥ 15 points).
  Élites : Chef de Guerre Bouftou, Tournesol Affamé. Boss : Bouftou Royal.
- Panoplies réelles : Piou Vert (Terre), Piou Rouge (Feu), Moskito (Eau), Tofu (Air), Bouftou (duo Terre/Feu),
  Microplie (multi), Intrépide (neutre). Rares : pièces royales du Bouftou, Ambramulette Arakne, Ceinture du Garde Royal.
- Valeurs d'équilibrage : toujours les nôtres (docs/BALANCE.md).

## Jeu jouable (v2)
- Carte de l'acte façon Slay : 12 étages + boss ; étages 1-3 combats faibles ; élites et Zaaps à partir du 5e ;
  12e étage = Zaap. Pas deux élites ou deux Zaaps d'affilée.
- Zaap : se reposer (30 % des PV max), améliorer une carte, ou forgemagie (changer l'élément d'une carte). Une action.
- Écran de victoire : 1 carte parmi 3 (25 % de rares, 50 % après un élite) + objet selon la cadence.
- Interface : `src/ui/` (DOM sans framework). Raccourcis : 1-9 pour jouer une carte, E pour finir le tour, Échap pour annuler.

## Équilibrage
Voir `docs/BALANCE.md` (repères StS2, coefficient de difficulté, résultats de simulation). PV de départ : Iop 80, Cra 75.

## À décider
- Cadence des items : à revoir si on veut des panoplies 4 pièces dès l'acte 1.
- 3 énergie (Slay) ou 6 PA (Dofus) ; pas de grille au départ.
- Usage personnel ou diffusion (impact sur les assets).
