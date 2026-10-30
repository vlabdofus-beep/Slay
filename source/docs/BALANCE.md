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
- **Cartes de base neutres** (sauf la signature) : en v0, l'Iop de départ (tout en Terre) ne battait jamais le boss,
  qui résiste à la Terre. Les voies élémentaires se construisent désormais par les récompenses.
- Monstres d'Amakna refaits sur les repères (8 monstres, 2 élites, 1 boss, 11 rencontres). Chaque élément est la faiblesse
  de 2 monstres et la résistance de 2 autres.
- **Coefficient de difficulté de l'acte 1 : ×0,9** depuis l'arrivée des items (×0,75 avant), provisoire. À ×1, le bot meurt au premier
  élite : il n'a ni relique de départ, ni items, ni potions (supprimées par conception), et il prend ses cartes au hasard.
  On remontera vers ×1 quand les items et panoplies existeront.
- Cra à 75 PV (au lieu de 70) : l'écart avec l'Iop venait surtout des PV.

## Résultats de simulation sans items (×0,75, 500 runs, bot glouton, cartes au hasard) — historique

| Classe | Survit au 1er élite | Atteint le boss | PV à l'arrivée | Bat le boss |
|---|---|---|---|---|
| Iop (80) | 100 % | 92 % | 48 | 31 % |
| Cra (75) | 100 % | 81 % | 43 | 17 % |

PV perdus par combat avec le deck de départ : faible 2–10, normal 10–18, élite 15–29.

À surveiller :
- Le **boss est un mur** (92 % l'atteignent, 31 % le battent). Leviers : ses PV, la récompense d'élite, les items.
- Le Cra reste derrière l'Iop contre le boss.
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
- Le Cra rattrape presque l'Iop une fois équipé.
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

- Crâ remis à 70 PV : avec ses vrais sorts, il était passé devant l'Iop.
- La voie multi (Microplie 2+ pièces ou prisme) apparaît dans ~15 % des runs du bot.
- Reste à surveiller : l'Iop est un peu derrière le Crâ ; toujours aucune panoplie 4 pièces dans l'acte 1.

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
