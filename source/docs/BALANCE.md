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
