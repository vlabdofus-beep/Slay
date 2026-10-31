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
- Les voies élémentaires tiennent par les cartes et par les effets d'objets qui parlent d'éléments
  (« quand tu joues ta 2e carte Air du tour… »). Plus de paliers d'affinité ni de panoplies (décision du 30/10/2026).

## Objets et récompenses (refonte du 30/10/2026)
- Fin de combat : un seul écran « 1 carte parmi 3 » + éventuellement « 1 objet parmi 3 ». **Pas de potions.**
  Rien ne traîne après un combat : seuls les PV (et la prospection gagnée) persistent.
- **Aucune panoplie, aucun actif, aucun palier.** Un objet = une stat fixe + un effet tiré au sort pour la run.
- 6 emplacements (coiffe, cape, amulette, anneau, ceinture, bottes), un objet chacun.
- Catalogue : 132 objets Dofus réels, 22 par emplacement. Rareté selon le niveau Dofus :
  commun (1-40), rare (41-100), mythique (101-160), légendaire (161-200).
- **Stat fixe** : la stat principale de l'objet dans Dofus (Force → dégâts Terre, Intelligence → Feu, Chance → Eau,
  Agilité → Air, Vitalité → PV, Prospection, Sagesse / résistances → armure), valeur selon la rareté.
- **Effet tiré** au début de chaque run (graine de la run : un même objet garde son effet toute la run) :
  - déclencheur × récompense (`src/core/effects.ts`) : 45 déclencheurs (dont 5 par élément) et 21 récompenses ;
  - commun : budget 6, rare : 11, mythique : 17 réparti sur deux récompenses du même déclencheur ;
  - légendaire : une des 22 règles écrites à la main (brûlure tenace, première carte gratuite, ricochet…).
  - Base : environ 570 effets communs, 590 rares, 3 900 paires mythiques, 22 légendaires.
  - Un même objet se déclenche au plus 3 fois par tour (une fois pour pioche, PA, réduction de coût) ;
    aucune autre limite : piles de brûlure et de poison illimitées, objets cumulables.
- **Prospection** (stat et effets) : chance d'objet après un combat normal (45 % → 90 %) et raretés plus hautes
  (×1 → ×3), rendement décroissant p / (p + 100). Élites : toujours un objet, jamais commun.
- 6 nouveaux statuts : poison (ignore armure et bouclier, divisé par 2), bouclier (persistant), renvoi de dommages,
  érosion (armure et soins ÷ 2), esquive (annule un coup), étourdi (saute une action ; 2 pour un boss).
  La brûlure est maintenant absorbée par l'armure et le bouclier : c'est le poison qui passe à travers.
- Boss des actes 1 et 2 : choix d'un Dofus parmi 3 (`src/data/eggs.ts`, 18 Dofus : primordiaux, Dokoko, Domakuro,
  Dolmanax…). Effets fixes et forts, gardés toute la run. Icônes : les 4 primordiaux de Dofus Survivors, les autres recolorés.
- **Kamas** : gagnés à chaque combat (faible 12-18, normal 16-24, élite 30-40, boss 70-80 ; +50 % par acte ;
  jusqu'à +50 % avec la prospection). On commence avec 60.
- **Marchand** (case de carte à partir du 4e étage, au moins un par acte) : 5 cartes (3 communes ≈ 50, 2 rares ≈ 80),
  3 objets (raretés tirées avec un bonus de prospection ; 75 / 115 / 170 / 260 selon la rareté), retrait d'une carte
  (50, +25 à chaque retrait de la run).
- Zaap : se reposer ou améliorer une carte. **Plus de forgemagie.**

## Données Dofus (v2)
- `tools/build-dofus-data.mjs <dossier data de Dofdle>` extrait le sous-ensemble utilisé dans `src/data/dofus.json` :
  sorts Iop/Crâ, 14 monstres et le catalogue de 132 objets.
- Cartes = vrais sorts (nom, élément, icône, description ; coût : 1-2 PA → 0, 3 → 1, 4-5 → 2, 6+ → 3).
  Cartes de base : Coup d'épée / Coup d'arc (neutres), Vitalité / Tir de Repli, signature Pression (Iop) / Flèche Glacée (Crâ).
- Monstres = vrais monstres d'Amakna ; faiblesses / résistances dérivées des résistances Dofus (écart ≥ 15 points).
  Élites : Chef de Guerre Bouftou, Tournesol Affamé. Boss : Bouftou Royal.
- Valeurs d'équilibrage : toujours les nôtres (docs/BALANCE.md).

## Jeu jouable (v2)
- Trois actes : Amakna, forêt des Abraknydes, landes de Brâkmar. **Trois boss possibles par acte**, tirés à chaque run :
  Bouftou Royal / Shin Larve / Coffre Maudit du Flib ; Abraknyde Ancestral / Blop Griotte Royal / Chêne Mou ;
  Minotoror / Meulou / Tofu Royal. 5 à 6 élites par acte, 150 monstres réels au total (`src/data/bestiary.ts`).
- **Mécaniques de monstres** (`MonsterPower`, repères StS adaptés) : carapace, épines, colère, enroulement, rituel,
  spores, explosion, division (Gelées → Petites Gelées, Blops → Biblops, Blop Griotte Royal → Blops), garde, régénération,
  agilité (esquive), rage sur les compétences, sommeil, invulnérabilité (plafond de PV perdus par tour), artefact.
  Innovations : **voleurs** qui volent des kamas et s'enfuient avec (on les récupère en les battant), **peau de roche**
  (résiste à l'élément du dernier coup reçu), **garde royale**, invocations, seconde phase des boss sous 50 % de PV,
  **cartes de statut** glissées dans le deck (toile d'Arakne éphémère, bave de Gelée à payer, braise qui brûle en main,
  blessure).
  Chaque acte a ses monstres réels,
  son décor par rencontre, et les PV sont remis au maximum au début des actes 2 et 3.
- Carte de chaque acte façon Slay : 12 étages + boss ; étages 1-3 combats faibles ; marchands à partir du 4e ; élites
  et Zaaps à partir du 5e ; 12e étage = Zaap. Pas deux élites, deux Zaaps ou deux marchands d'affilée.
  **Aucun chemin ne se croise** : un pas en diagonale est refusé s'il couperait la diagonale inverse.
- Zaap : se reposer (30 % des PV max) ou améliorer une carte. Une action.
- Écran de victoire : 1 carte parmi 3 (25 % de rares, 50 % après un élite) + objet selon la prospection.
- Interface : `src/ui/` (DOM sans framework). Raccourcis : 1-9 pour jouer une carte, E pour finir le tour, Échap pour annuler.

## Équilibrage
Voir `docs/BALANCE.md` (repères StS2, coefficient de difficulté, résultats de simulation). PV de départ : Iop 80, Cra 75.

## À décider
- 3 énergie (Slay) ou 6 PA (Dofus) ; pas de grille au départ.
- Usage personnel ou diffusion (impact sur les assets).

## Chantier visuel (pistes validées le 30/10/2026)
1. Cadre de carte définitif : bordure bronze, argent ou or selon la rareté, grande icône du sort, reflet pour les cartes améliorées, dos de carte pour la pioche.
2. Iconographie officielle : icônes de l'interface Dofus à la place des icônes dessinées (épées, crâne, Zaap).
3. Réactions visuelles en combat : chiffres de dégâts colorés selon l'élément, carte qui file vers sa cible, entrée du boss comme unique moment fort.

## Classes : passifs et extension de cartes (30/10/2026)

Chaque classe a un passif permanent, l'équivalent de la relique de départ de Slay the Spire (`src/core/classes.ts`), affiché sur l'écran titre, dans la fiche et en tête de la barre d'effets en combat, avec un compteur vivant.

- **Iop, Courroux** : à la fin du tour, s'il a joué au moins 3 attaques, il gagne 1 puissance pour le combat. Le deck Iop pousse à enchaîner les attaques bon marché.
- **Crâ, Visée** : toutes les 5 attaques, l'attaque inflige le double de dégâts. Des cartes « Visée +n » rapprochent le tir doublé sans le déclencher.

52 cartes ajoutées : 24 Iop, 23 Crâ (tous les sorts Dofus de ces classes encore libres) et 5 armes neutres proposées aux deux classes. Nouvelles mécaniques de carte :

- **Pouvoirs** (type `pouvoir`) : restent en jeu tout le combat. Ils réutilisent la grammaire des objets (déclencheur × récompense, limite par tour comprise) ou une règle légendaire. Affichés en médaillon bleu sous la barre de PV.
- **Bonus** sur les dégâts et l'armure : +n par attaque jouée ce tour, par puissance, par ennemi en vie, par altération sur la cible, par carte en main, par lancer précédent de la carte.
- **Sorts de sang** (perte de PV, synergie avec Violence), **Visée +n**, **multiplication d'un statut** (Vendetta double le poison).
- Les nouveaux statuts servent enfin aux cartes : poison (Crâ), bouclier, renvoi, érosion, esquive, étourdi.

## Bestiaire (30/10/2026)

Écran `#bestiaire` (`src/ui/bestiary.ts`), ouvert depuis l'accueil, la carte et la barre du combat ; Échap ou « Reprendre la partie » ramène où l'on était. Cinq onglets avec recherche par nom : monstres (fiche complète : PV et dégâts tels qu'en jeu, faiblesses, mécaniques, actions et leur rythme, seconde phase, rencontres où on le croise), cartes (filtres classe, type, rareté, élément, version améliorée), objets (en partie, avec l'effet tiré pour la run), Dofus, effets et statuts (statuts, passifs, déclencheurs, récompenses, règles légendaires et des Dofus).

Pour l'instant tout est visible. `known()` dans `bestiary.ts` est l'endroit où brancher plus tard un bestiaire qui se remplit au fil des rencontres. Les monstres qu'aucune rencontre ne fait apparaître (Tortue Bleue, Branche Invocatrice) n'y figurent pas.

## Sorts inventés (31/10/2026)

26 cartes sans sort Dofus derrière (14 Iop, 12 Crâ) et une carte créée en combat (Flèche Improvisée). Nom, coût et élément sont inventés ; l'icône est celle d'un sort d'une autre classe qui colle à l'idée. Elles portent des mécaniques nouvelles :

- **Conditions** évaluées au moment de l'effet : si la cible meurt (Coup de Grâce : +1 PA, pioche 1), si elle a moins de la moitié de ses PV (Tir d'Exécution), si elle est vulnérable, si tu as moins de la moitié de tes PV, si la carte précédente du tour était une attaque (Enchaînement).
- **Conservée** (reste en main en fin de tour) et **Innée** (toujours dans la première main).
- **Écho** : Dédoublement lance deux fois la prochaine attaque.
- **Consommer** : Explosion de Rage frappe avec toute la puissance puis la perd ; Tir Chargé frappe avec la Visée accumulée puis la remet à zéro (sans la faire avancer).
- **Poison** : Flèche Contagieuse copie le poison de la cible sur les autres ennemis, Flèche Nécrotique le fait perdre d'un coup sans qu'il diminue.
- **Cartes créées** : Carquois Garni met des Flèches Improvisées (0 PA, épuisées) en main ; chacune compte pour la Visée.
- Dégâts **perçants** (Frappe Écrasante), dégâts égaux à l'armure (Charge Blindée), Rage Aveugle qui épuise la main et frappe par carte épuisée, Furie Écarlate (+1 puissance et −2 PV par tour, se marie avec Violence).

## Apparence du personnage (31/10/2026)

- **Netteté** : les personnages ne sont plus des planches cuites à petite taille puis agrandies. Chaque image est rendue en WebGL à la taille réelle d'affichage (densité d'écran comprise), une seule fois, puis réutilisée. Les animations de base se préparent en tâche de fond au début du combat ; celles des sorts au premier lancer.
- **Couleurs** : 5 pastilles sur l'écran titre (peau, cheveux, trois couleurs de tenue), par classe et par sexe, gardées dans le navigateur. Bouton pour revenir aux couleurs d'origine.
- **Coiffe et cape** : l'objet équipé change l'apparence en combat (42 des 44 coiffes et capes ont leur vraie apparence Dofus, reprise de Dofus Survivors via `tools/import-survivors-assets.mjs` → `src/data/skins.json` et `public/game/anims/accp*.js`).

## Visuels des Dofus (31/10/2026)

Les 18 Dofus utilisent leur icône officielle de Dofus 3 : identifiants d'image relevés dans les données du client (`items.json` et `fr.json` publiés par dofusdude/dofus3-main, objets de type 23), servis par DofusDB comme les autres objets. Les anciennes répliques recolorées ne servent plus que de repli si DofusDB ne répond pas.

## Direction artistique « le pays peint » (31/10/2026)

L'accueil et la carte sont les premières images du jeu : ils se posent désormais sur le vrai monde de Dofus 3, en plein jour, au lieu d'un fond d'ardoise étoilé.

- **Typographie** : Berkshire Swash (calligraphie de conte, un peu farceuse comme l'univers d'Ankama) pour le logo, les titres, les noms ; Alegreya Sans (humaniste, chaleureuse, bons accents français) pour le texte. Polices libres (OFL), servies depuis `public/assets/fonts`.
- **Palette** : laine de Bouftou `#fff3d6` (texte), encre des contours `#10201a`, tournesol d'Astrub `#f0b739`, sous-bois `#14231d` / mousse `#1b2e26` pour les fonds ; rouge Iop `#e5483b` et vert Crâ `#7dbb2e` pour ce qui appartient à chaque classe.
- **Signature** : les éléments forts portent un contour d'encre épais et une ombre franche décalée, comme des autocollants de carnet d'aventurier (logo, plateau de la carte, cases, boutons « Jouer »). Le reste reste sobre.
- **Accueil** : paysage peint avec les pièces du pack « champs d'Astrub » (ciel, collines en perspective aérienne, décors en rangs) ; les deux héros se tiennent dans le décor, une plaque sombre sous chacun.
- **Carte** : plateau peint au sol du lieu de l'acte (champs d'Astrub, jungle, landes), semé de ses décors hors des cases et des chemins ; route prise et prochains pas en sentier de terre, le reste en pointillés ; cases en médaillons crème cerclés d'encre.
- Code : `src/ui/scene/paint.ts` (peintures), `viewTitle`, `viewMap`, `mountLand`, `mountBoard` dans `src/ui/app.ts`.
