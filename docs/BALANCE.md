# Équilibrage — repères et état actuel

Repères tirés des exports Spire Codex (Slay the Spire 2, 577 cartes, 115 monstres, 87 rencontres),
calculés par `tools/spire_benchmarks.py <dossier des exports>`. On n'utilise que des **nombres**
(coûts, dégâts, PV) comme gabarits : aucun texte ni visuel de StS2 n'entre dans le jeu.
Les exports eux-mêmes restent hors du dépôt (`reference/` est ignoré par git).

## Repères StS2 (médianes)

### Cartes
| Attaque simple | Commune | Peu commune | Rare |
|---|---|---|---|
| 0 énergie | 6 | 4,5 | 7 |
| 1 énergie | 8 (7–9) | 8 | 9 |
| 2 énergie | 12 | 14 | 11,5 |
| 3 énergie | — | 17 | 18 |

- Armure : 1 énergie ≈ 5–6, 2 énergie ≈ 9–12.
- Amélioration : +3 en médiane, soit **+33 %** des dégâts / +37 % de l'armure.
- Deck de départ : 5 Frappe (6) + 4 Défense (5) + 1 carte signature. Les Frappe/Défense sont neutres.
- Pool par personnage : ~88 cartes (≈ 20 communes, 36 peu communes, 28 rares, 4 de base).
- Mots-clés dominants : Exhaust (60), Ethereal (11), Retain (6). Statuts dominants : Vulnérable, Faible, Force, Poison.

### Monstres (acte 1)
| Salle | PV d'un monstre | PV de la rencontre | Coup max |
|---|---|---|---|
| Faible | 23–44 | ≈ 40 | ≈ 9 |
| Normale | 20–55 | ≈ 75 | ≈ 10 |
| Élite | ≈ 75 | ≈ 80 | ≈ 14 |
| Boss | 173–240 | ≈ 230 | ≈ 16 |

- Progression des boss : ≈ 230 (acte 1) → 380 (acte 2) → 510 (acte 3).
- Patterns : 76 en cycle, 19 aléatoires, 14 conditionnels.

## Nos choix

- Valeurs des cartes Iop et Cra alignées sur le tableau ci-dessus. Corrections : Épée divine 5×2 → 4×2,
  Couper/Flèche harcelante 3 → 4, zones renforcées (Tempête 10, Dispersion 9, Pluie 7 + brûlure 3),
  Colère de Iop 24 sans Exhaust, Flèche destructrice 12 → 10.
- **Cartes de base neutres** (sauf la signature) : en v0, le Iop de départ (tout en Terre) ne battait jamais le boss,
  qui résiste à la Terre. Les voies élémentaires se construisent désormais par les récompenses.
- Monstres d'Amakna refaits sur les repères (8 monstres, 2 élites, 1 boss, 11 rencontres). Chaque élément est la faiblesse
  de 2 monstres et la résistance de 2 autres.
- **Coefficient de difficulté de l'acte 1 : ×0,9** depuis l'arrivée des items (×0,75 avant), provisoire. À ×1, le bot meurt au premier
  élite : il n'a ni relique de départ, ni items, ni potions (supprimées par conception), et il prend ses cartes au hasard.
  On remontera vers ×1 quand les items et panoplies existeront.
- Cra à 75 PV (au lieu de 70) : l'écart avec le Iop venait surtout des PV.

## Résultats de simulation sans items (×0,75, 500 runs, bot glouton, cartes au hasard) — historique

| Classe | Survit au 1er élite | Atteint le boss | PV à l'arrivée | Bat le boss |
|---|---|---|---|---|
| Iop (80) | 100 % | 92 % | 48 | 31 % |
| Cra (75) | 100 % | 81 % | 43 | 17 % |

PV perdus par combat avec le deck de départ : faible 2–10, normal 10–18, élite 15–29.

À surveiller :
- Le **boss est un mur** (92 % l'atteignent, 31 % le battent). Leviers : ses PV, la récompense d'élite, les items.
- Le Cra reste derrière le Iop contre le boss.
- Le bot est volontairement simple : un humain fait nettement mieux. Ces chiffres servent à comparer des réglages, pas à fixer la difficulté finale.

## Items et panoplies (v1)

Cadence : 1 item commun parmi 3 tous les 2 combats de couloir, 1 item rare parmi 3 après chaque élite
(3 communs + 2 rares sur l'acte 1). Le bot choisit l'item qui maximise la valeur de son équipement.

| Coef. | Items | Iop : atteint / bat le boss | Cra : atteint / bat le boss |
|---|---|---|---|
| ×1 | non | 0 % / 0 % | 1 % / 0 % |
| ×1 | oui | 28 % / 11 % | 26 % / 12 % |
| **×0,9** | **oui** | **79 % / 52 %** | **60 % / 40 %** |
| ×0,85 | non | 35 % / 1 % | 22 % / 1 % |
| ×0,85 | oui | 97 % / 78 % | 83 % / 61 % |
| ×0,8 | oui | 100 % / 97 % | 99 % / 87 % |

Diagnostic à l'arrivée au boss (×0,85) : ~4,6 items portés ; panoplie complète 0 % ; un élément au palier 2 dans 8–14 % des runs ;
deux voies au palier 1 dans 59–70 % des runs ; voie multi (prisme ≥ 2) dans ~16 %.

Lecture :
- Les items comblent l'absence de potions et de relique de départ : à coefficient égal, ils transforment l'acte.
- Le Cra rattrape presque le Iop une fois équipé.
- **Aucune panoplie 4 pièces dans l'acte 1** : avec 3 offres communes, c'est impossible. Les bonus 4 pièces deviennent
  un objectif des actes 2–3, sauf si on augmente la cadence.
- Paliers 2+ rares, mais le bot prend ses cartes au hasard : un joueur qui suit une voie les atteindra bien plus souvent.

## Avec le vrai contenu Dofus (v2) — coefficient ×1

Le passage aux vrais sorts (plus de cartes à 0 PA, du drain) et aux vraies panoplies (plus de dégâts élémentaires)
a rendu le jeu plus facile : on a pu remonter à **×1**, c'est-à-dire les valeurs de StS2 sans réduction.

| Classe | Atteint le boss | Bat le boss |
|---|---|---|
| Iop (80 PV) | 47 % | 24 % |
| Crâ (70 PV) | 55 % | 40 % |

- Crâ remis à 70 PV : avec ses vrais sorts, il était passé devant le Iop.
- La voie multi (Microplie 2+ pièces ou prisme) apparaît dans ~15 % des runs du bot.
- Reste à surveiller : le Iop est un peu derrière le Crâ ; toujours aucune panoplie 4 pièces dans l'acte 1.

## Endpoints Spire Codex utiles pour la suite
`/api/characters` (PV et decks de départ), `/api/acts` (structure de la carte), `/api/runs/stats/...`
(taux de victoire communautaires), `/api/intents`, `/api/keywords`.

## Objets à effets tirés (refonte du 30/10/2026)

Chiffrage par simulation (`node src/sim/calibrate.ts N [triggers|rewards|prosp|rules|rarity]`) : le bot joue des runs
complètes sans objets avec un seul effet ajouté, mêmes graines pour toutes les configurations ; on mesure l'étage moyen.
Étalon : « au début de chaque tour, inflige n dégâts » → **1 point ≈ 0,107 étage**.

Principaux enseignements (4 000 runs pour les déclencheurs, 1 000 pour les récompenses) :
- Ce qui protège les PV vaut bien plus qu'un dégât : soin ≈ 2,8 points par PV, bouclier 2,2, armure 1,8, esquive 9 par charge.
  Les PV sont la ressource de la run.
- La pioche vaut peu pour le bot (≈ 1,1) ; on la chiffre à 2 pour un joueur humain.
- Brûlure et poison posés une fois par tour valent ≈ 0,5-0,7 par point (dégâts en fin de round, absorbés pour la brûlure) ;
  leur valeur croît avec la pile, d'où des plafonds (4 brûlure, 6 poison par déclenchement).
- Déclencheurs élémentaires (deck orienté) : « une carte X » ≈ 3 par combat, « première carte X du tour » ≈ 2,4,
  « 2e carte X du tour » ≈ 0,6 (0,8 retenu pour un joueur qui construit sa voie), « première carte X du combat » ≈ 1,6.
- Prospection : +50 ≈ 6,6 points, +100 ≈ 10 points → 8 prospection par point de budget.
- Légendaires : les règles « build-around » (brûlure tenace, air perçant, étourdi fragile…) valent ≈ 0 seules, c'est
  voulu ; les plus fortes seules : première carte moins chère (ramenée de 0 PA à -1 PA après mesure à 43), +1 PA (24),
  première carte lancée deux fois (23), ricochet (17), Eau vampire (13).
- Effets tirés au hasard, deck non orienté : commun ≈ 2,8 points, rare ≈ 6,4, mythique ≈ 9,8 (≈ 55 % du budget, car
  la moitié des effets parlent d'un élément ou d'une condition que le deck du bot ne remplit pas).

Runs complètes (1 500 runs, bot glouton, chemin au hasard) : sans objets 0-1 % de victoires sur le boss ; avec objets
Iop 34 %, Crâ 43 % ; ≈ 3,6 objets portés (1,9 commun, 1,4 rare, 0,6 mythique, 0,2 légendaire).

## Trois actes, calés sur Slay the Spire 2 (30/10/2026, après retour de jeu : « trop simple »)

Médianes StS2 par acte et type de salle (exports Spire Codex) comparées aux nôtres après mise à l'échelle
(`TIER_SCALE` dans `src/data/monsters.ts`, un coefficient PV et dégâts par acte et par salle) :

| Acte | Salle   | PV StS2 | PV nous (avant → après) | Coup max StS2 | Coup max nous |
|------|---------|---------|-------------------------|---------------|---------------|
| 1    | faible  | 42      | 35 → 39                 | 11            | 7             |
| 1    | normale | 74      | 60 → 70                 | 12            | 9             |
| 1    | élite   | 82      | 80 → 80                 | 15            | 15            |
| 1    | boss    | 231     | 195 → 224               | 17            | 16            |
| 2    | faible  | 83      | 59 → 82                 | 18            | 13            |
| 2    | normale | 128     | 90 → 118                | 16            | 15            |
| 2    | élite   | 145     | 125 → 142               | 15-21         | 21            |
| 2    | boss    | 379     | 299 → 380               | 28            | 30            |
| 3    | faible  | 96      | 80 → 92                 | 14            | 16            |
| 3    | normale | 150     | 114 → 151               | 18            | 21            |
| 3    | élite   | 276     | 180 → 285               | 35            | 34            |
| 3    | boss    | 556     | 365 → 557               | 25-32         | 33            |

Nos actes 2 et 3 étaient 25 à 35 % plus faibles que StS2 : c'est corrigé. Nos rencontres comptent souvent un monstre
de plus, d'où des dégâts cumulés un peu plus hauts pour un coup max un peu plus bas.

**Limite par objet** (remplace les plafonds globaux, retirés à la demande : les gros builds font partie du jeu) :
un même objet ou Dofus se déclenche au plus **3 fois par tour** ; **une fois** pour la pioche, les PA et les réductions
de coût. Aucune limite de pile pour la brûlure ou le poison, et les objets se cumulent librement entre eux.
L'objet l'indique dans son texte quand son déclencheur peut survenir plusieurs fois dans un tour, et le tirage chiffre
sa fréquence en conséquence (au plus limite × 4,5 tours par combat). Valeurs relevées dans le tirage : pioche 3,5
(max 2 par déclenchement), PA 7 (max 1), réduction 6 (max 1), brûlure et poison 1,6 (max 3 et 4), en zone 2,8.

Bot glouton (cartes au hasard), 800 runs, avec objets, après calage : boss 1 battu 10 % (Iop) / 18 % (Crâ),
boss 2 1 % / 8 %, boss 3 0 % / 2 %. Le bot joue nettement moins bien qu'un humain : ces chiffres servent à comparer
des réglages entre eux, pas à fixer la difficulté.

## Bestiaire ×3 et mécaniques (30/10/2026)

150 monstres, 30 à 40 rencontres par acte, 5 à 6 élites et 3 boss par acte. Les PV médians restent alignés sur StS2
(acte 1 : faible 39, normale 67, élite 77, boss 218 ; acte 2 : 83 / 133 / 155 / 380 ; acte 3 : 98 / 141 / 254 / 557).

Les mécaniques ajoutent de la difficulté à PV égaux (invocations, divisions, régénération). Réglage rencontre par
rencontre avec le taux de mort du bot sur 1 500 runs complètes (`/tmp/encstats.ts`, à reprendre en outil) :
acte 1 normales 5-33 % (outliers corrigés : Prespic + Tofus, Bouftons, Champa Explosif, Tofus Maléfiques),
élites 19-44 %, boss 34-66 % ; acte 2 élites 14-50 %, boss 14-28 %. Corrections faites : Gardienne Champêtre
(appelait 2 Campagnolls par cycle, 0 % de victoire), Tournesol (régénération 5 → 2), épines du Prespic 2 → 1,
Chef Crocodaille (PV et rage), Wa Wabbit (1 Wabbit appelé), Abraknyde Ancestral (une seule branche), Bouftou Royal et
Shin Larve (seconde phase moins forte).

Bot glouton, 800 runs avec objets : boss 1 battu 8 % (Iop) / 15 % (Crâ), boss 2 1 % / 5 %, boss 3 0 % / 1 %.

## Passifs de classe et 52 cartes (30/10/2026)

Bot glouton, 300 runs par ligne, objets compris, nouvelles cartes dans le pool. Taux d'atteinte des boss 1 / 2 / 3.

| Classe | Sans passif | Courroux 3 / Visée 4 | Courroux 2 / Visée 5 | Retenu : Courroux 3 / Visée 5 |
|---|---|---|---|---|
| Iop | 9 % / 0 % / 0 % | 18 % / 2 % / 0 % | 22 % / 3 % / 0 % | 18 % / 2 % / 0 % |
| Crâ | 10 % / 1 % / 0 % | 30 % / 8 % / 1 % | 19 % / 3 % / 0 % | 19 % / 3 % / 0 % |

Visée toutes les 4 attaques valait près d'un tiers de dégâts d'attaque en plus : trop fort face au Courroux. Courroux à 2 attaques revenait à une Forme démoniaque gratuite (+1 puissance quasiment chaque tour) : trop fort pour un joueur humain dans les longs combats de boss. On garde 3 attaques et 5 tirs, ce qui remet les deux classes à égalité.

Repères des nouvelles cartes : mêmes que le reste (0 PA ≈ 3-4 dégâts, 1 PA ≈ 6-8, 2 PA ≈ 10-15). Les cartes à bonus partent plus bas (Massacre : 2 dégâts +3 par attaque déjà jouée). Les pouvoirs coûtent ce que coûtent leurs effets d'objet de rareté équivalente.

## Sorts inventés (31/10/2026)

Même bot, 300 runs par classe, passifs actifs. Boss 1 / 2 / 3 atteints : Iop 16 % / 2 % / 0 % (avant : 18 / 2 / 0), Crâ 14 % / 2 % / 0 % (avant : 19 / 3 / 0). La légère baisse vient surtout de la dilution du deck : le bot joue mal les cartes à condition et les combos. Repères : Enchaînement et Tir d'Exécution valent une attaque à 1 PA de 6-7 dégâts qui double dans le bon cas ; Pacte de Sang et Dédoublement sont rares et épuisés.

## Cartes recalées sur Slay the Spire 2 (31/10/2026)

Repères recalculés sur toutes les attaques des 5 personnages de StS2 (dégâts × coups, médianes) :

| Coût | Cible unique | Zone |
|---|---|---|
| 0 | 6 | 5 (petit échantillon) |
| 1 | 8 (6–10) | 8 |
| 2 | 13 (10–15) | 14 et plus |
| 3 | 19 (15–27) | — |

Nos cartes de récompense étaient en dessous : 0 PA ≈ 3–4, 1 PA ≈ 5–6, 2 PA ≈ 10, zones à 1 PA ≈ 4. Les monstres étant déjà calés sur StS2, c'est ce qui rendait les combats longs et les decks peu puissants.

- **59 cartes relevées** par une règle unique : cible 6 / 9 / 14 / 24 et zone 5 / 8 / 14 selon le coût, moins la moitié de la valeur des effets annexes (brûlure, poison, armure, pioche…), vol de vie compté ×1,25. Jamais en dessous de la valeur d'avant, jamais plus du double. Les améliorations suivent (+30 % au moins, +2 au minimum).
- **Scaling renforcé** : Puissance (Iop) +3 / +4, Tirs Puissants (Crâ) +2 / +3, Furie Écarlate +2 puissance par tour. Les cartes à bonus grossissent plus vite : Massacre 3 +4 par attaque, Fureur 8 +5 par lancer, Déferlement 14 +3 par puissance, Explosion de Rage 10 +8 par puissance, Tir Chargé 6 +8 par cran de Visée, Flèche Massacrante 9 +4 par ennemi, etc.
- Les cartes de base (Coup d'épée/d'arc 6, Vitalité/Tir de Repli 5) restent sur les Frappe et Défense de StS.

Effet (bot, 300 runs par classe, boss 1 / 2 / 3 atteints) : Iop 16 / 2 / 0 % → **25 / 4 / 0 %**, Crâ 14 / 2 / 0 % → **34 / 9 / 3 %**. Le Crâ profite davantage (zones, poison, Visée qui double des coups plus gros) : à surveiller en jeu.

## Rage, Colère et résistances réelles (31/10/2026)

- **Rage** : +n puissance toutes les 4 cartes que joue le joueur (au lieu de chaque compétence). **Colère** : +n puissance toutes les 3 attaques jouées (au lieu de chaque perte de PV). Les monstres à coups multiples (Chef Crocodaille, Bworkette…) ne s'emballent plus ; un compteur sur l'icône indique combien de cartes restent avant le prochain gain.
- **Résistances** : fin du tout-ou-rien (×1,5 / ×0,5). Chaque monstre porte ses pourcentages réels de Dofus dans les cinq éléments, neutre compris : 20 % = −20 % de dégâts, −10 % = +10 %, 100 % = insensible. En moyenne : 18,6 % en neutre, 10 à 13 % par élément.
- Les monstres en deviennent plus solides d'environ 13 % : leurs PV sont multipliés par 0,88 (`RES_HP`) pour garder la même durée de combat.
- Bot, 300 runs : Iop 28 / 3 / 0 %, Crâ 35 / 8 / 0 % (avant : 25 / 4 / 0 et 34 / 9 / 3).

## Dieux et événements (31/10/2026)

Bot (choix au hasard parmi les bénédictions et les options possibles), 300 runs par ligne, part des runs qui battent le boss 1 / le boss 2 / gagnent :

| | Iop | Crâ |
|---|---|---|
| Événements, sans dieux | 33 / 5 / 1 % | 33 / 8 / 2 % |
| Événements et dieux | 49 / 16 / 3 % | 42 / 18 / 4 % |

Les dieux jouent le rôle de la bénédiction de Neow dans Slay : un vrai coup de pouce de départ, choisi par le joueur. Comme le bot choisit au hasard, un joueur qui choisit bien en tirera plus. Pas encore de mesure bénédiction par bénédiction.

## Rééquilibrage après les dieux et les événements (31/10/2026)

Les bénédictions et les événements rendaient la run nettement plus facile (bot : 46 % au-delà du boss 1, 17 % au-delà du boss 2, 5 % de victoires). Retour à une difficulté proche de l'avant, un peu plus ouverte sur l'acte 3. Multiplicateurs (`echelle_monstres` de `equilibrage.json`) :

| | avant | après |
|---|---|---|
| Acte 1, PV (faible / normal / élite / boss) | 1,012 / 1,056 / 0,88 / 1,012 | 1,11 / 1,18 / 0,97 / 1,13 |
| Acte 2, dégâts (faible / normal / élite / boss) | 1,3 / 1,15 / 1,05 / 1 | 1,43 / 1,265 / 1,155 / 1,1 |
| Acte 3, dégâts (faible / normal / élite / boss) | 0,95 / 1 / 1 / 1 | 1,045 / 1,1 / 1,1 / 1,1 |

Bot, 600 runs par classe sur deux jeux de graines, part des runs qui battent le boss 1 / le boss 2 / gagnent :

| | Iop | Crâ |
|---|---|---|
| Dieux et événements, ancienne échelle | 47 / 16 / 5 % | 45 / 19 / 5 % |
| Nouvelle échelle | 35 / 8 / 3 % | 36 / 11 / 3 % |
| Pour mémoire, avant dieux et événements | 28 / 3 / 0 % | 35 / 8 / 0 % |

Les morts se répartissent ainsi : environ 60 % dans l'acte 1 (surtout les combats normaux et le boss), 25 % dans l'acte 2, 7 % dans l'acte 3. Outil de mesure : `botRun` renvoie maintenant `diedAt` (acte et palier du combat perdu).

## Après le poison en début de tour, le plafond de résistances et les nouveaux événements (31/10/2026)

Bot, 300 runs par classe, boss 1 / boss 2 / victoire : Iop 34 / 8 / 2 %, Crâ 39 / 14 / 3 %. Proche de la cible fixée plus tôt (≈ 35 / 10 / 3 %) ; le Crâ profite un peu du poison qui frappe avant l'action du monstre. Échelle des monstres inchangée.

## Sorts du Iop et du Crâ, rencontres hors salle (31/10/2026)

Les attaques sont déjà sur les repères du 31/10 (cible 6 / 9 / 14 / 24, zone 5 / 8 / 14, annexes comptées à moitié, amélioration +30 % ou +2). On n'a pas réécrit le catalogue. L'écart mesuré n'est pas un sort isolé trop gros : sur 300 runs, boss 1 / 2 / victoire, le Iop est à 37 / 8 / 3 % et le Crâ à 35 / 16 / 5 %. L'acte 1 est équivalent. L'écart est l'acte 2, où le poison de zone touche plusieurs monstres et où la Visée tombe souvent.

Passer la Visée de 5 à 6 attaques a été mesuré à part et **laissé de côté** : le Crâ tombe à 31 / 13 / 3 % et passe sous le Iop en étages (14,1 contre 14,5). L'acte 1 paie trop, et l'acte 2 reste devant. Le choix du 30/10 (Courroux 3, Visée 5) tient.

Après les corrections de cartes et de monstres ci-dessous (Visée toujours à 5), 300 runs : Iop 35 / 8 / 3 %, Crâ 34 / 14 / 5 %. L'acte 1 se rejoint. L'acte 2 du Crâ ne bouge quasiment pas : le poison de zone et les +1 des zones du Iop sont trop petits pour le bot. L'écart d'acte 2 reste ouvert.

Corrections retenues, dans `cards.ts` et `equilibrage.json` :

| Carte | Avant | Après |
|---|---|---|
| Rassemblement, Tannée, Fustigation (zones du Iop à 1 PA, en dessous du repère 8) | 6, amélioration 8 ou 9 | 7, amélioration 10 |
| Flèche Ralentissante | poison 3 / 4 à tous | poison 2 / 3 |
| Pluie Empoisonnée | poison 4 / 6 à tous | poison 3 / 4 |

Rencontres trop loin de la médiane de leur salle (PV ou coup), ramenées vers elle. Les Gelées gardent leur division : seul le coup de masse baisse, il dépassait le coup des autres salles normales.

| Monstre | Avant | Après |
|---|---|---|
| Gelées (masse) | 11 | 9 |
| Tofu Maléfique, Tofu Noir | 16–20 PV | 24–28 |
| Kwak de Terre | 30–34 PV | 42–48 |
| Crabe | 36–40 PV, pince 10 | 48–54, pince 12 |
| Rat d'Égoutant | 40–46 PV, morsure 10 | 52–60, morsure 14 |
| Ramane d'Égoutant | griffe 12 | 16 |
| Corbac Chef | 56–60 PV | 70–76 |
| Corbac Dressé | 46–50 PV, plongeon 16 | 58–64, plongeon 20 |

## Zones du Crâ (31/10/2026, 600 runs)

La passe du 31/10 (poison −1, trois zones du Iop +1, huit monstres) ne fermait pas l'acte 2. Sur 600 runs, graines 1 à 600, boss 1 / boss 2 / victoire : Iop 37 / 9 / 3 % (étage moyen 14,53), Crâ 39 / 16 / 4 % (étage moyen 15,63). L'écart est d'environ 0,8 étage, concentré sur les salles à plusieurs ennemis. Aucune rencontre précise n'en est la cause.

Ce qui a été mesuré et écarté, parce que l'acte 1 paie trop ou que l'acte 2 ne bouge pas : Visée à 6 attaques, Courroux à +2 puissance, PV du Crâ à 66 ou 68, PV des couloirs de l'acte 2 ×0,85, poison de toutes les cartes du Crâ −1. Baisser toutes les zones du Crâ de 2 dégâts est le seul levier qui remet les étages au même niveau sans casser l'acte 1.

Après cette baisse (Visée toujours à 5, même échelle de monstres), 600 runs : Iop 37 / 9 / 3 % (14,53), Crâ 35 / 12 / 2 % (14,58). L'acte 1 reste proche. L'écart de boss 2 passe de 7 points à 3. Les victoires se rejoignent (3 % et 2 %). Les sorts de zone passent sous le repère 8 / 14 : c'est voulu, le repère compte un seul impact, pas une salle de l'acte 2.

| Carte | Dégâts avant | Après |
|---|---|---|
| Pluie de Flèches | 8 / 11 | 6 / 9 |
| Œil de Taupe (drain) | 6 / 10 | 4 / 8 |
| Flèche Explosive | 14 / 20 | 12 / 18 |
| Carreaux Destructeurs | 12 / 16 | 10 / 14 |
| Flèche de Dispersion | 7 / 10 | 5 / 8 |
| Flèche Ralentissante | 10 / 14 | 8 / 12 |
| Flèche de Barrage | 6 / 8 | 4 / 6 |
| Flèche Éclatante | 6 / 8 | 4 / 6 |
| Flèche Massacrante | 9 / 12 | 7 / 10 |
| Pluie Empoisonnée | 8 / 10 | 6 / 8 |

Le poison, la brûlure et l'armure de ces cartes ne changent pas. L'amélioration reste au moins +30 % ou +2.

## Bénédictions une par une (31/10/2026)

`node src/sim/boons.ts 200` : 200 runs Iop et 200 runs Crâ par bénédiction, mêmes graines, sans autre dieu. Référence sans bénédiction : étage moyen 11,36, boss 1 / 2 / 3 battus 22 % / 5 % / 1 %. L'écart se lit en étages (0 à 39). Le bot choisit ses cartes au hasard : les bénédictions de cartes (Tirage chanceux, Carquois sans fond) restent dans le bruit (±0,6 étage). On n'y touche pas.

Trois valeurs numériques sortaient du peloton (les autres fortes sont entre +3 et +4 étages) :

| Bénédiction | Avant | Après | Mesure après (200 × 2) |
|---|---|---|---|
| Bouclier Féca | 18 bouclier en début de combat (+10,4 étages) | 6 | +5,0 étages, boss 1 à 45 % |
| Mot de régénération | 2 soins par tour (+6,5) | 1 | +3,2 étages, boss 1 à 38 % |
| Horloge | +1 PA et pioche 2 au premier tour (+4,8) | +1 PA et pioche 1 | +3,7 étages, boss 1 à 38 % |

Règles trop fortes, laissées telles quelles parce qu'elles sont aussi des effets d'objets ou de Dofus : Bond `premier_double` (+10,8), Sang bouillant `sang` (+10,1), Frappe de Xélor `premiere_gratuite` (+7,2). Juste en dessous, assumées : Neuf vies (+5,5, une résurrection), Invisibilité (+5,0, une esquive).

Les 18 reliques et les 45 événements sont dans `equilibrage.json` (sections `reliques` et `evenements`), même forme que les bénédictions pour les effets, et `operations` pour les prix, gains et chances. Les textes des événements restent dans le code.



## Le Xélor (31/10/2026, 1000 runs, lot 1)

Mesure avec le bot (graines 1 à 1000, objets, boss 1 / boss 2 / victoire, étage moyen) : Iop 38 / 8 / 2 % (14,6), Crâ 34 / 12 / 3 % (14,6), Xélor 39 / 12 / 2 % (15,2), après la fusion de la passe de Grok sur les bénédictions, reliques et événements. Le Xélor se place entre les deux.

Le bot pose le Téléfrag avant d'attaquer (la marque vaut plus quand une attaque reste en main) : sur 200 combats de départ contre deux Bouftous, le passif pioche 0,59 fois par tour, presque chaque fois que la Frappe de Xélor est en main.

Premier essai avec Conservation à 1 PA et 5 armure (comme la défense du Iop et du Crâ) : Xélor 11 / 3 / 0 % (8,3 étages). Toutes les cartes de départ coûtaient 1 PA : avec 3 PA et 5 cartes en main, la carte piochée par le passif ne se jouait jamais. Conservation reprend le coût de son sort (2 PA dans Dofus, donc 0) avec 3 armure (5 améliorée).

### Lot 2 (58 cartes, 1000 runs)
Boss 1 / boss 2 / victoire : Iop 38 / 8 / 2 % (14,6), Crâ 34 / 12 / 3 % (14,6), Xélor 36 / 12 / 2 % (14,7). Les 8 nouvelles cartes diluent un peu les récompenses du Xélor (−3 points au boss 1 par rapport au lot 1) ; il reste entre le Iop et le Crâ, aucune valeur n'a été retouchée.

## Table à plusieurs joueurs (31/10/2026)

Le mode n'est pas encore jouable. L'échelle est dans `echelle_joueurs` et `scaleForParty`. Un combat seul ne l'utilise pas.

Les joueurs jouent **en même temps**. Chacun a ses PV, son deck et ses 3 PA, et tout se résout dans la même phase. Les monstres jouent ensuite **une fois**, comme en solo. Pas un tour par joueur, et pas une action de monstre par joueur : une première version le faisait, elle est retirée.

| Joueurs | PV | Dégâts |
|---|---|---|
| 1 | ×1 | ×1 |
| 2 | ×1,85 | ×1 |
| 3 | ×2,70 | ×1 |
| 4 | ×3,55 | ×1 |

Les PV valent un joueur de plus, moins 15 %. Quatre personnes qui frappent avant que le monstre n'agisse tuent un peu plus vite que quatre combats séparés : le poison, la puissance et la vulnérabilité tombent sur les mêmes corps.

Les dégâts ne bougent pas. Un coup vise une seule personne. Le plus gros du jeu, une élite d'acte 3, fait déjà 40 pour 70 PV. Le monter frapperait plus fort quelqu'un qui n'a pas eu de phase de plus pour se défendre : tout le monde a déjà joué. La colonne `degats` reste dans le fichier pour un réglage plus tard. Elle ne doit pas servir à compenser le nombre de joueurs.

Repère, acte 1 salle normale (médiane 65 PV). Un Iop avec le deck de départ la finit en 4 tours, environ 15 PV retirés par tour (24 graines, 96 % de victoires), et les monstres frappent 4 fois. À quatre joueurs la salle passe à 231 PV. Quatre fois 15 PV dans la même phase, soit 60, la finissent en 4 rounds aussi. Les monstres frappent toujours 4 fois dans la partie, pas 16. La personne visée encaisse à peu près ce qu'elle encaissait seule. Les autres non : une table est plus à l'aise qu'un joueur seul, et c'est le fait de jouer ensemble, pas un trou dans les PV.

À deux joueurs, 120 PV et deux fois 15 PV par round : encore 4 rounds.

Ce qu'il ne faut pas faire : multiplier les dégâts par le nombre de joueurs. ×4 sur le coup de 40 fait 160, plus du double des PV d'un Crâ. Ni faire jouer les monstres une fois par joueur : avec des joueurs simultanés, ce serait quatre fois plus de coups pour une seule phase de cartes.

Pour brancher le mode : `scaleForParty(TIER_SCALE[acte][salle], joueurs)` donne les PV et les dégâts à passer au combat. La phase des monstres reste unique. Au-delà de 4 joueurs, on reste à 4.
