// Événements des cases « ? » : 15 par acte, à la manière de Slay the Spire. Une scène qui pose le joueur dans une
// situation, et des réponses en personnage. On ne sait pas toujours ce qu'on va gagner :
//  - show 'rien' (par défaut) : l'issue est cachée, on choisit sur la foi de la scène ;
//  - show 'prix' : on voit ce que ça coûte (kamas, PV), pas ce que ça rapporte ;
//  - show 'tout' : l'effet est écrit en entier.
// Une réponse peut ouvrir une seconde scène (next). Les issues peuvent tourner court : combat surprise, malédiction.
import type { RunOp } from '../game/boons.ts';
import type { Act } from './monsters.ts';

export interface EventOption {
  label: string;
  ops: RunOp[];
  /** Ce qui se passe ensuite, raconté. */
  after: string;
  show?: 'tout' | 'prix' | 'rien';
  /** Seconde scène, jouée après cette réponse. */
  next?: EventPage;
}
export interface EventPage { text: string; options: EventOption[] }
export interface EventArt { breed?: number; monster?: string; iconId?: number }
export interface GameEvent extends EventPage { id: string; act: Act; title: string; art: EventArt }

// Raccourcis : réponse cachée, réponse dont on voit le prix, réponse transparente, seconde scène, partir.
const hide = (label: string, ops: RunOp[], after: string): EventOption => ({ label, ops, after, show: 'rien' });
const cost = (label: string, ops: RunOp[], after: string): EventOption => ({ label, ops, after, show: 'prix' });
const open = (label: string, ops: RunOp[], after: string): EventOption => ({ label, ops, after, show: 'tout' });
const go = (label: string, after: string, text: string, options: EventOption[]): EventOption => ({ label, ops: [], after, show: 'rien', next: { text, options } });
const leave = (label = 'Passer ton chemin', after = 'Tu reprends la route.'): EventOption => ({ label, ops: [], after, show: 'tout' });
const luck = (p: number, win: RunOp[], lose: RunOp[], winText: string, loseText: string): RunOp => ({ op: 'chance', p, win, lose, winText, loseText });
const fight = (tier: 'normal' | 'elite', then: RunOp[] = []): RunOp => ({ op: 'fight', tier, then });

export const EVENTS: GameEvent[] = [
  // ───────────── Acte 1 : Amakna ─────────────
  {
    id: 'a1_fontaine', act: 1, title: 'La fontaine d\'Astrub', art: { iconId: 12768 },
    text: 'Au détour d\'un sentier, une fontaine de pierre murmure. Une inscription à moitié effacée promet « santé à qui boit, fortune à qui donne ». Au fond du bassin, des centaines de pièces scintillent.',
    options: [
      hide('Boire longuement', [luck(0.65, [{ op: 'healPct', pct: 0.35 }], [{ op: 'heal', n: 5 }, { op: 'curse', id: 'malediction_doute' }],
        'L\'eau est fraîche et douce. Tes plaies se referment.', 'L\'eau a un goût de vase. Une angoisse sourde te prend, et ne te lâche plus.')], ''),
      cost('Jeter une pièce et faire un vœu', [{ op: 'kamas', n: -40 }, { op: 'pick', what: 'upgrade', n: 1 }], 'La pièce coule lentement. Quand tu regardes tes mains, l\'un de tes sorts brille d\'un éclat neuf.'),
      hide('Repêcher quelques pièces', [{ op: 'kamas', n: 55 }, luck(0.5, [], [fight('normal')], 'Personne ne t\'a vu.', 'Le clapotis attire les monstres du coin. Ils n\'aiment pas les voleurs.')], 'Tu remplis ta bourse en vitesse.'),
    ],
  },
  {
    id: 'a1_bouftou', act: 1, title: 'Un Bouftou égaré', art: { monster: 'bouftou' },
    text: 'Un petit Bouftou bêle à fendre l\'âme au milieu du champ. Il a perdu son troupeau. Derrière la colline, un grondement sourd : quelque chose de bien plus gros le cherche aussi.',
    options: [
      hide('Le prendre dans tes bras et chercher son troupeau', [luck(0.5, [{ op: 'kamas', n: 60 }, { op: 'heal', n: 10 }], [fight('normal')],
        'Le berger t\'accueille comme un héros et te glisse une bourse bien remplie.', 'Le troupeau te trouve avant le berger. Et il croit que tu voles le petit.')], ''),
      hide('Le tondre vite fait', [{ op: 'cardChoice', rarity: 'rare' }, { op: 'curse', id: 'malediction_honte' }], 'Sa laine est d\'une qualité rare. Le regard qu\'il te lance en s\'enfuyant, lui, ne te quittera plus.'),
      leave('Le laisser là', 'Il finira bien par retrouver les siens. Sans doute.'),
    ],
  },
  {
    id: 'a1_champignons', act: 1, title: 'Le cercle de champignons', art: { monster: 'champ_champ' },
    text: 'Sous les arbres, un cercle parfait de champignons dorés. L\'air y est plus chaud, et on jurerait entendre de la musique sous la terre.',
    options: [
      hide('Goûter un champignon', [luck(0.5, [{ op: 'maxHp', n: 6 }], [{ op: 'loseHp', n: 8 }],
        'Une chaleur agréable t\'envahit. Tu te sens plus solide.', 'Ton ventre se tord. Mauvais champignon, très mauvais.')], ''),
      go('Entrer dans le cercle', 'Le sol se dérobe sous tes pieds.',
        'Tu atterris dans une salle souterraine où dansent de petits Champ Champs. La musique s\'arrête net. Des dizaines d\'yeux te fixent.', [
          hide('Danser avec eux', [luck(0.6, [{ op: 'maxHp', n: 4 }, { op: 'heal', n: 15 }], [fight('normal')],
            'Ils t\'acclament et t\'offrent un festin de spores.', 'Tu danses comme un Iop. Ils le prennent très mal.')], ''),
          hide('Sortir sur la pointe des pieds', [{ op: 'prosp', n: 20 }], 'En remontant, tu repères des galeries que les chercheurs de trésor connaissent bien.'),
        ]),
      leave(),
    ],
  },
  {
    id: 'a1_forge', act: 1, title: 'La forge d\'Astrub', art: { breed: 8 },
    text: 'Le forgeron d\'Astrub, un vieux Iop couvert de suie, frappe une lame en chantant faux. Il s\'arrête en te voyant : « Toi, t\'as des sorts qui manquent de tranchant. »',
    options: [
      cost('Le laisser travailler', [{ op: 'kamas', n: -75 }, { op: 'pick', what: 'upgrade', n: 2 }], 'Il prend son temps, et ses mains savent ce qu\'elles font.'),
      hide('Le défier au bras de fer', [luck(0.4, [{ op: 'pick', what: 'upgrade', n: 2 }], [{ op: 'loseHp', n: 10 }],
        'Il rit, vaincu, et retravaille deux de tes sorts pour rien.', 'Il te plie le bras en deux secondes. Ça craque.')], ''),
      open('Lui demander un conseil', [{ op: 'upgrade', n: 1 }], '« Frappe d\'abord, réfléchis jamais. » C\'est un Iop, après tout.'),
    ],
  },
  {
    id: 'a1_nid_tofu', act: 1, title: 'Le nid de Tofus', art: { monster: 'tofu' },
    text: 'Dans les branches basses, un nid de Tofus. Au milieu des œufs repose une plume irisée, bien trop grande pour un Tofu ordinaire.',
    options: [
      hide('Tendre la main vers la plume', [fight('normal', [{ op: 'relic', id: 'plume_tofu' }])], 'Les Tofus se jettent sur toi en piaillant !'),
      hide('Prendre un œuf pour le dîner', [{ op: 'heal', n: 12 }, luck(0.5, [], [{ op: 'curse', id: 'malediction_honte' }],
        'Un bon repas, et personne n\'en saura rien.', 'La mère te regarde manger. Longtemps.')], ''),
      leave(),
    ],
  },
  {
    id: 'a1_milice', act: 1, title: 'La milice d\'Astrub', art: { breed: 1 },
    text: 'Un milicien t\'arrête à l\'entrée de la ville : « Des monstres rôdent près des remparts. La ville paie bien ceux qui s\'en occupent. » Il te jauge de haut en bas, l\'air sceptique.',
    options: [
      open('Accepter la mission', [fight('normal', [{ op: 'kamas', n: 80 }])], 'Il te montre les remparts d\'un mouvement de menton.'),
      hide('Lui dire que tu es plutôt soigneur', [luck(0.5, [{ op: 'healPct', pct: 0.2 }, { op: 'kamas', n: 30 }], [{ op: 'loseHp', n: 6 }],
        'Une journée tranquille à l\'infirmerie, un peu payée.', 'On te met à l\'entraînement des recrues. Comme mannequin.')], ''),
      leave(),
    ],
  },
  {
    id: 'a1_autel', act: 1, title: 'L\'autel abandonné', art: { breed: 11 },
    text: 'Une clairière silencieuse. Sur un autel couvert de mousse repose une relique intacte, sous des traces de sang séché. Gravé dans la pierre : « Ce que tu prends, tu le rends. »',
    options: [
      cost('Offrir ton sang', [{ op: 'loseHp', n: 12 }, { op: 'relic' }], 'L\'autel boit ton offrande. La relique est à toi.'),
      hide('Prendre la relique sans rien offrir', [{ op: 'relic' }, { op: 'curse', id: 'malediction_honte' }, { op: 'curse', id: 'malediction_doute' }], 'Rien ne se passe. Puis, sur le chemin, tu sens deux ombres marcher dans tes pas.'),
      hide('Prier en silence', [{ op: 'pick', what: 'remove', n: 1 }], 'L\'autel te prend quelque chose dont tu n\'avais plus besoin.'),
    ],
  },
  {
    id: 'a1_colporteur', act: 1, title: 'Le colporteur', art: { breed: 3 },
    text: 'Un vieil Enutrof tire une charrette pleine de bric-à-brac. « Approche ! Une boîte mystère pour une poignée de kamas. Ou la grande boîte, pour les audacieux. Je ne rembourse pas. »',
    options: [
      cost('Acheter la petite boîte', [{ op: 'kamas', n: -50 }, luck(0.6, [{ op: 'itemChoice', rarity: 'rare' }], [{ op: 'curse', id: 'malediction_fardeau' }],
        'Dedans, un vrai trésor.', 'Dedans, une pierre. Lourde. Qui ne veut plus te lâcher.')], ''),
      cost('Acheter la grande boîte', [{ op: 'kamas', n: -140 }, { op: 'relic' }], '« Excellent choix ! Enfin, ils le sont tous. »'),
      leave('Passer ton chemin', '« Reviens quand tu auras des kamas ! »'),
    ],
  },
  {
    id: 'a1_puits', act: 1, title: 'Le vieux puits', art: { monster: 'larve_bleue' },
    text: 'Un puits à sec, une échelle rongée qui s\'enfonce dans le noir. Des bruits de reptation montent du fond. Et, tout en bas, quelque chose brille.',
    options: [
      go('Descendre', 'Les barreaux grincent. Tu descends longtemps.',
        'Au fond, un tunnel humide. Des Larves dorment en tas autour d\'un coffre entrouvert.', [
          hide('Ouvrir le coffre d\'un coup', [fight('normal', [{ op: 'itemChoice', rarity: 'rare' }])], 'Le couvercle claque. Les Larves se réveillent.'),
          hide('Ramper jusqu\'au coffre sans bruit', [luck(0.5, [{ op: 'itemChoice', rarity: 'rare' }], [fight('normal')],
            'Tu reviens avec le butin. Personne ne bouge.', 'Une Larve ouvre un œil. Puis toutes.')], ''),
          open('Remonter', [], 'Tu remontes, bredouille mais entier.'),
        ]),
      cost('Jeter une pièce et faire un vœu', [{ op: 'kamas', n: -10 }, luck(0.3, [{ op: 'relic' }], [],
        'Un éclat remonte du puits et tombe dans ta main.', 'Plouf. Rien.')], ''),
      leave(),
    ],
  },
  {
    id: 'a1_fermier', act: 1, title: 'Le fermier excédé', art: { monster: 'boufton_noir' },
    text: 'Un fermier agite sa fourche : un Boufton noir saccage ses champs depuis des jours. « Débarrasse-m\'en, et je te paierai ! » Ses poules picorent sans surveillance, juste derrière lui.',
    options: [
      open('Chasser le Boufton', [fight('normal', [{ op: 'kamas', n: 70 }])], 'Le Boufton t\'attend au milieu du champ, l\'œil mauvais.'),
      hide('Voler une poule pendant qu\'il parle', [{ op: 'heal', n: 15 }, { op: 'curse', id: 'malediction_honte' }], 'Le soir, au coin du feu, la poule est délicieuse. Le souvenir du fermier, beaucoup moins.'),
      leave(),
    ],
  },
  {
    id: 'a1_fete', act: 1, title: 'La fête du village', art: { breed: 12 },
    text: 'Des lampions, de la musique, et un Pandawa hilare qui organise un concours de boisson. « Le dernier debout gagne la cagnotte ! Le premier qui tombe paie la tournée ! »',
    options: [
      hide('Relever le défi', [luck(0.5, [{ op: 'maxHp', n: 5 }, { op: 'kamas', n: 40 }], [{ op: 'loseHp', n: 6 }, { op: 'kamas', n: -20 }],
        'Le Pandawa tombe le premier. La cagnotte est à toi.', 'Tu te réveilles sous une table, la bourse plus légère.')], ''),
      hide('Danser jusqu\'au matin', [{ op: 'heal', n: 15 }], 'Tu repars fatigué, mais le cœur léger.'),
      leave(),
    ],
  },
  {
    id: 'a1_bibliotheque', act: 1, title: 'La bibliothèque d\'Astrub', art: { breed: 5 },
    text: 'Des rayonnages jusqu\'au plafond, et un bibliothécaire Xélor qui ne lève pas les yeux de son sablier. Sur une table, un parchemin doré, oublié.',
    options: [
      open('Étudier toute la nuit', [{ op: 'pick', what: 'upgrade', n: 1 }], 'Quelques heures de lecture, un sort enfin compris.'),
      open('Recopier un sort', [{ op: 'pick', what: 'duplicate', n: 1 }], 'Ta plume court sur le parchemin.'),
      hide('Glisser le parchemin doré sous ta cape', [{ op: 'relic', id: 'parchemin_sagesse' }, { op: 'curse', id: 'malediction_fardeau' }], 'Le Xélor lève enfin les yeux. Trop tard, tu es dehors. Le parchemin pèse plus lourd qu\'il ne devrait.'),
    ],
  },
  {
    id: 'a1_pissenlits', act: 1, title: 'Les pissenlits enchantés', art: { monster: 'pissenlit' },
    text: 'Un champ de pissenlits dont les aigrettes scintillent. On raconte qu\'en souffler une change le destin. On raconte aussi que leurs feuilles soignent tout.',
    options: [
      hide('Faire un vœu et souffler', [{ op: 'pick', what: 'transform', n: 1 }], 'L\'aigrette s\'envole et emporte un de tes sorts. Un autre prend sa place.'),
      hide('En faire une tisane', [luck(0.7, [{ op: 'maxHp', n: 4 }], [{ op: 'loseHp', n: 4 }],
        'Amère, mais revigorante.', 'Ce n\'étaient pas des pissenlits.')], ''),
      leave(),
    ],
  },
  {
    id: 'a1_aventurier', act: 1, title: 'L\'aventurière blessée', art: { breed: 9 },
    text: 'Une Crâ est adossée à un arbre, une flèche dans la cuisse. Elle serre une sacoche contre elle. « Aide-moi… je saurai m\'en souvenir. » Plus loin, des branches craquent : ceux qui l\'ont blessée approchent.',
    options: [
      hide('La soigner', [{ op: 'loseHp', n: 8 }, { op: 'cardChoice', rarity: 'rare' }], 'Tu y laisses des forces. Avant de partir, elle t\'apprend un tir de son peuple.'),
      hide('Monter la garde avec elle', [fight('normal', [{ op: 'relic' }])], 'Tu te places devant elle. Ils sortent des fourrés.'),
      hide('Prendre la sacoche et filer', [{ op: 'kamas', n: 70 }, { op: 'curse', id: 'malediction_honte' }], 'Elle te regarde partir sans un mot.'),
    ],
  },
  {
    id: 'a1_toile', act: 1, title: 'La toile de l\'Arakne', art: { monster: 'arakne' },
    text: 'Une toile géante barre le sentier. Des cocons y pendent, et dans l\'un d\'eux, l\'éclat d\'un objet. Quelque part dans les branches, huit pattes attendent.',
    options: [
      hide('Fouiller les cocons', [fight('normal', [{ op: 'itemChoice', rarity: 'rare' }])], 'La propriétaire de la toile n\'apprécie pas du tout.'),
      hide('Trancher la toile à mains nues', [{ op: 'loseHp', n: 5 }, { op: 'pick', what: 'remove', n: 1 }], 'Tu passes, en laissant un peu de toi dans les fils.'),
      leave('Faire un long détour', 'Une heure de marche en plus, mais pas une égratignure.'),
    ],
  },

  // ───────────── Acte 2 : Forêt des Abraknydes ─────────────
  {
    id: 'a2_chene', act: 2, title: 'Le vieux chêne', art: { monster: 'abraknyde' },
    text: 'Un Abraknyde si vieux qu\'il ne bouge plus. Ses yeux s\'ouvrent lentement, dans un craquement d\'écorce. « Petit d\'homme… Écoute. Ou prends, si tu l\'oses. »',
    options: [
      hide('L\'écouter', [{ op: 'upgrade', n: 2 }], 'Il parle longtemps, très longtemps. Tu en retiens l\'essentiel.'),
      hide('Arracher une branche', [fight('elite', [{ op: 'relic' }])], 'Toute la forêt se réveille.'),
      leave(),
    ],
  },
  {
    id: 'a2_sources', act: 2, title: 'Les sources chaudes', art: { breed: 7 },
    text: 'De la vapeur s\'élève entre les rochers. Une Eniripsa s\'y baigne et te fait signe d\'approcher. Au fond du bassin, quelque chose luit faiblement.',
    options: [
      open('Se baigner', [{ op: 'healPct', pct: 0.4 }], 'Tu ressors comme neuf.'),
      hide('Plonger vers l\'éclat', [luck(0.6, [{ op: 'itemChoice', rarity: 'rare' }, { op: 'loseHp', n: 4 }], [{ op: 'loseHp', n: 12 }],
        'L\'eau brûle, mais tu remontes avec un trésor.', 'L\'eau est bouillante au fond. Tu remontes ébouillanté, les mains vides.')], ''),
      leave(),
    ],
  },
  {
    id: 'a2_bworks', act: 2, title: 'Le campement Bwork', art: { monster: 'bwork' },
    text: 'Des Bworks ronflent autour d\'un feu mourant. Leur butin est entassé au milieu, à peine gardé par un Bwork qui somnole sur sa massue.',
    options: [
      open('Attaquer le camp', [fight('elite', [{ op: 'kamas', n: 120 }])], 'Les ronflements s\'arrêtent net.'),
      hide('Se faufiler jusqu\'au butin', [luck(0.55, [{ op: 'kamas', n: 90 }], [fight('normal')],
        'Personne ne bouge. Tu repars les poches pleines.', 'Une branche craque. Le Bwork de garde ouvre un œil.')], ''),
      leave(),
    ],
  },
  {
    id: 'a2_nid', act: 2, title: 'Le nid de Dragoeuf', art: { iconId: 105204 },
    text: 'Un nid de pierre en haut d\'un rocher, un œuf encore chaud. On entend des battements d\'ailes dans les arbres. Ils ne sont pas loin.',
    options: [
      hide('Prendre l\'œuf', [fight('normal', [{ op: 'relic', id: 'oeuf_dragodinde' }])], 'Les parents arrivent, furieux.'),
      hide('Le couver un moment', [{ op: 'healPct', pct: 0.2 }], 'La chaleur de l\'œuf te réconforte. Les parents, de loin, te laissent faire.'),
      leave(),
    ],
  },
  {
    id: 'a2_cartomancienne', act: 2, title: 'La cartomancienne', art: { breed: 6 },
    text: 'Une Écaflip étale ses cartes sur une souche. « Tire, mon chou. Le destin se lit à l\'envers, mais il se lit. Et s\'il ne te plaît pas… on peut toujours s\'arranger. »',
    options: [
      hide('Tirer une carte', [luck(0.5, [{ op: 'cardChoice', rarity: 'rare' }], [luck(0.5, [{ op: 'kamas', n: 60 }], [{ op: 'curse', id: 'malediction_doute' }],
        'La Fortune. Elle te tend une bourse en riant.', 'La Tour. Elle range ses cartes, sans un mot.')],
        'L\'Étoile. « Celle-là, elle t\'attendait. »', '')], ''),
      cost('Payer pour changer ton destin', [{ op: 'kamas', n: -50 }, { op: 'pick', what: 'transform', n: 2 }], 'Elle retourne deux de tes cartes. Elles ne sont plus les mêmes.'),
      leave('Refuser poliment', '« Le destin, lui, ne refuse rien. »'),
    ],
  },
  {
    id: 'a2_ruines', act: 2, title: 'Les ruines du temple', art: { breed: 4 },
    text: 'Les restes d\'un temple dévoré par les racines. Les dalles sont piégées, les pièges encore armés. Un Sram les a gravés, et un Sram ne fait rien sans raison.',
    options: [
      hide('Fouiller les ruines', [luck(0.5, [{ op: 'relic' }], [{ op: 'loseHp', n: 6 }, { op: 'curse', id: 'malediction_doute' }],
        'Derrière une dalle, une relique intacte.', 'Une dalle s\'enfonce. Tu repars blessé, et troublé.')], ''),
      hide('Étudier les pièges', [{ op: 'pick', what: 'upgrade', n: 1 }], 'Le mécanisme est ingénieux. Tu en retiens la leçon.'),
      leave(),
    ],
  },
  {
    id: 'a2_chafer', act: 2, title: 'Le Chafer repenti', art: { monster: 'chafer' },
    text: 'Un squelette assis sur une pierre te fait signe. « Je cherche mes os. Il m\'en manque un. Tu en aurais un en trop ? » Derrière lui, la terre remue.',
    options: [
      hide('Lui offrir quelque chose de toi', [{ op: 'pick', what: 'remove', n: 1 }, { op: 'kamas', n: 40 }], '« Ce n\'est pas un os, mais ça fera l\'affaire. » Il te paie, en pièces très anciennes.'),
      hide('Le renvoyer à la poussière', [fight('normal', [{ op: 'cardChoice', rarity: 'toute' }])], 'Il soupire. Ses amis, eux, sortent de terre.'),
      leave(),
    ],
  },
  {
    id: 'a2_wabbits', act: 2, title: 'Le terrier des Wabbits', art: { monster: 'wabbit' },
    text: 'Des épluchures de carottes à l\'entrée d\'un terrier immense. On dit que les Wabbits y cachent un grimoire volé à un mage.',
    options: [
      hide('Entrer dans le terrier', [fight('normal', [{ op: 'cardChoice', rarity: 'rare' }])], 'Les Wabbits sortent de partout.'),
      hide('Laisser une carotte à l\'entrée', [luck(0.6, [{ op: 'heal', n: 15 }], [],
        'Un petit Wabbit sort et t\'offre une infusion en retour.', 'La carotte disparaît. Rien d\'autre.')], ''),
      leave(),
    ],
  },
  {
    id: 'a2_gue', act: 2, title: 'Le gué des Crocodailles', art: { monster: 'crocodaille' },
    text: 'La rivière est large, et des yeux jaunes affleurent à la surface. Un passeur au sourire édenté propose sa barque.',
    options: [
      open('Traverser à la nage', [{ op: 'loseHp', n: 10 }], 'Quelques morsures, mais tu passes.'),
      cost('Payer le passeur', [{ op: 'kamas', n: -40 }, luck(0.75, [], [fight('normal')],
        'Une traversée tranquille.', 'Au milieu du fleuve, le passeur saute à l\'eau. La barque est cernée.')], ''),
      hide('Chasser les Crocodailles', [fight('elite', [{ op: 'itemChoice', rarity: 'mythique' }])], 'Le chef sort de l\'eau. Il est énorme.'),
    ],
  },
  {
    id: 'a2_scarafeuilles', act: 2, title: 'La pluie de carapaces', art: { monster: 'scarafeuille_bleu' },
    text: 'Des Scarafeuilles ont mué cette nuit. Leurs carapaces brillent sur le sol comme des gemmes, et un marchand ambulant les regarde avec envie.',
    options: [
      hide('Les garder pour toi', [{ op: 'prosp', n: 30 }], 'En les observant, tu apprends à reconnaître ce qui brille vraiment.'),
      hide('Les vendre au marchand', [{ op: 'kamas', n: 60 }], 'Il te les achète sans discuter. Trop vite, peut-être.'),
      leave(),
    ],
  },
  {
    id: 'a2_alchimiste', act: 2, title: 'L\'alchimiste', art: { breed: 10 },
    text: 'Un Sadida aligne des fioles fumantes sur une souche. « Une rouge, une bleue, une verte. Je ne garantis rien. Je ne me souviens plus laquelle fait quoi. »',
    options: [
      hide('La rouge', [{ op: 'maxHp', n: 8 }, { op: 'curse', id: 'malediction_fardeau' }], 'Ton cœur bat plus fort. Et plus lourd.'),
      hide('La bleue', [{ op: 'pick', what: 'upgrade', n: 1 }], 'Tes idées s\'éclaircissent d\'un coup.'),
      hide('La verte', [luck(0.5, [{ op: 'healPct', pct: 1 }], [{ op: 'loseHp', n: 10 }],
        'Un goût de menthe, et toutes tes plaies se ferment.', 'Un goût de vase, et une migraine terrible.')], ''),
    ],
  },
  {
    id: 'a2_lac', act: 2, title: 'Le lac miroir', art: { breed: 7 },
    text: 'Un lac si calme que ton reflet semble vivant. Il te regarde. Il attend. Et il cligne des yeux une fraction de seconde après toi.',
    options: [
      hide('Contempler ton reflet', [{ op: 'pick', what: 'duplicate', n: 1 }], 'Le reflet t\'offre un de tes propres sorts.'),
      go('Plonger la main dans le reflet', 'L\'eau est glacée.',
        'Ton reflet t\'attrape le poignet. Il sourit, avec tes dents. « Donne-moi quelque chose, et je te laisse partir. »', [
          hide('Lui donner un souvenir', [{ op: 'pick', what: 'remove', n: 2 }], 'Il prend deux souvenirs et te relâche. Tu te sens plus léger.'),
          hide('Lui donner un peu de sang', [{ op: 'loseHp', n: 8 }, { op: 'maxHp', n: 4 }], 'Il boit, satisfait, et te rend une part de sa force.'),
          hide('Tirer de toutes tes forces', [luck(0.5, [], [fight('normal')],
            'Tu tombes en arrière, libre.', 'Tu tires si fort que tu le sors de l\'eau. Il n\'est pas venu seul.')], ''),
        ]),
      leave(),
    ],
  },
  {
    id: 'a2_bandits', act: 2, title: 'Les bandits roublards', art: { monster: 'bandit_roublard' },
    text: 'Trois silhouettes sortent des fourrés, bombes à la main. « Péage, l\'ami. Ou on se sert, et on se sert bien. »',
    options: [
      cost('Payer le péage', [{ op: 'kamas', n: -60 }], '« Bonne route ! » Ils rient encore quand tu t\'éloignes.'),
      open('Se battre', [fight('normal', [{ op: 'kamas', n: 90 }])], 'Ils allument leurs mèches.'),
      hide('Leur raconter une histoire', [luck(0.4, [{ op: 'kamas', n: 30 }], [{ op: 'loseHp', n: 10 }],
        'Ils rient tellement qu\'ils t\'offrent une part de leur butin.', 'Ils n\'aiment pas la fin. Les bombes partent.')], ''),
    ],
  },
  {
    id: 'a2_tronknyde', act: 2, title: 'Le Tronknyde endormi', art: { monster: 'tronknyde' },
    text: 'Un Tronknyde dort en travers du chemin. Sa sève coule, dorée et épaisse, et sent le miel. Il a l\'air d\'avoir le sommeil léger.',
    options: [
      hide('Récolter sa sève', [luck(0.7, [{ op: 'maxHp', n: 6 }], [fight('elite')],
        'Il grogne, se retourne, et se rendort.', 'Il ouvre un œil. Puis deux.')], ''),
      hide('Le réveiller', [fight('elite', [{ op: 'relic' }])], 'Il se lève, lentement. Il est bien plus grand debout.'),
      leave(),
    ],
  },
  {
    id: 'a2_graines', act: 2, title: 'La gardienne des graines', art: { breed: 10 },
    text: 'Une vieille Sadida échange des graines contre des souvenirs. « Donne-moi ce que tu sais faire. Je te donnerai ce que tu pourrais faire. »',
    options: [
      hide('Accepter l\'échange', [{ op: 'pick', what: 'remove', n: 1 }, { op: 'cardChoice', rarity: 'rare' }], 'Elle plante ta carte. Une autre pousse aussitôt.'),
      cost('Lui acheter des graines', [{ op: 'kamas', n: -40 }, { op: 'maxHp', n: 7 }], 'Croquantes et nourrissantes.'),
      leave(),
    ],
  },

  // ───────────── Acte 3 : Landes de Brâkmar ─────────────
  {
    id: 'a3_pacte', act: 3, title: 'Le pacte', art: { breed: 11 },
    text: 'Une silhouette cornue sort de la brume. « Un pacte. Je te donne ce que tu veux. Tu me donnes… presque rien. » Elle tient une plume trempée dans quelque chose de rouge.',
    options: [
      hide('Signer sans lire', [{ op: 'relic' }, { op: 'curse', id: 'malediction_honte' }, { op: 'maxHp', n: -5 }], 'L\'encre brûle. La relique aussi.'),
      go('Demander ce qu\'est ce « presque rien »', 'Elle sourit de toutes ses dents.',
        '« Un souvenir. Juste un. Et tu repars avec un trésor. Ou tu refuses, et je me fâche. »', [
          hide('Accepter', [{ op: 'pick', what: 'remove', n: 1 }, { op: 'itemChoice', rarity: 'mythique' }], 'Un souvenir s\'efface. Le trésor, lui, est bien réel.'),
          hide('Refuser poliment', [luck(0.5, [], [fight('elite')],
            'Elle hausse les épaules et disparaît dans la brume.', 'Elle se fâche.')], ''),
        ]),
      leave('Rebrousser chemin', '« On se reverra. »'),
    ],
  },
  {
    id: 'a3_milice', act: 3, title: 'La milice de Brâkmar', art: { breed: 4 },
    text: 'Des miliciens en armure noire contrôlent le passage. Ils fouillent tout le monde. Sauf ceux qui paient. Le chef tapote sa paume avec une matraque cloutée.',
    options: [
      cost('Payer', [{ op: 'kamas', n: -80 }], 'Ils s\'écartent avec un sourire en coin.'),
      open('Forcer le passage', [fight('elite', [{ op: 'itemChoice', rarity: 'mythique' }])], 'Les lames sortent des fourreaux.'),
      hide('Se laisser fouiller', [{ op: 'pick', what: 'remove', n: 1 }, { op: 'loseHp', n: 4 }], 'Ils confisquent ce qui leur plaît, et te bousculent un peu.'),
    ],
  },
  {
    id: 'a3_forge', act: 3, title: 'La forge infernale', art: { monster: 'dragon_cochon' },
    text: 'Une forge creusée dans la roche volcanique. Le métal y fond en un instant. Un forgeron sans visage te tend des pinces, sans un mot.',
    options: [
      cost('Tremper tes armes dans la lave', [{ op: 'loseHp', n: 10 }, { op: 'upgradeAll', type: 'attaque' }], 'Tes mains brûlent. Tes attaques aussi.'),
      cost('Lui commander une relique', [{ op: 'kamas', n: -150 }, { op: 'relic' }], 'Le métal prend une forme que tu n\'avais pas prévue.'),
      leave(),
    ],
  },
  {
    id: 'a3_koalaks', act: 3, title: 'Le village Koalak', art: { monster: 'koalak_coco' },
    text: 'Des huttes, un grand feu, et des Koalaks qui partagent leur repas en chantant. Leur réserve de nourriture est juste derrière, mal gardée.',
    options: [
      open('Partager le repas', [{ op: 'healPct', pct: 0.35 }], 'Tu n\'avais pas aussi bien mangé depuis Amakna.'),
      hide('Piller la réserve', [fight('normal', [{ op: 'kamas', n: 100 }])], 'Les Koalaks n\'ont plus du tout l\'air accueillants.'),
      leave(),
    ],
  },
  {
    id: 'a3_corbeau', act: 3, title: 'Le corbeau messager', art: { monster: 'corbac' },
    text: 'Un corbeau se pose sur ton épaule, un parchemin à la patte. Puis il s\'envole vers les collines en croassant, comme pour t\'inviter à le suivre.',
    options: [
      hide('Lire le message', [{ op: 'cardChoice', rarity: 'rare' }], 'Une technique oubliée, griffonnée à la hâte.'),
      hide('Suivre le corbeau', [luck(0.5, [{ op: 'itemChoice', rarity: 'mythique' }], [{ op: 'loseHp', n: 8 }],
        'Il te mène à une cache oubliée.', 'Il te mène droit dans une embuscade, et disparaît.')], ''),
      leave(),
    ],
  },
  {
    id: 'a3_sanctuaire', act: 3, title: 'Le sanctuaire oublié', art: { breed: 1 },
    text: 'Un sanctuaire Féca à moitié effondré. Les glyphes y brillent encore faiblement. Les offrandes des pèlerins sont toujours là, intactes.',
    options: [
      hide('Prier', [{ op: 'pick', what: 'remove', n: 2 }], 'Les glyphes s\'illuminent. Tu te sens délesté.'),
      hide('Piller les offrandes', [{ op: 'relic' }, { op: 'curse', id: 'malediction_doute' }, { op: 'curse', id: 'malediction_honte' }], 'Les glyphes s\'éteignent un à un derrière toi.'),
      leave(),
    ],
  },
  {
    id: 'a3_dragon', act: 3, title: 'Le trésor du Dragon Cochon', art: { monster: 'dragon_cochon' },
    text: 'Le Dragon Cochon dort sur son trésor. Il ronfle. Fort. Une relique dépasse du tas d\'or, juste à portée de main.',
    options: [
      hide('Prendre la relique en douce', [luck(0.5, [{ op: 'relic' }], [fight('elite')],
        'Il ne se réveille pas. Incroyable.', 'Il ouvre un œil. Il n\'a pas l\'air content.')], ''),
      hide('Ramasser quelques pièces', [luck(0.8, [{ op: 'kamas', n: 60 }], [fight('elite')],
        'Une poignée de kamas, il ne s\'en apercevra pas.', 'Une pièce tombe. Ding.')], ''),
      leave(),
    ],
  },
  {
    id: 'a3_marais', act: 3, title: 'Le marais empoisonné', art: { monster: 'kaskargo' },
    text: 'Une eau verte et des bulles qui éclatent en sifflant. Sur l\'autre rive, les restes d\'un aventurier, et son sac, bien rempli.',
    options: [
      cost('Traverser', [{ op: 'loseHp', n: 10 }, { op: 'itemChoice', rarity: 'rare' }], 'Le poison pique, mais le sac est bien rempli.'),
      open('Contourner', [{ op: 'heal', n: 5 }], 'Un long détour, qui te laisse le temps de souffler.'),
    ],
  },
  {
    id: 'a3_mansot', act: 3, title: 'Le Mansot perdu', art: { monster: 'timansot' },
    text: 'Un petit Mansot grelotte dans les landes, bien loin de la banquise. Il te suit en se dandinant, et pépie chaque fois que tu t\'arrêtes.',
    options: [
      open('L\'escorter jusque chez lui', [fight('normal', [{ op: 'maxHp', n: 8 }])], 'Des monstres rôdent sur le chemin du retour.'),
      hide('Le réchauffer', [{ op: 'heal', n: 10 }], 'Il se blottit contre toi. Toi aussi, ça te réchauffe.'),
      leave(),
    ],
  },
  {
    id: 'a3_taverne', act: 3, title: 'La taverne de Brâkmar', art: { breed: 12 },
    text: 'Une taverne enfumée, des joueurs de dés à la mine patibulaire, un tavernier qui ne pose pas de questions. Quelqu\'un t\'offre une place à sa table.',
    options: [
      cost('Payer une tournée', [{ op: 'kamas', n: -50 }, { op: 'healPct', pct: 1 }], 'Toute la taverne trinque à ta santé. Ça marche.'),
      cost('Jouer aux dés', [{ op: 'kamas', n: -60 }, luck(0.45, [{ op: 'kamas', n: 210 }], [],
        'Double six ! Tu rafles la mise.', 'Les dés ne t\'aiment pas ce soir.')], ''),
      open('Dormir dans un coin', [{ op: 'heal', n: 15 }], 'Personne ne te dérange.'),
    ],
  },
  {
    id: 'a3_statue', act: 3, title: 'La statue de Rushu', art: { iconId: 18052 },
    text: 'Une statue du démon Rushu, ses yeux de rubis rougeoient. Un shushu y est enchâssé, vivant, et il te murmure des promesses.',
    options: [
      cost('Prendre le shushu', [{ op: 'loseHp', n: 15 }, { op: 'relic', id: 'anneau_rushu' }], 'Il te brûle la main, mais il est à toi.'),
      hide('Briser la statue', [fight('elite', [{ op: 'kamas', n: 150 }])], 'Les gardiens de pierre s\'animent.'),
      leave(),
    ],
  },
  {
    id: 'a3_ermite', act: 3, title: 'L\'ermite des landes', art: { breed: 5 },
    text: 'Un vieux Xélor médite dans une grotte, entouré de sabliers qui coulent à l\'envers. « Le temps m\'a appris deux ou trois choses. Assieds-toi. »',
    options: [
      hide('Méditer avec lui', [{ op: 'upgrade', n: 2 }], 'Le temps passe différemment, ici.'),
      cost('Lui offrir des kamas', [{ op: 'kamas', n: -100 }, { op: 'pick', what: 'upgrade', n: 3 }], 'Il te montre ce qu\'il n\'apprend à personne.'),
      hide('Lui demander conseil', [{ op: 'pick', what: 'remove', n: 1 }], '« Garde l\'essentiel. Oublie le reste. »'),
    ],
  },
  {
    id: 'a3_coffre', act: 3, title: 'Le coffre maudit', art: { monster: 'coffre_maudit' },
    text: 'Un coffre couvert de chaînes, des runes gravées sur le couvercle. Il bouge, un peu. Il respire, peut-être.',
    options: [
      hide('L\'ouvrir en grand', [{ op: 'relic' }, { op: 'curse', id: 'malediction_fardeau' }], 'Une relique, et une ombre qui s\'accroche à toi.'),
      hide('L\'entrouvrir prudemment', [{ op: 'itemChoice', rarity: 'rare' }], 'Tu glisses la main, attrapes ce que tu peux, et refermes.'),
      leave(),
    ],
  },
  {
    id: 'a3_fontaine', act: 3, title: 'La fontaine de sang', art: { breed: 11 },
    text: 'Une fontaine où coule un liquide rouge et chaud. Les Sacrieurs viennent y puiser leur force. L\'un d\'eux t\'observe, bras croisés.',
    options: [
      hide('Boire', [{ op: 'maxHp', n: 10 }, { op: 'curse', id: 'malediction_honte' }], 'Le sang te rend plus fort. Et un peu moins toi-même.'),
      hide('S\'y laver', [{ op: 'pick', what: 'remove', n: 1 }], 'Ce qui te pesait s\'en va avec l\'eau rouge.'),
      leave(),
    ],
  },
  {
    id: 'a3_ombres', act: 3, title: 'Le marchand des ombres', art: { breed: 4 },
    text: 'Un marchand sans visage ouvre son manteau. Des reliques y pendent, et des objets que personne n\'a vendus depuis des siècles. « Tout a un prix. Le mien est juste. »',
    options: [
      cost('Acheter une relique', [{ op: 'kamas', n: -180 }, { op: 'relic' }], '« Elle t\'a choisi. »'),
      cost('Acheter un objet', [{ op: 'kamas', n: -110 }, { op: 'itemChoice', rarity: 'mythique' }], '« Bon usage. »'),
      leave('Passer ton chemin', 'Il se fond dans l\'ombre.'),
    ],
  },
];

export const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
