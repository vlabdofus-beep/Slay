// Les douze dieux du Monde des Douze. Au début de chaque acte, l'un d'eux apparaît et propose trois de ses six
// bénédictions ; on en garde une pour toute la run. Chaque dieu reste fidèle à sa classe : Iop la force brute,
// Crâ la précision, Eniripsa le soin, Écaflip la chance, Enutrof l'argent, Sram le poison et la ruse, Xélor le temps,
// Sacrieur le sang, Féca la protection, Osamodas les bêtes, Sadida la nature, Pandawa l'ivresse.
import type { EffectPart, ItemEffect, RuleId } from '../core/effects.ts';
import type { Boon } from '../game/boons.ts';

export type GodId = 'iop' | 'cra' | 'eniripsa' | 'ecaflip' | 'enutrof' | 'sram' | 'xelor' | 'sacrieur' | 'feca' | 'osamodas' | 'sadida' | 'pandawa';

export interface GodDef {
  id: GodId;
  name: string;
  /** Titre : « dieu de la Force »… */
  title: string;
  /** Identifiant de classe : symbole (assets/classes/<breed>.png) et illustration de montée de niveau
   *  de Dofus 3 (assets/gods/<breed>.webp, « godsOmega/LevelUp<breed> » dans les fichiers du jeu). */
  breed: number;
  /** Crâ, Eniripsa, Féca et Sacrieur sont des déesses (comme dans leurs illustrations officielles). */
  gender: 'm' | 'f';
  color: string;
  /** Ce que dit le dieu en apparaissant. */
  greeting: string;
  boons: Boon[];
}

const on = (trigger: string, reward: string, amount: number, o: Partial<EffectPart> = {}): ItemEffect =>
  ({ kind: 'roll', parts: [{ trigger, reward, amount, ...o }] });
const both = (trigger: string, a: [string, number], b: [string, number]): ItemEffect =>
  ({ kind: 'roll', parts: [{ trigger, reward: a[0], amount: a[1] }, { trigger, reward: b[0], amount: b[1] }] });
const rule = (r: RuleId): ItemEffect => ({ kind: 'rule', rule: r });

export const GODS: GodDef[] = [
  {
    id: 'iop', name: 'Iop', title: 'dieu de la Force', breed: 8, gender: 'm', color: '#e5483b',
    greeting: 'Réfléchir, c\'est perdre du temps. Prends ma force et cogne.',
    boons: [
      { id: 'iop_colere', name: 'Colère de Iop', effects: [on('debut_combat', 'puissance', 1)], lore: 'La rage monte avant même le premier coup.' },
      { id: 'iop_epee', name: 'Épée céleste', now: [{ op: 'cardChoice', rarity: 'rare' }], lore: 'Une lame tombée du ciel, encore chaude.' },
      { id: 'iop_bond', name: 'Bond', effects: [rule('premier_double')], lore: 'Il frappe deux fois avant que l\'autre ne réagisse.' },
      { id: 'iop_terre', name: 'Poigne tellurique', stats: { dom: { terre: 2 } }, lore: 'La terre gronde sous chaque coup.' },
      { id: 'iop_fracas', name: 'Fracas', effects: [rule('vulne_forte')], lore: 'Ce qui est fêlé finit en morceaux.' },
      { id: 'iop_tete', name: 'Tête brûlée', effects: [rule('colosse')], lore: 'Plus fort que l\'adversaire, mais lui aussi se réveille.' },
    ],
  },
  {
    id: 'cra', name: 'Crâ', title: 'déesse de l\'Arc', breed: 9, gender: 'f', color: '#7dbb2e',
    greeting: 'Un seul trait, au bon endroit. Le reste n\'est que du bruit.',
    boons: [
      { id: 'cra_oeil', name: 'Œil de Crâ', effects: [on('premiere_carte', 'vulnerabilite', 1)], lore: 'Elle voit la faille avant de tirer.' },
      { id: 'cra_fleche', name: 'Dernière flèche', effects: [on('dernier_pa', 'degats', 5)], lore: 'Le carquois vide, il reste toujours une flèche.' },
      { id: 'cra_vent', name: 'Vent d\'est', stats: { dom: { air: 2 } }, lore: 'Le vent porte ses flèches plus loin.' },
      { id: 'cra_ricochet', name: 'Ricochet', effects: [rule('ricochet')], lore: 'La flèche rebondit sur la cible et trouve la suivante.' },
      { id: 'cra_perce', name: 'Flèche perçante', effects: [rule('air_perce')], lore: 'Aucune armure n\'arrête le vent.' },
      { id: 'cra_carquois', name: 'Carquois sans fond', now: [{ op: 'pick', what: 'duplicate', n: 1 }], lore: 'Une flèche tirée, une autre la remplace.' },
    ],
  },
  {
    id: 'eniripsa', name: 'Eniripsa', title: 'déesse des Soins', breed: 7, gender: 'f', color: '#e9789c',
    greeting: 'Les mots soignent, mon enfant. Écoute bien les miens.',
    boons: [
      { id: 'eni_mot', name: 'Mot de régénération', effects: [on('debut_tour', 'soin', 1)], lore: 'Un murmure à chaque aube.' },
      { id: 'eni_vampire', name: 'Mot vampirique', effects: [rule('eau_vampire')], lore: 'L\'eau rend ce qu\'elle prend.' },
      { id: 'eni_reconstituant', name: 'Mot reconstituant', stats: { pv: 6 }, effects: [rule('soin_bouclier')], lore: 'Une part du trop-plein de vie devient un rempart.' },
      { id: 'eni_source', name: 'Source de vie', now: [{ op: 'maxHp', n: 18 }], lore: 'Une eau claire qui ne tarit pas.' },
      { id: 'eni_onde', name: 'Onde', stats: { dom: { eau: 3 } }, lore: 'Chaque goutte devient une vague.' },
      { id: 'eni_purification', name: 'Purification', now: [{ op: 'healPct', pct: 1 }, { op: 'pick', what: 'remove', n: 1 }], lore: 'Laisse derrière toi ce qui te pèse.' },
    ],
  },
  {
    id: 'ecaflip', name: 'Écaflip', title: 'dieu de la Chance', breed: 6, gender: 'm', color: '#f0b739',
    greeting: 'Pile, tu gagnes. Face… on verra bien. Allez, tente ta chance !',
    boons: [
      { id: 'eca_pile', name: 'Pile ou face', now: [{ op: 'chance', p: 0.5, win: [{ op: 'kamas', n: 250 }], lose: [{ op: 'kamas', n: 40 }], winText: 'Pile ! La bourse déborde.', loseText: 'Face. Une petite pièce de consolation.' }], lore: 'La pièce tourne, tourne encore…' },
      { id: 'eca_critique', name: 'Coup critique', effects: [rule('critique')], lore: 'Un coup de chance, c\'est du talent.' },
      { id: 'eca_vies', name: 'Neuf vies', perks: { revive: 1 }, lore: 'Un chat retombe toujours sur ses pattes.' },
      { id: 'eca_tirage', name: 'Tirage chanceux', perks: { cardChoices: 1 }, lore: 'Une carte de plus dans la manche.' },
      { id: 'eca_des', name: 'Lancer de dés', effects: [on('toutes_3_cartes', 'degats_zone', 4)], lore: 'Les dés roulent et tout le monde trinque.' },
      { id: 'eca_roue', name: 'Roue de la fortune', now: [{ op: 'upgrade', n: 3 }], lore: 'La roue s\'arrête, et c\'est toujours gagnant.' },
    ],
  },
  {
    id: 'enutrof', name: 'Enutrof', title: 'dieu de l\'Argent', breed: 3, gender: 'm', color: '#c99a45',
    greeting: 'Hé hé… Tout trésor a un prix, petit. Mais pour toi, je fais une ristourne.',
    boons: [
      { id: 'enu_pelle', name: 'Pelle du prospecteur', stats: { prospection: 100 }, lore: 'Elle sent l\'or à trois lieues.' },
      { id: 'enu_bourse', name: 'Bourse sans fond', now: [{ op: 'kamas', n: 60 }], perks: { kamasMul: 0.35 }, lore: 'Plus on y met, plus il y en a.' },
      { id: 'enu_tresor', name: 'Trésor enfoui', now: [{ op: 'itemChoice', rarity: 'mythique' }], lore: 'Il était là, sous tes pieds, depuis toujours.' },
      { id: 'enu_marchand', name: 'Ami des marchands', perks: { shopDiscount: 0.25 }, lore: 'Entre vieux grigous, on se comprend.' },
      { id: 'enu_lenteur', name: 'Maladresse', effects: [on('debut_tour', 'faiblesse', 1)], lore: 'Une pièce qui roule sous les pieds, et le coup part de travers.' },
      { id: 'enu_coffre', name: 'Coffre d\'Enutrof', effects: [rule('prospecteur')], lore: 'Il ne s\'ouvre que pour les patients.' },
    ],
  },
  {
    id: 'sram', name: 'Sram', title: 'dieu des Ombres', breed: 4, gender: 'm', color: '#8a7bd1',
    greeting: 'Tu ne m\'as pas vu arriver. C\'est bien. Eux non plus ne te verront pas.',
    boons: [
      { id: 'sram_venin', name: 'Venin tenace', effects: [rule('poison_tenace')], lore: 'Le poison ne s\'oublie pas.' },
      { id: 'sram_langueur', name: 'Langueur', effects: [rule('poison_affaiblit')], lore: 'Le venin coupe les jambes avant le souffle.' },
      { id: 'sram_piege', name: 'Piège sournois', effects: [on('debut_combat', 'poison_zone', 6)], lore: 'Le combat commence là où tu as posé le piège.' },
      { id: 'sram_invisible', name: 'Invisibilité', effects: [on('premier_tour', 'esquive', 1)], lore: 'Le premier coup frappe l\'air là où tu étais.' },
      { id: 'sram_larcin', name: 'Larcin', now: [{ op: 'kamas', n: 40 }], perks: { kamasMul: 0.2 }, lore: 'Une bourse de plus, qui s\'en rendra compte ?' },
      { id: 'sram_fourbe', name: 'Fourberie', effects: [on('cible_empoisonnee', 'degats', 4)], lore: 'On achève ce qui chancelle.' },
    ],
  },
  {
    id: 'xelor', name: 'Xélor', title: 'dieu du Temps', breed: 5, gender: 'm', color: '#4c8fd6',
    greeting: 'Tic. Tac. J\'ai tout le temps du monde. Toi, un peu moins. Prends-en un peu.',
    boons: [
      { id: 'xel_sablier', name: 'Sablier', effects: [rule('sablier')], lore: 'Le sable qui n\'a pas coulé attend son heure.' },
      { id: 'xel_retenue', name: 'Instant figé', effects: [rule('retenue')], lore: 'Une carte reste suspendue entre deux tours.' },
      { id: 'xel_ralenti', name: 'Ralentissement', effects: [on('tous_4_tours', 'etourdi', 1)], lore: 'De temps en temps, le monde s\'arrête un instant, sauf toi.' },
      { id: 'xel_horloge', name: 'Horloge', effects: [both('premier_tour', ['pa', 1], ['pioche', 1])], lore: 'Le premier tour dure un peu plus longtemps.' },
      { id: 'xel_frappe', name: 'Frappe de Xélor', effects: [rule('premiere_gratuite')], lore: 'Un geste déjà fait avant d\'être commencé.' },
      { id: 'xel_rembobinage', name: 'Rembobinage', effects: [rule('pioche_vide')], lore: 'La main vide se remplit d\'un tour en arrière.' },
    ],
  },
  {
    id: 'sacrieur', name: 'Sacrieur', title: 'déesse du Sang', breed: 11, gender: 'f', color: '#c43c3c',
    greeting: 'Saigne, et deviens plus fort. La douleur est un cadeau.',
    boons: [
      { id: 'sac_sang', name: 'Sang bouillant', effects: [rule('sang')], lore: 'Chaque blessure nourrit la suivante.' },
      { id: 'sac_douleur', name: 'Douleur partagée', effects: [rule('renvoi_moitie')], lore: 'Ce que tu prends, ils le prennent aussi.' },
      { id: 'sac_punition', name: 'Punition', effects: [on('pv_perdus', 'puissance', 1, { limit: 1 })], lore: 'Chaque coup reçu se paie au double.' },
      { id: 'sac_sacrifice', name: 'Sacrifice', now: [{ op: 'maxHp', n: -16 }, { op: 'upgradeAll', type: 'attaque' }], lore: 'Une bonne part de toi contre beaucoup de force.' },
      { id: 'sac_transfert', name: 'Transfert de vie', effects: [on('ennemi_meurt', 'soin', 2)], lore: 'Un peu de la vie qui s\'en va passe par toi.' },
      { id: 'sac_folie', name: 'Folie sanguinaire', effects: [on('pv_bas', 'pa', 1)], lore: 'Au bord du gouffre, tout va plus vite.' },
    ],
  },
  {
    id: 'feca', name: 'Féca', title: 'déesse de la Protection', breed: 1, gender: 'f', color: '#d9a441',
    greeting: 'Personne ne tombe tant que je veille. Tiens-toi derrière mon bouclier.',
    boons: [
      { id: 'fec_glyphe', name: 'Glyphe de garde', effects: [rule('armure_persistante')], lore: 'Le glyphe garde la moitié de ta défense.' },
      { id: 'fec_bouclier', name: 'Bouclier Féca', effects: [on('debut_combat', 'bouclier', 6)], lore: 'Il est déjà levé quand le combat commence.' },
      { id: 'fec_epines', name: 'Armure d\'épines', effects: [rule('epines_armure')], lore: 'Frapper ce mur coûte cher.' },
      { id: 'fec_armure', name: 'Armure terrestre', stats: { armure: 2 }, lore: 'Chaque protection est un peu plus épaisse.' },
      { id: 'fec_treve', name: 'Trêve', effects: [rule('puissance_armure')], lore: 'La force qui frappe peut aussi protéger.' },
      { id: 'fec_rempart', name: 'Rempart', now: [{ op: 'upgradeAll', type: 'competence', protection: true }], lore: 'Chaque parade apprend de la précédente.' },
    ],
  },
  {
    id: 'osamodas', name: 'Osamodas', title: 'dieu des Bêtes', breed: 2, gender: 'm', color: '#5aa7a0',
    greeting: 'Les bêtes savent qui est le maître. Elles te suivront, si tu sais tenir le fouet.',
    boons: [
      { id: 'osa_fouet', name: 'Fouet', effects: [rule('faiblesse_forte')], lore: 'Un claquement, et la bête baisse la tête.' },
      { id: 'osa_bouftou', name: 'Bouftou fidèle', effects: [on('debut_tour', 'degats', 4)], lore: 'Il fonce tête baissée, à chaque tour.' },
      { id: 'osa_dragonnet', name: 'Dragonnet', effects: [on('debut_tour', 'brulure', 2)], lore: 'Petit, mais il crache déjà le feu.' },
      { id: 'osa_tofu', name: 'Tofu messager', effects: [on('tous_3_tours', 'pioche', 2)], lore: 'Il revient toujours avec des nouvelles.' },
      { id: 'osa_crapaud', name: 'Crapaud', effects: [on('fin_armure', 'soin', 2)], lore: 'Sa bave guérit ceux qui ont tenu bon.' },
      { id: 'osa_meute', name: 'Appel de la meute', now: [{ op: 'cardChoice', rarity: 'toute' }, { op: 'cardChoice', rarity: 'toute' }], lore: 'Deux bêtes de plus dans la meute.' },
    ],
  },
  {
    id: 'sadida', name: 'Sadida', title: 'dieu de la Nature', breed: 10, gender: 'm', color: '#6aa84f',
    greeting: 'La forêt t\'a vu passer. Elle a décidé de t\'aider. N\'abîme pas ses arbres.',
    boons: [
      { id: 'sad_ronces', name: 'Ronces', effects: [on('debut_combat', 'soin', 4)], lore: 'Les ronces referment tes plaies avant que le combat ne commence.' },
      { id: 'sad_contagion', name: 'Peste verte', effects: [rule('contagion')], lore: 'Le mal passe de feuille en feuille.' },
      { id: 'sad_poupee', name: 'Poupée sacrifiée', effects: [on('pv_perdus', 'bouclier', 3, { limit: 1 })], lore: 'Elle prend une part de chaque coup.' },
      { id: 'sad_arbre', name: 'Arbre de vie', effects: [on('victoire', 'soin', 2)], lore: 'Après la bataille, un instant de repos à son ombre.' },
      { id: 'sad_racines', name: 'Racines profondes', stats: { dom: { terre: 2 } }, lore: 'Bien ancré, chaque coup puise dans la terre.' },
      { id: 'sad_seve', name: 'Sève vénéneuse', effects: [on('carte_terre', 'poison', 1)], lore: 'La terre elle-même devient poison.' },
    ],
  },
  {
    id: 'pandawa', name: 'Pandawa', title: 'dieu de l\'Ivresse', breed: 12, gender: 'm', color: '#7a9a5a',
    greeting: 'Hips ! Un petit verre de lait de bambou avant d\'y aller ? Ça donne du courage !',
    boons: [
      { id: 'pan_ivresse', name: 'Ivresse', effects: [rule('etourdi_fragile')], lore: 'Celui qui titube tombe plus fort.' },
      { id: 'pan_lait', name: 'Lait de bambou', now: [{ op: 'healPct', pct: 1 }], stats: { pv: 5 }, lore: 'Ça requinque, et pas qu\'un peu.' },
      { id: 'pan_karcham', name: 'Karcham', effects: [on('chere', 'etourdi', 1, { recharge: 3 })], lore: 'Un gros coup, et l\'autre voit des étoiles. Il faut ensuite reprendre son souffle.' },
      { id: 'pan_souffle', name: 'Souffle alcoolisé', effects: [rule('brulure_double')], lore: 'Une étincelle, et tout s\'embrase.' },
      { id: 'pan_flamme', name: 'Flamme du bambou', stats: { dom: { feu: 2 } }, lore: 'Le feu au ventre, au sens propre.' },
      { id: 'pan_vapeurs', name: 'Vapeurs', effects: [on('zone', 'vulnerabilite', 1)], lore: 'Tout le monde finit par respirer les vapeurs.' },
    ],
  },
];

export const GOD_BY_ID: Record<GodId, GodDef> = Object.fromEntries(GODS.map((g) => [g.id, g])) as Record<GodId, GodDef>;
/** Les mêmes objets que dans GODS (le fichier d'équilibrage les modifie en place). */
export const BOON_BY_ID: Record<string, Boon & { god: GodId }> = Object.fromEntries(
  GODS.flatMap((g) => g.boons.map((b) => [b.id, Object.assign(b, { god: g.id })])),
);
