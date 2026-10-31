# Proposition : le Xélor, troisième classe

Statut : **proposition à valider par le propriétaire** avant intégration (tâche « Concevoir une 3e classe »).
Rien ici n'est encore dans le code.

## L'idée en une phrase
Le Iop frappe fort, le Crâ prépare ses tirs ; le Xélor **dérègle le temps** : il marque ses ennemis d'un Téléfrag,
le consomme pour regagner des PA, ralentit les monstres et joue avec le tour d'après.

## Volume (aligné sur les classes existantes)
| | Iop | Crâ | Xélor |
|---|---|---|---|
| Cartes tirées de vrais sorts | 44 | 44 | 44 (tous les sorts du Xélor de Dofus 3) |
| Coup d'arme de base | 1 | 1 | 1 |
| Sorts inventés | 14 | 13 (dont 1 carte créée en combat) | 13 (dont 1 carte créée en combat) |
| **Total** | **59** | **58** | **58** |
| Pouvoirs | 6 | 6 | 6 |
| PV de départ | 80 | 70 | 70 |

Comme pour les autres classes, le coût vient des PA du sort (1-2 PA → 0, 3 → 1, 4-5 → 2, 6+ → 3).
Le Xélor a beaucoup de sorts à 2 PA : son deck est fait de **nombreuses petites cartes à 0 PA**, plus faibles à
l'unité. C'est sa signature : il joue beaucoup de cartes par tour, et la pioche compte plus que les PA.

## Le passif : Téléfrag
> **Téléfrag** : certains sorts posent un Téléfrag sur leur cible. Quand tu frappes un ennemi Téléfrag, l'état est
> consommé : **gagne 1 PA** (une fois par tour).

- Un ennemi a un Téléfrag ou pas (pas de cumul). Il le garde jusqu'à ce qu'on le consomme.
- Les sorts qui, dans Dofus, « peuvent générer un Téléfrag » le posent ; ceux qui « consomment l'état » ont un bonus
  si la cible est Téléfrag. La consommation a lieu après la carte : le bonus et le PA se cumulent.
- Le deck de départ suffit pour l'activer dès le premier tour : Frappe de Xélor pose le Téléfrag, n'importe quelle
  attaque le consomme.
- Réglable dans `equilibrage.json` (PA gagnés, nombre de fois par tour). Alternative si 1 PA est trop fort :
  « pioche 1 carte ».

## Trois mécaniques nouvelles
| Mécanique | Règle | Sorts Dofus d'origine |
|---|---|---|
| **Ralenti** (statut ennemi, le retrait de PA) | Au prochain tour du monstre, chacun de ses coups inflige N dégâts de moins, puis le statut disparaît. Différent de la faiblesse (-25 %) : très fort contre les coups multiples. | Ralentissement, Horloge, Clepsydre, Pétrification, Gousset, Flou Temporel |
| **Sablier** (statut ennemi) | À la fin de son prochain tour, le monstre subit N dégâts Feu (armure comprise), puis le statut disparaît. | Sablier de Xélor, Gousset |
| **Au prochain tour** | Effets différés : « au début de ton prochain tour, pioche 2 », « +1 PA au prochain tour »… | Prémonition, Clepsydre, Fuite du Temps, Faille |

Plus quelques effets ponctuels : reprendre en main la dernière carte jouée (Rembobinage), récupérer les PV perdus
pendant le tour des monstres (Raulebaque), une carte qui grossit à chaque lancer (Flétrissement), une carte qui
coûte moins cher à chaque lancer (Pétrification).

## Deck de départ (10 cartes, comme les autres)
| Carte | Nb | Coût | Effet (amélioré) |
|---|---|---|---|
| Coup de baguette | 5 | 1 | 6 dégâts (9) |
| Conservation | 4 | 1 | 5 armure (8) |
| Frappe de Xélor (signature Terre) | 1 | 1 | 6 Terre, pose un Téléfrag (8) |

## Les cartes
Légende : **T** = pose un Téléfrag sur la cible (**T tous** : sur tous les ennemis) ; « si T » = bonus si la cible
est Téléfrag. Valeurs de départ, à régler au bot.

### Eau : ralentir, voler la vie
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Ralentissement | attaque | 0 | commune | 4 Eau, ralenti 2 | 6, ralenti 3 |
| Gelure | attaque | 0 | commune | 4 Eau, T | 6, T |
| Compte-goutte | attaque | 1 | commune | 7 Eau, 4 armure, T | 10, 5 armure |
| Pétrification | attaque | 2 | commune | 11 Eau, ralenti 2 ; si T : coûte 1 de moins pour le combat | 15, ralenti 3 |
| Clepsydre | attaque | 2 | rare | 10 Eau, ralenti 2 ; si T : +1 PA au prochain tour | 14, ralenti 3 |
| Permutation | attaque | 2 | rare | vole 11 PV (Eau), T | vole 15 |
| Flou Temporel | compétence | 0 | commune | ralenti 2 à tous les ennemis | ralenti 3 |

### Feu : sabliers et zones
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Sablier de Xélor | attaque | 0 | commune | 3 Feu, sablier 5 | 4, sablier 7 |
| Réfraction | attaque | 0 | commune | 4 Feu ; si T : 4 Feu à tous et Téléfrag recopié sur tous | 6 / 6 |
| Perturbation | attaque | 1 | commune | vole 6 PV (Feu), T | vole 9 |
| Sables du Temps | attaque | 2 | commune | 6 Feu ×2, T | 8 ×2 |
| Poussière | attaque | 2 | commune | 10 Feu à tous | 14 |
| Rayon Obscur | attaque | 2 | rare | 8 Feu à tous, +5 par ennemi Téléfrag (consomme) | 11, +7 |

### Terre : coups lourds et aiguilles
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Aiguille | attaque | 0 | commune | 3 poison ; si T : 5 Terre | 4 poison ; 7 Terre |
| Régulateur | attaque | 1 | commune | 7 Terre ; si T : revient dans ta main | 10 |
| Engrenage | attaque | 1 | commune | 5 Terre à tous, T tous | 7 à tous |
| Horloge | attaque | 2 | commune | 10 Terre, ralenti 2 ; si T : +6 dégâts | 13, ralenti 2 ; +8 |
| Rouage | attaque | 2 | rare | vole 8 PV à tous (Terre) | vole 11 |
| Glas | attaque | 1 | rare | 4 dégâts à tous, +4 par Téléfrag consommé ce combat | 5, +5 |

### Air : Téléfrag qui paie
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Souvenir | attaque | 0 | commune | vole 3 PV (Air), T | vole 5 |
| Gousset | attaque | 0 | commune | 3 Air, ralenti 1 ; si T : sablier 6 | 4, ralenti 1 ; sablier 8 |
| Flétrissement | attaque | 1 | commune | 6 Air ; si T : +3 dégâts pour le reste du combat | 8 ; +4 |
| Dessèchement | attaque | 2 | commune | 9 Air ; si T : pioche 1 | 12 |
| Distorsion | attaque | 2 | rare | 11 Air à tous, T tous | 15 à tous |
| Pendule | attaque | 2 | rare | 12 Air, 4 armure, T | 16, 6 armure |

### Le temps (neutre)
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Téléportation | compétence | 0 | commune | 3 armure, T | 5 armure |
| Astrolabe | compétence | 0 | commune | T, pioche 1 | T, pioche 1, 3 armure |
| Espace-temps | compétence | 0 | commune | T, 3 renvoi | T, 5 renvoi |
| Complice | compétence | 0 | commune | 3 bouclier | 5 bouclier |
| Fuite du Temps | compétence | 0 | commune | 4 armure, 4 armure au prochain tour | 6 / 6 |
| Prémonition | compétence | 0 | commune | au prochain tour, pioche 2 | pioche 3 |
| Paradoxe | compétence | 0 | commune | double le ralenti de la cible | triple |
| Désynchronisation | compétence | 0 | commune | T tous, épuisée | T tous, pioche 1, épuisée |
| Rémanence | compétence | 1 | commune | T, 1 vulnérabilité | T, 2 vulnérabilité |
| Faille | compétence | 2 | rare | 12 armure, 6 armure au prochain tour | 15 / 8 |
| Rembobinage | compétence | 0 | rare | reprends en main la dernière carte jouée ce tour, épuisée | sans épuisement |
| Raulebaque | compétence | 0 | rare | regagne les PV perdus pendant le dernier tour des monstres, épuisée | et 4 armure |
| Vingt-cinquième Heure | compétence | 1 | rare | étourdit tous les ennemis Téléfrag (consomme), épuisée | coûte 0 |

### Pouvoirs
| Carte | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|
| Momification | 0 | rare | à la fin du tour, garde jusqu'à 1 PA non dépensé pour le tour suivant | jusqu'à 2 |
| Cadran de Xélor | 1 | rare | au début de ton tour, pose un Téléfrag sur un ennemi au hasard | et 3 armure |
| Synchro | 0 | rare | quand tu consommes un Téléfrag, 3 Air à tous les ennemis | 5 |
| Instabilité | 1 | rare | quand tu consommes un Téléfrag, ralenti 1 à tous les ennemis | ralenti 2 |

### Sorts inventés (13)
Ils couvrent ce que les vrais sorts ne font pas. Icône empruntée à un sort proche, comme pour le Iop et le Crâ.
| Carte | Type | Coût | Rareté | Effet | Amélioré |
|---|---|---|---|---|---|
| Seconde (créée en combat) | attaque | 0 | — | 3 dégâts, T, épuisée | 5 |
| Tic-Tac | compétence | 1 | commune | crée 2 Secondes en main | 3 Secondes |
| Aiguille des Heures | attaque | 1 | commune | 8 Terre ; si T : 8 Terre de plus | 10 / 10 |
| Aiguille des Minutes | attaque | 0 | commune | 3 Air ×2, T | 4 ×2 |
| Contretemps | attaque | 1 | commune | 7 Eau ; si la cible est ralentie : pioche 1 | 10 |
| Rouille | compétence | 1 | commune | 2 érosion, ralenti 2 | 3 / 3 |
| Instant Suspendu | compétence | 1 | commune | 8 armure, conservée en main | 11 |
| Sablier Brisé | attaque | 1 | rare | 5 Feu, puis la cible subit tout de suite son sablier | 8 |
| Arrêt du Temps | compétence | 2 | rare | étourdit tous les ennemis, épuisée | coûte 1 |
| Écho Temporel | compétence | 1 | rare | +1 PA au début de tes 2 prochains tours, épuisée | coûte 0 |
| Dernière Seconde | compétence | 0 | rare | pioche 1 ; si tes PV sont bas : +2 PA, épuisée | pioche 2 |
| Horloge Interne | pouvoir | 1 | commune | quand tu consommes un Téléfrag, gagne 3 armure | 4 |
| Boucle Temporelle | pouvoir | 3 | rare | ta première carte de chaque tour est jouée deux fois | coûte 2 |

## Ce qu'il faut ajouter au moteur
- Statuts : `telefrag`, `ralenti`, `sablier` (avec leurs icônes et leurs bulles d'explication).
- Passif Téléfrag dans `Combat`, avec sa jauge visible comme Courroux et Visée.
- Effets : « au prochain tour », reprendre la dernière carte jouée, récupérer les PV perdus, revenir en main,
  grossir et coûter moins pour le combat.
- Conditions : cible Téléfrag, cible ralentie. Échelles : ennemis Téléfrag, Téléfrag consommés ce combat.
- Déclencheur de pouvoir « quand tu consommes un Téléfrag » (`noRoll` : jamais tiré sur un objet).
- Chaque règle a son test. Les textes des cartes restent générés par `describe.ts`.

## Ce qu'il faut ajouter à l'interface et aux fichiers
- Classe jouable sur l'écran d'accueil (symbole, personnage Dofus 3 mâle et femelle, voix : déjà disponibles dans
  Dofus Survivors, breed 5).
- Sorts du Xélor dans `dofus.json` (`tools/build-dofus-data.mjs`).
- `equilibrage.json` : PV de départ, deck de départ, passif, valeurs des cartes, ajoutés sans toucher aux valeurs
  existantes.
- Bot : il doit savoir jouer le Xélor (poser puis consommer le Téléfrag) pour mesurer la difficulté.

## Questions pour le propriétaire
1. Le passif : **1 PA par tour** en consommant un Téléfrag, ou **1 carte piochée** ?
2. Le ralenti réduit **chaque coup** du monstre (fort contre les coups multiples), ou **le total** de son tour ?
3. Arrêt du Temps et Vingt-cinquième Heure étourdissent beaucoup : on garde les deux, ou un seul ?
