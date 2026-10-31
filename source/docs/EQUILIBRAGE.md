# Régler l'équilibrage

Toutes les valeurs réglables du jeu sont dans **`equilibrage.json`, à la racine du dépôt Slay**. Le jeu en ligne relit ce fichier à chaque démarrage : une modification enregistrée sur GitHub s'applique dès que le site est redéployé (quelques secondes), sans reconstruire le jeu.

## Modifier sur GitHub

1. Ouvre `equilibrage.json` à la racine du dépôt, puis le crayon « Edit this file ».
2. Change les nombres voulus (Ctrl+F pour trouver une carte ou un monstre par son nom).
3. « Commit changes ». Recharge le jeu.

Si le fichier n'est plus un JSON valide (virgule oubliée, guillemet manquant), le jeu garde ses valeurs intégrées et l'écrit dans la console du navigateur (F12). Une valeur absurde (PV négatifs, carte inconnue dans un deck, action de monstre inexistante dans son rythme) est ignorée et signalée de la même façon ; le reste du fichier s'applique.

## Ce qu'on y trouve

| Section | Contenu |
|---|---|
| `classes` | PV de départ et deck de départ du Iop et du Crâ |
| `passifs` | Courroux (attaques par tour, puissance gagnée) et Visée (attaques entre deux tirs, multiplicateur) |
| `echelle_monstres` | Multiplicateurs de PV et de dégâts des monstres par acte et par type de salle |
| `dieux` | Les douze dieux (nom, titre, phrase d'accueil) et leurs six bénédictions : effets de combat, stats, avantages de run, effets immédiats |
| `cartes` | Pour chaque carte : coût en PA, rareté, effets, version améliorée, épuisée / conservée / innée |
| `monstres` | Pour chaque monstre : PV (avant échelle), résistances en %, mécaniques, actions et leurs effets, rythme, seconde phase |

Le début du fichier (`_aide`) rappelle la signification de chaque champ d'effet.

## Exemples

- Rendre le Iop plus solide : `"classes": { "iop": { "pv": 90, ...`
- Coup d'épée à 7 dégâts : dans `"iop_coup_epee"`, `"effets": [{"type": "damage", "amount": 7, ...}]`
- Bouftou Royal plus résistant au feu : dans `"bouftou_royal"`, `"resistances": {..., "feu": 40, ...}`
- Rage moins fréquente : `{"kind": "rage", "n": 2, "every": 6}`
- Colère de Iop plus forte : dans `"iop_colere"`, `"effets": [{"declencheur": "debut_combat", "recompense": "puissance", "quantite": 3}]`
- Punition du Sacrieur deux fois par tour : `{"declencheur": "pv_perdus", "recompense": "puissance", "quantite": 1, "par_tour": 2}`
- Une bénédiction qui ne sert qu'une fois par combat : ajouter `"une_fois": true` à l'effet
- Bourse sans fond d'Enutrof : `"avantages": {"kamas": 0.35}` (+35 % de kamas), `"immediat": [{"op": "kamas", "n": 60}]`
- Changer une règle : `"effets": [{"regle": "sablier"}]` (la liste des règles, déclencheurs et récompenses possibles est dans `_aide`)

### Bénédictions des dieux

Chaque bénédiction peut combiner quatre parties, toutes facultatives :
- `effets` : en combat. Soit `{"declencheur", "recompense", "quantite"}` (le même moteur que les effets d'objets, avec `par_tour` et `une_fois` en option), soit `{"regle"}`.
- `stats` : `pv`, `armure` (ajoutée à chaque gain d'armure), `prospection`, `degats` par élément.
- `avantages` : `kamas`, `remise_marchand`, `cartes_en_plus`, `resurrection`, `soin_zaap`.
- `immediat` : ce qui se passe quand on la prend (`maxHp`, `healPct`, `kamas`, `upgrade`, `pick`, `cardChoice`, `itemChoice`, `chance`…).

Le texte affiché en jeu est écrit à partir de ces valeurs : il suit toujours le fichier. Une partie invalide (déclencheur ou règle inconnus, nombre manquant) est ignorée et signalée dans la console ; la bénédiction garde sa valeur d'origine pour cette partie-là.

## Côté code

`src/data/balance.ts` lit et vérifie le fichier ; `tools/export-balance.ts` y ajoute les cartes, monstres et bénédictions nouveaux sans toucher aux valeurs existantes (`--reset` pour tout réécrire avec les valeurs du code). Avant chaque mise en ligne, la version du dépôt Slay (avec les réglages faits sur GitHub) est rapatriée dans les sources : les réglages manuels ne sont jamais écrasés.
