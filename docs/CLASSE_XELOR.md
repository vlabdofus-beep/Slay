# Proposition : le Xélor, troisième classe

Statut : **lot 1 intégré** (31/10/2026, branche `ia-claude/classe-xelor`) : 50 cartes jouables. Lot 2 à faire.
Écarts avec la v2 : Conservation coûte 0 PA et donne 3 armure (5 améliorée), mesuré au bot (voir `docs/BALANCE.md`) ;
Complice et Synchro coûtent 0 (2 PA dans Dofus) ; les dégâts de Synchro sont neutres.

## L'idée en une phrase
Le Iop frappe fort, le Crâ prépare ses tirs ; le Xélor **dérègle le temps** : il marque ses ennemis d'un Téléfrag,
le consomme pour piocher, ralentit les monstres et leur prépare des dégâts à retardement.

## Volume (aligné sur les classes existantes)
| | Iop | Crâ | Xélor |
|---|---|---|---|
| Cartes tirées de vrais sorts | 44 | 44 | 44 (tous les sorts du Xélor de Dofus 3) |
| Coup d'arme de base | 1 | 1 | 1 |
| Sorts inventés | 14 | 13 (dont 1 carte créée en combat) | 13 (dont 1 carte créée en combat) |
| **Total** | **59** | **58** | **58** |
| Pouvoirs | 6 | 6 | 6 |
| PV de départ | 80 | 70 | 70 |

Le coût vient des PA réels du sort dans Dofus 3 (1-2 PA → 0, 3 → 1, 4-5 → 2, 6+ → 3), lus dans les données de
Dofdle. Le Xélor a beaucoup de sorts à 2 PA : son deck compte une vingtaine de **petites cartes à 0 PA**, plus faibles
à l'unité. Sa signature est de jouer beaucoup de cartes par tour : c'est pour ça que son passif donne de la pioche,
pas des PA.

## Le passif : Téléfrag
> **Téléfrag** : certains sorts posent un Téléfrag sur leur cible. Quand tu frappes un ennemi Téléfrag, l'état est
> consommé ; la première fois de chaque tour, **pioche 1 carte**.

- Un ennemi a un Téléfrag ou pas (pas de cumul). Il le garde jusqu'à ce qu'on le consomme.
- Les sorts qui, dans Dofus, « peuvent générer un Téléfrag » le posent ; ceux qui « consomment l'état » ont un bonus
  si la cible est Téléfrag. La consommation a lieu après la carte : le bonus et la pioche se cumulent.
- Le deck de départ l'active dès le premier tour : Frappe de Xélor pose le Téléfrag, n'importe quelle attaque le
  consomme.
- Le PA du Xélor de Dofus reste sur **deux cartes rares** qui consomment le Téléfrag (Clepsydre, Dessèchement),
  jamais sur le passif.
- Réglable dans `equilibrage.json` (cartes piochées, nombre de fois par tour).

## Deux statuts nouveaux
| Statut | Règle | Sorts Dofus d'origine |
|---|---|---|
| **Ralenti** (le retrait de PA) | La prochaine attaque du monstre inflige N dégâts de moins **au total** (retirés coup par coup jusqu'à épuisement de N), puis le statut disparaît. **Ne s'additionne pas** : un nouveau ralenti remplace l'ancien s'il est plus fort. | Ralentissement, Horloge, Clepsydre, Gousset, Flou Temporel, Rouille |
| **Échéance** (dégâts à retardement) | À la fin de son prochain tour, le monstre subit N dégâts Feu (son armure absorbe), puis le statut disparaît. S'additionne comme la brûlure. | Sablier de Xélor, Gousset, Sablier Brisé |

Le ralenti ne s'additionne pas plutôt que d'avoir un plafond (les plafonds de piles sont écartés dans la feuille de
route) : deux Ralentissement à 2 font un ralenti 2, pas 4.

## Deck de départ (10 cartes, comme les autres)
| Carte | Nb | Coût | Effet (amélioré) |
|---|---|---|---|
| Coup de baguette | 5 | 1 | 6 dégâts (9) |
| Conservation | 4 | 0 | 3 armure (5) |
| Frappe de Xélor (signature Terre) | 1 | 1 | 6 Terre, pose un Téléfrag (8) |

## Livraison en deux lots
- **Lot 1** : import des sorts du Xélor dans `dofus.json`, passif Téléfrag, ralenti, échéance, leurs tests, le bot qui
  pose puis consomme, l'écran d'accueil. La classe est jouable avec **50 cartes**.
- **Lot 2** : les effets différés et le temps qui revient en arrière (« au prochain tour », reprendre la dernière
  carte jouée, regagner les PV perdus, revenir en main), leurs tests, puis les **8 cartes** qui en dépendent
  (marquées ② ci-dessous).

## Les cartes
Légende : **T** = pose un Téléfrag sur la cible (**T tous** : sur tous les ennemis) ; « si T » = bonus si la cible
est Téléfrag ; ② = lot 2. Valeurs de départ, à régler au bot.

### Eau : ralentir, voler la vie
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Ralentissement | attaque | 0 | commune | 4 Eau, ralenti 3 | 6, ralenti 4 |
| Gelure | attaque | 0 | commune | 4 Eau, T | 6, T |
| Compte-goutte | attaque | 1 | commune | 7 Eau, 4 armure, T | 10, 5 armure |
| Pétrification | attaque | 2 | commune | 11 Eau, ralenti 4 ; si T : ta prochaine carte coûte 1 PA de moins | 15, ralenti 5 |
| Clepsydre ② | attaque | 2 | rare | 10 Eau, ralenti 4 ; si T : +1 PA au prochain tour | 14, ralenti 5 |
| Permutation | attaque | 2 | rare | vole 11 PV (Eau), T | vole 15 |
| Flou Temporel | compétence | 0 | commune | ralenti 3 à tous les ennemis | ralenti 4 |

### Feu : échéances et zones
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Sablier de Xélor | attaque | 0 | commune | 3 Feu, échéance 5 | 4, échéance 7 |
| Réfraction | attaque | 0 | commune | 4 Feu ; si T : Téléfrag recopié sur tous les ennemis | 6 |
| Perturbation | attaque | 1 | commune | vole 6 PV (Feu), T | vole 9 |
| Sables du Temps | attaque | 2 | commune | 6 Feu ×2, T | 8 ×2 |
| Poussière | attaque | 2 | commune | 10 Feu à tous | 14 |
| Rayon Obscur | attaque | 2 | rare | 8 Feu à tous, +5 par ennemi Téléfrag (les consomme) | 11, +7 |

### Terre : coups lourds et aiguilles
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Aiguille | attaque | 0 | commune | 3 poison ; si T : 5 Terre | 4 poison ; 7 Terre |
| Régulateur ② | attaque | 1 | commune | 7 Terre ; si T : revient dans ta main | 10 |
| Engrenage | attaque | 1 | commune | 5 Terre à tous, T tous | 7 à tous |
| Horloge | attaque | 2 | commune | 10 Terre, ralenti 3 ; si T : +6 dégâts | 13, ralenti 4 ; +8 |
| Rouage | attaque | 2 | rare | vole 8 PV à tous (Terre) | vole 11 |
| Glas | attaque | 1 | rare | 4 dégâts à tous, +4 par Téléfrag consommé **ce tour** | 5, +5 |

### Air : Téléfrag qui paie
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Souvenir | attaque | 0 | commune | vole 3 PV (Air), T | vole 5 |
| Gousset | attaque | 0 | commune | 3 Air, ralenti 2 ; si T : échéance 6 | 4, ralenti 2 ; échéance 8 |
| Flétrissement | attaque | 1 | commune | 6 Air ; si T : 6 Air de plus | 8 ; 8 |
| Dessèchement | attaque | 2 | rare | 9 Air ; si T : +1 PA | 12 |
| Distorsion | attaque | 2 | rare | 11 Air à tous, T tous | 15 à tous |
| Pendule | attaque | 2 | rare | 12 Air, 4 armure, T | 16, 6 armure |

### Le temps (neutre)
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Téléportation | compétence | 0 | commune | 3 armure, T | 5 armure |
| Astrolabe | compétence | 0 | commune | T, pioche 1 | T, pioche 1, 3 armure |
| Espace-temps | compétence | 0 | commune | T, 3 renvoi | T, 5 renvoi |
| Paradoxe | compétence | 0 | commune | recopie le ralenti de la cible sur tous les ennemis | et ralenti 2 à la cible d'abord |
| Désynchronisation | compétence | 0 | commune | T tous, épuisée | T tous, pioche 1, épuisée |
| Momification | compétence | 0 | rare | 1 esquive, épuisée | et pioche 1 |
| Rémanence | compétence | 1 | commune | T, 1 vulnérabilité | T, 2 vulnérabilité |
| Vingt-cinquième Heure | compétence | 1 | rare | étourdit tous les ennemis Téléfrag (les consomme), épuisée | coûte 0 |
| Fuite du Temps ② | compétence | 0 | commune | 4 armure, 4 armure au prochain tour | 6 / 6 |
| Prémonition ② | compétence | 0 | commune | au prochain tour, pioche 2 | pioche 3 |
| Faille ② | compétence | 2 | rare | 12 armure, 6 armure au prochain tour | 15 / 8 |
| Rembobinage ② | compétence | 0 | rare | reprends en main la dernière carte jouée ce tour, épuisée | sans épuisement |
| Raulebaque ② | compétence | 0 | rare | regagne les PV perdus pendant le dernier tour des monstres, épuisée | et 4 armure |

### Pouvoirs
| Carte | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|
| Complice | 0 | commune | au début de ton tour, 2 renvoi | 3 renvoi |
| Cadran de Xélor | 1 | rare | au début de ton tour, pose un Téléfrag sur un ennemi au hasard | et 3 armure |
| Synchro | 0 | rare | la première fois de chaque tour que tu consommes un Téléfrag : 4 dégâts neutres à tous les ennemis | 6 |
| Instabilité | 1 | rare | la première fois de chaque tour que tu consommes un Téléfrag : ralenti 2 à tous les ennemis | ralenti 3 |

### Sorts inventés (13)
Ils couvrent ce que les vrais sorts ne font pas. Icône empruntée à un sort proche, comme pour le Iop et le Crâ.
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Seconde (créée en combat) | attaque | 0 | — | 3 dégâts, T, épuisée | 5 |
| Tic-Tac | compétence | 1 | commune | crée 2 Secondes en main | 3 Secondes |
| Aiguille des Heures | attaque | 1 | commune | 8 Terre ; si T : 8 Terre de plus | 10 / 10 |
| Aiguille des Minutes | attaque | 0 | commune | 3 Air ×2, T | 4 ×2 |
| Contretemps | attaque | 1 | commune | 7 Eau ; si la cible est ralentie : pioche 1 | 10 |
| Rouille | compétence | 1 | commune | 2 érosion, ralenti 3 | 3 / 4 |
| Instant Suspendu | compétence | 1 | commune | 8 armure, conservée en main | 11 |
| Sablier Brisé | attaque | 1 | rare | 5 Feu, puis la cible subit tout de suite son échéance | 8 |
| Arrêt du Temps | compétence | 2 | rare | ralenti 10 à tous les ennemis, épuisée | ralenti 14 |
| Dernière Seconde | compétence | 0 | rare | pioche 1 ; si tes PV sont bas : +2 PA, épuisée | pioche 2 |
| Horloge Interne | pouvoir | 1 | commune | quand tu consommes un Téléfrag, gagne 3 armure | 4 |
| Boucle Temporelle | pouvoir | 1 | rare | toutes les 3 cartes jouées, pioche 1 | coûte 0 |
| Écho Temporel ② | compétence | 1 | rare | +1 PA au début de tes 2 prochains tours, épuisée | coûte 0 |

## Ce qui a changé depuis la v1 (relecture de Grok)
- Passif : **pioche 1** au lieu de +1 PA. Le PA reste sur Clepsydre et Dessèchement (rares, il faut un Téléfrag).
- Ralenti : réduit **le total** de la prochaine attaque, et ne s'additionne pas. Paradoxe ne le double plus, il le
  recopie sur tous les ennemis.
- Étourdissement : on garde **Vingt-cinquième Heure** (il faut un Téléfrag, la carte s'épuise). Arrêt du Temps
  devient un gros ralenti.
- **Boucle Temporelle** ne rejoue plus la première carte du tour (c'était l'effet de Bond, en permanent) : elle pioche
  1 toutes les 3 cartes.
- **Momification** ne garde plus les PA non dépensés (doublon avec la règle « sablier » des bénédictions) : esquive.
- **Pétrification** et **Flétrissement** ne grandissent plus pour tout le combat : bonus ponctuel si T.
- **Glas** compte les Téléfrag consommés **ce tour**, pas dans tout le combat.
- **Synchro** ne se déclenche qu'une fois par tour.
- Le statut à retardement s'appelle **échéance** : « sablier » est déjà une règle légendaire des bénédictions.
- Livraison en deux lots : d'abord Téléfrag, ralenti et échéance ; le différé et le rembobinage ensuite.

## Ce qu'il faut ajouter au moteur (lot 1)
- Statuts `telefrag`, `ralenti`, `echeance`, avec leurs icônes et leurs bulles d'explication.
- Passif Téléfrag dans `Combat`, avec sa jauge visible comme Courroux et Visée.
- Conditions : cible Téléfrag, cible ralentie. Échelles : ennemis Téléfrag, Téléfrag consommés ce tour.
- Effets : copier un statut sur tous les ennemis (existe déjà pour le poison), faire subir l'échéance tout de suite
  (comme la détonation du poison).
- Déclencheur de pouvoir « quand tu consommes un Téléfrag » (`noRoll` : jamais tiré sur un objet).
- Chaque règle a son test. Les textes des cartes restent générés par `describe.ts`.

## Ce qu'il faut ajouter ailleurs (lot 1)
- Sorts du Xélor dans `dofus.json` (`tools/build-dofus-data.mjs`), **avant** de fixer les chiffres des cartes.
- Classe jouable sur l'écran d'accueil (symbole, personnage Dofus 3 mâle et femelle, voix : déjà disponibles dans
  Dofus Survivors, breed 5).
- `equilibrage.json` : PV de départ, deck de départ, passif, valeurs des cartes, ajoutés sans toucher aux valeurs
  existantes.
- Bot : poser le Téléfrag avant d'attaquer la même cible, garder une attaque pour consommer. Les mesures de
  difficulté du Xélor ne comptent qu'une fois ce séquencement en place.
