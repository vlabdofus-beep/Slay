// Événements des cases « ? » : 15 par acte, à la manière de Slay the Spire. Une scène, deux ou trois choix,
// chacun avec un prix clair. Certains mènent à un combat, d'autres à une relique (légendaire, sans emplacement).
// Les coûts sont vérifiés automatiquement : pas assez de kamas, ou un prix en PV qui te tuerait, et le choix est grisé.
import type { RunOp } from '../game/boons.ts';
import type { Act } from './monsters.ts';

export interface EventOption {
  label: string;
  ops: RunOp[];
  /** Ce qui se passe ensuite, raconté. */
  after: string;
}

export interface EventArt { breed?: number; monster?: string; iconId?: number }

export interface GameEvent {
  id: string;
  act: Act;
  title: string;
  art: EventArt;
  text: string;
  options: EventOption[];
}

const leave = (after = 'Tu reprends la route.'): EventOption => ({ label: 'Passer ton chemin', ops: [], after });

export const EVENTS: GameEvent[] = [
  // ───────────── Acte 1 : Amakna ─────────────
  {
    id: 'a1_fontaine', act: 1, title: 'La fontaine d\'Astrub', art: { iconId: 12768 },
    text: 'Une fontaine de pierre murmure au bord du chemin. Les habitants disent que son eau guérit, et que ceux qui y jettent une pièce voient leurs sorts s\'affûter.',
    options: [
      { label: 'Boire à la fontaine', ops: [{ op: 'healPct', pct: 0.3 }], after: 'L\'eau est fraîche. Tes plaies se referment.' },
      { label: 'Y jeter des kamas', ops: [{ op: 'kamas', n: -50 }, { op: 'pick', what: 'upgrade', n: 1 }], after: 'La pièce brille au fond de l\'eau. Un de tes sorts brille aussi.' },
      leave(),
    ],
  },
  {
    id: 'a1_bouftou', act: 1, title: 'Un Bouftou égaré', art: { monster: 'bouftou' },
    text: 'Un petit Bouftou bêle au milieu du champ, loin de son troupeau. Un berger le cherche sûrement. Sa laine, elle, vaut de l\'or.',
    options: [
      { label: 'Le ramener au berger', ops: [{ op: 'kamas', n: 45 }], after: 'Le berger te remercie d\'une bourse bien remplie.' },
      { label: 'Le tondre', ops: [{ op: 'cardChoice', rarity: 'rare' }, { op: 'curse', id: 'malediction_honte' }], after: 'La laine est magnifique. Le regard du Bouftou, lui, te poursuit.' },
      leave('Le Bouftou finira bien par retrouver les siens.'),
    ],
  },
  {
    id: 'a1_champignons', act: 1, title: 'Le cercle de champignons', art: { monster: 'champ_champ' },
    text: 'Un cercle parfait de champignons dorés pousse sous les arbres. Certains disent qu\'ils rendent plus robuste. D\'autres ne sont jamais revenus pour le dire.',
    options: [
      { label: 'En manger un', ops: [{ op: 'chance', p: 0.5, win: [{ op: 'maxHp', n: 6 }], lose: [{ op: 'loseHp', n: 8 }], winText: 'Une chaleur agréable t\'envahit. Tu te sens plus solide.', loseText: 'Ton ventre se tord. Mauvais champignon.' }], after: '' },
      { label: 'En cueillir pour le marchand', ops: [{ op: 'kamas', n: 30 }], after: 'Le marchand d\'Astrub t\'en offre un bon prix.' },
      leave(),
    ],
  },
  {
    id: 'a1_forge', act: 1, title: 'La forge d\'Astrub', art: { breed: 8 },
    text: 'Le forgeron, un vieux Iop aux bras couverts de suie, propose de retravailler ton équipement. Gratuitement pour une pièce, contre des kamas pour du travail soigné.',
    options: [
      { label: 'Faire retravailler une carte', ops: [{ op: 'pick', what: 'upgrade', n: 1 }], after: 'Quelques coups de marteau, et c\'est comme neuf.' },
      { label: 'Payer pour du travail soigné', ops: [{ op: 'kamas', n: -75 }, { op: 'pick', what: 'upgrade', n: 2 }], after: 'Le forgeron prend son temps. Le résultat en vaut la peine.' },
      leave(),
    ],
  },
  {
    id: 'a1_nid_tofu', act: 1, title: 'Le nid de Tofu', art: { monster: 'tofu' },
    text: 'Dans un buisson, un nid de Tofus. Au milieu, une plume irisée, sûrement tombée du Tofu Royal. Les Tofus, eux, ne semblent pas prêts à la laisser partir.',
    options: [
      { label: 'Prendre la plume', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'relic', id: 'plume_tofu' }] }], after: 'Les Tofus se jettent sur toi en piaillant !' },
      leave('Les Tofus te regardent partir, soupçonneux.'),
    ],
  },
  {
    id: 'a1_milice', act: 1, title: 'La milice d\'Astrub', art: { breed: 1 },
    text: 'Un milicien te barre la route. Il cherche des volontaires pour chasser les monstres qui rôdent autour de la ville. La paie est correcte.',
    options: [
      { label: 'Accepter la mission', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'kamas', n: 80 }] }], after: 'Il te montre la direction des monstres.' },
      { label: 'Proposer tes services de soigneur', ops: [{ op: 'healPct', pct: 0.15 }, { op: 'kamas', n: 25 }], after: 'Une journée tranquille à l\'infirmerie, un peu payée.' },
      leave(),
    ],
  },
  {
    id: 'a1_autel', act: 1, title: 'L\'autel abandonné', art: { breed: 11 },
    text: 'Au cœur d\'une clairière, un autel couvert de mousse. Des traces de sang séché, et une relique posée dessus, intacte. Une inscription demande une offrande.',
    options: [
      { label: 'Offrir ton sang', ops: [{ op: 'loseHp', n: 12 }, { op: 'relic' }], after: 'L\'autel boit ton offrande. La relique est à toi.' },
      { label: 'Prier', ops: [{ op: 'pick', what: 'remove', n: 1 }], after: 'Tu laisses à l\'autel une part de toi dont tu n\'avais plus besoin.' },
      leave(),
    ],
  },
  {
    id: 'a1_colporteur', act: 1, title: 'Le colporteur', art: { breed: 3 },
    text: 'Un vieil Enutrof tire une charrette pleine de bric-à-brac. « Tout est à vendre, petit ! Même ce qui n\'a pas de prix. »',
    options: [
      { label: 'Acheter un objet', ops: [{ op: 'kamas', n: -60 }, { op: 'itemChoice', rarity: 'rare' }], after: '« Excellent choix ! Enfin, tous mes choix sont excellents. »' },
      { label: 'Acheter une relique', ops: [{ op: 'kamas', n: -150 }, { op: 'relic' }], after: 'Il te la tend du bout des doigts, presque à regret.' },
      leave('« Reviens quand tu auras des kamas ! »'),
    ],
  },
  {
    id: 'a1_puits', act: 1, title: 'Le vieux puits', art: { monster: 'larve_bleue' },
    text: 'Un puits à sec, une échelle qui descend dans le noir. Des bruits de reptation montent du fond. Et quelque chose brille.',
    options: [
      { label: 'Descendre', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'itemChoice', rarity: 'rare' }] }], after: 'Des Larves surgissent de l\'ombre !' },
      { label: 'Jeter une pièce et faire un vœu', ops: [{ op: 'kamas', n: -10 }, { op: 'chance', p: 0.3, win: [{ op: 'relic' }], lose: [], winText: 'Un éclat remonte du puits et tombe dans ta main.', loseText: 'Plouf. Rien ne se passe.' }], after: '' },
      leave(),
    ],
  },
  {
    id: 'a1_fermier', act: 1, title: 'Le fermier excédé', art: { monster: 'boufton_noir' },
    text: 'Un fermier agite sa fourche : un Boufton noir saccage ses cultures depuis des jours. Ses poules, elles, picorent sans surveillance.',
    options: [
      { label: 'Chasser le Boufton', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'kamas', n: 70 }] }], after: 'Le Boufton noir t\'attend au milieu du champ.' },
      { label: 'Voler les poules', ops: [{ op: 'kamas', n: 50 }, { op: 'curse', id: 'malediction_honte' }], after: 'Les poules se vendent bien. Ta conscience, un peu moins.' },
      leave(),
    ],
  },
  {
    id: 'a1_fete', act: 1, title: 'La fête du village', art: { breed: 12 },
    text: 'Des lampions, de la musique, et un Pandawa qui organise un concours de boisson. Le premier qui tombe a perdu.',
    options: [
      { label: 'Danser jusqu\'au matin', ops: [{ op: 'heal', n: 15 }], after: 'Tu repars fatigué, mais le cœur léger.' },
      { label: 'Relever le défi', ops: [{ op: 'chance', p: 0.5, win: [{ op: 'maxHp', n: 5 }, { op: 'kamas', n: 40 }], lose: [{ op: 'loseHp', n: 6 }], winText: 'Le Pandawa tombe le premier. Tu empoches la mise.', loseText: 'Tu te réveilles sous une table, la tête en vrac.' }], after: '' },
      leave(),
    ],
  },
  {
    id: 'a1_bibliotheque', act: 1, title: 'La bibliothèque d\'Astrub', art: { breed: 5 },
    text: 'Des rayonnages jusqu\'au plafond, et un bibliothécaire Xélor qui ne lève pas les yeux. Il y a là de quoi apprendre, ou de quoi emprunter sans rendre.',
    options: [
      { label: 'Étudier', ops: [{ op: 'pick', what: 'upgrade', n: 1 }], after: 'Quelques heures de lecture, un sort mieux compris.' },
      { label: 'Recopier un sort', ops: [{ op: 'pick', what: 'duplicate', n: 1 }], after: 'Ta plume court sur le parchemin.' },
      { label: 'Emprunter un parchemin', ops: [{ op: 'relic', id: 'parchemin_sagesse' }, { op: 'curse', id: 'malediction_fardeau' }], after: 'Le Xélor lève enfin les yeux. Trop tard, tu es parti.' },
    ],
  },
  {
    id: 'a1_pissenlits', act: 1, title: 'Les pissenlits enchantés', art: { monster: 'pissenlit' },
    text: 'Un champ de pissenlits dont les aigrettes scintillent. On raconte qu\'en souffler une change le destin.',
    options: [
      { label: 'Souffler une aigrette', ops: [{ op: 'pick', what: 'transform', n: 1 }], after: 'L\'aigrette s\'envole, et emporte un sort avec elle. Un autre prend sa place.' },
      { label: 'En faire une tisane', ops: [{ op: 'maxHp', n: 4 }], after: 'Amère, mais revigorante.' },
      leave(),
    ],
  },
  {
    id: 'a1_aventurier', act: 1, title: 'L\'aventurier blessé', art: { breed: 9 },
    text: 'Une Crâ est adossée à un arbre, une flèche dans la jambe. Elle serre contre elle une sacoche. « Aide-moi… je saurai te remercier. »',
    options: [
      { label: 'La soigner', ops: [{ op: 'loseHp', n: 8 }, { op: 'cardChoice', rarity: 'rare' }], after: 'Tu y laisses des forces. Elle t\'apprend un tir en échange.' },
      { label: 'Prendre la sacoche', ops: [{ op: 'kamas', n: 70 }, { op: 'curse', id: 'malediction_honte' }], after: 'Elle te regarde partir sans un mot.' },
      leave(),
    ],
  },
  {
    id: 'a1_toile', act: 1, title: 'La toile de l\'Arakne', art: { monster: 'arakne' },
    text: 'Une toile géante barre le sentier. Des cocons y pendent, et dans l\'un d\'eux, l\'éclat d\'un objet.',
    options: [
      { label: 'Fouiller les cocons', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'itemChoice', rarity: 'rare' }] }], after: 'La propriétaire de la toile n\'apprécie pas.' },
      { label: 'Trancher la toile', ops: [{ op: 'loseHp', n: 5 }, { op: 'pick', what: 'remove', n: 1 }], after: 'Tu t\'en sors, en laissant un peu de toi dans les fils.' },
      leave('Tu fais un long détour.'),
    ],
  },

  // ───────────── Acte 2 : Forêt des Abraknydes ─────────────
  {
    id: 'a2_chene', act: 2, title: 'Le vieux chêne', art: { monster: 'abraknyde' },
    text: 'Un Abraknyde si vieux qu\'il ne bouge plus. Sa voix craque comme du bois sec. « Écoute, petit. Ou prends, si tu l\'oses. »',
    options: [
      { label: 'Écouter ses conseils', ops: [{ op: 'upgrade', n: 2 }], after: 'Il parle longtemps. Tu en retiens l\'essentiel.' },
      { label: 'Arracher une branche', ops: [{ op: 'fight', tier: 'elite', then: [{ op: 'relic' }] }], after: 'La forêt entière se réveille.' },
      leave(),
    ],
  },
  {
    id: 'a2_sources', act: 2, title: 'Les sources chaudes', art: { breed: 7 },
    text: 'De la vapeur s\'élève entre les rochers. L\'eau est chaude, et quelque chose luit tout au fond du bassin.',
    options: [
      { label: 'Se baigner', ops: [{ op: 'healPct', pct: 0.4 }], after: 'Tu ressors comme neuf.' },
      { label: 'Plonger au fond', ops: [{ op: 'loseHp', n: 6 }, { op: 'itemChoice', rarity: 'rare' }], after: 'L\'eau brûle, mais tu remontes avec un trésor.' },
      leave(),
    ],
  },
  {
    id: 'a2_bworks', act: 2, title: 'Le campement Bwork', art: { monster: 'bwork' },
    text: 'Des Bworks ronflent autour d\'un feu mourant. Leur butin est entassé au milieu, à peine gardé.',
    options: [
      { label: 'Attaquer', ops: [{ op: 'fight', tier: 'elite', then: [{ op: 'kamas', n: 120 }] }], after: 'Les ronflements s\'arrêtent net.' },
      { label: 'Se faufiler', ops: [{ op: 'chance', p: 0.6, win: [{ op: 'kamas', n: 80 }], lose: [{ op: 'fight', tier: 'normal' }], winText: 'Personne ne bouge. Tu repars les poches pleines.', loseText: 'Une branche craque. Un Bwork ouvre un œil.' }], after: '' },
      leave(),
    ],
  },
  {
    id: 'a2_nid', act: 2, title: 'Le nid de Dragoeuf', art: { iconId: 105204 },
    text: 'Un nid de pierre, un œuf encore chaud. Les parents ne sont pas loin : on entend leurs ailes dans les arbres.',
    options: [
      { label: 'Prendre l\'œuf', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'relic', id: 'oeuf_dragodinde' }] }], after: 'Les parents arrivent, furieux.' },
      { label: 'Le couver un moment', ops: [{ op: 'healPct', pct: 0.2 }], after: 'La chaleur de l\'œuf te réconforte.' },
      leave(),
    ],
  },
  {
    id: 'a2_cartomancienne', act: 2, title: 'La cartomancienne', art: { breed: 6 },
    text: 'Une Écaflip étale ses cartes sur une souche. « Le destin se change, mon chou. Ça se paie, mais ça se change. »',
    options: [
      { label: 'Changer ton destin', ops: [{ op: 'kamas', n: -50 }, { op: 'pick', what: 'transform', n: 2 }], after: 'Elle retourne deux cartes. Elles ne sont plus les mêmes.' },
      { label: 'Tirer une carte', ops: [{ op: 'kamas', n: -30 }, { op: 'cardChoice', rarity: 'rare' }], after: '« Celle-là, elle t\'attendait. »' },
      leave('« Le destin, lui, ne te lâchera pas. »'),
    ],
  },
  {
    id: 'a2_ruines', act: 2, title: 'Les ruines du temple', art: { breed: 4 },
    text: 'Les restes d\'un temple dévoré par les racines. Les pièges y sont encore armés, mais les trésors aussi.',
    options: [
      { label: 'Fouiller les ruines', ops: [{ op: 'chance', p: 0.5, win: [{ op: 'relic' }], lose: [{ op: 'loseHp', n: 5 }, { op: 'curse', id: 'malediction_doute' }], winText: 'Derrière une dalle, une relique intacte.', loseText: 'Un piège se déclenche. Tu repars blessé, et troublé.' }], after: '' },
      { label: 'Désarmer un piège', ops: [{ op: 'pick', what: 'upgrade', n: 1 }], after: 'Le mécanisme est ingénieux. Tu en retiens la leçon.' },
      leave(),
    ],
  },
  {
    id: 'a2_chafer', act: 2, title: 'Le Chafer repenti', art: { monster: 'chafer' },
    text: 'Un squelette assis sur une pierre. « Je cherche mes os. Tu ne les aurais pas vus ? Je paie bien. »',
    options: [
      { label: 'Lui donner une carte', ops: [{ op: 'pick', what: 'remove', n: 1 }, { op: 'kamas', n: 40 }], after: '« Ce n\'est pas un os, mais ça fera l\'affaire. »' },
      { label: 'Le renvoyer à la poussière', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'cardChoice', rarity: 'toute' }] }], after: 'Il soupire. Ses amis, eux, sortent de terre.' },
      leave(),
    ],
  },
  {
    id: 'a2_wabbits', act: 2, title: 'Le terrier des Wabbits', art: { monster: 'wabbit' },
    text: 'Des carottes à l\'entrée d\'un terrier immense. Les Wabbits gardent jalousement leur grimoire.',
    options: [
      { label: 'Entrer dans le terrier', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'cardChoice', rarity: 'rare' }] }], after: 'Les Wabbits sortent de partout.' },
      { label: 'Laisser une carotte', ops: [{ op: 'heal', n: 12 }], after: 'Un petit Wabbit t\'offre une infusion en retour.' },
      leave(),
    ],
  },
  {
    id: 'a2_gue', act: 2, title: 'Le gué des Crocodailles', art: { monster: 'crocodaille' },
    text: 'La rivière est large, et des yeux jaunes affleurent à la surface. Un passeur propose sa barque.',
    options: [
      { label: 'Traverser à la nage', ops: [{ op: 'loseHp', n: 10 }], after: 'Quelques morsures, mais tu passes.' },
      { label: 'Payer le passeur', ops: [{ op: 'kamas', n: -40 }], after: 'Une traversée tranquille.' },
      { label: 'Chasser les Crocodailles', ops: [{ op: 'fight', tier: 'elite', then: [{ op: 'itemChoice', rarity: 'mythique' }] }], after: 'Le chef sort de l\'eau, et il est énorme.' },
    ],
  },
  {
    id: 'a2_scarafeuilles', act: 2, title: 'La pluie de feuilles', art: { monster: 'scarafeuille_bleu' },
    text: 'Des Scarafeuilles ont perdu leurs carapaces. Elles brillent sur le sol comme des gemmes.',
    options: [
      { label: 'Les ramasser', ops: [{ op: 'prosp', n: 30 }], after: 'Tu sais désormais où chercher ce qui brille.' },
      { label: 'Les vendre', ops: [{ op: 'kamas', n: 60 }], after: 'Un artisan te les achète sans discuter.' },
      leave(),
    ],
  },
  {
    id: 'a2_alchimiste', act: 2, title: 'L\'alchimiste', art: { breed: 10 },
    text: 'Un Sadida aligne des fioles fumantes. « Une rouge, une bleue, une verte. Je ne garantis rien. »',
    options: [
      { label: 'La rouge', ops: [{ op: 'maxHp', n: 8 }, { op: 'curse', id: 'malediction_fardeau' }], after: 'Ton cœur bat plus fort. Et plus lourd.' },
      { label: 'La bleue', ops: [{ op: 'pick', what: 'upgrade', n: 1 }], after: 'Tes idées s\'éclaircissent.' },
      { label: 'La verte', ops: [{ op: 'chance', p: 0.5, win: [{ op: 'healPct', pct: 1 }], lose: [{ op: 'loseHp', n: 10 }], winText: 'Un goût de menthe, et toutes tes plaies se ferment.', loseText: 'Un goût de vase, et une grosse migraine.' }], after: '' },
    ],
  },
  {
    id: 'a2_lac', act: 2, title: 'Le lac miroir', art: { breed: 7 },
    text: 'Un lac si calme que ton reflet semble vivant. Il te regarde, et il attend.',
    options: [
      { label: 'Contempler ton reflet', ops: [{ op: 'pick', what: 'duplicate', n: 1 }], after: 'Le reflet t\'offre un de tes propres sorts.' },
      { label: 'Briser le reflet', ops: [{ op: 'loseHp', n: 8 }, { op: 'pick', what: 'remove', n: 2 }], after: 'L\'eau se trouble. Tu te sens plus léger.' },
      leave(),
    ],
  },
  {
    id: 'a2_bandits', act: 2, title: 'Les bandits roublards', art: { monster: 'bandit_roublard' },
    text: 'Trois silhouettes sortent des fourrés. « Péage, l\'ami. Ou on se sert. »',
    options: [
      { label: 'Payer le péage', ops: [{ op: 'kamas', n: -60 }], after: '« Bonne route ! » Ils rient encore quand tu t\'éloignes.' },
      { label: 'Se battre', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'kamas', n: 90 }] }], after: 'Ils dégainent.' },
      { label: 'Fuir à travers bois', ops: [{ op: 'loseHp', n: 12 }], after: 'Les ronces ne pardonnent pas.' },
    ],
  },
  {
    id: 'a2_tronknyde', act: 2, title: 'Le Tronknyde endormi', art: { monster: 'tronknyde' },
    text: 'Un Tronknyde dort en travers du chemin. Sa sève coule, dorée et épaisse. Il a l\'air d\'avoir le sommeil léger.',
    options: [
      { label: 'Récolter sa sève', ops: [{ op: 'maxHp', n: 6 }], after: 'Il grogne, se retourne, et se rendort.' },
      { label: 'Le réveiller', ops: [{ op: 'fight', tier: 'elite', then: [{ op: 'relic' }] }], after: 'Il ouvre un œil. Puis deux.' },
      leave(),
    ],
  },
  {
    id: 'a2_graines', act: 2, title: 'La gardienne des graines', art: { breed: 10 },
    text: 'Une vieille Sadida échange des graines contre des souvenirs. « Donne-moi ce que tu sais faire. Je te donnerai ce que tu pourrais faire. »',
    options: [
      { label: 'Échanger', ops: [{ op: 'pick', what: 'remove', n: 1 }, { op: 'cardChoice', rarity: 'rare' }], after: 'Elle plante ta carte. Une autre pousse aussitôt.' },
      { label: 'Lui acheter des graines', ops: [{ op: 'kamas', n: -40 }, { op: 'maxHp', n: 7 }], after: 'Croquantes et nourrissantes.' },
      leave(),
    ],
  },

  // ───────────── Acte 3 : Landes de Brâkmar ─────────────
  {
    id: 'a3_pacte', act: 3, title: 'Le pacte', art: { breed: 11 },
    text: 'Une silhouette cornue sort de la brume. « Une relique contre un peu de toi. Un tout petit peu. Tu signes ? »',
    options: [
      { label: 'Signer le pacte', ops: [{ op: 'relic' }, { op: 'curse', id: 'malediction_honte' }, { op: 'maxHp', n: -5 }], after: 'L\'encre brûle. La relique aussi.' },
      leave('« On se reverra. »'),
    ],
  },
  {
    id: 'a3_milice', act: 3, title: 'La milice de Brâkmar', art: { breed: 4 },
    text: 'Des miliciens en armure noire contrôlent le passage. Ils fouillent tout le monde. Sauf ceux qui paient.',
    options: [
      { label: 'Payer', ops: [{ op: 'kamas', n: -80 }], after: 'Ils s\'écartent avec un sourire en coin.' },
      { label: 'Forcer le passage', ops: [{ op: 'fight', tier: 'elite', then: [{ op: 'itemChoice', rarity: 'mythique' }] }], after: 'Les lames sortent des fourreaux.' },
      { label: 'Se laisser fouiller', ops: [{ op: 'pick', what: 'remove', n: 1 }, { op: 'loseHp', n: 4 }], after: 'Ils confisquent ce qui leur plaît, et te bousculent un peu.' },
    ],
  },
  {
    id: 'a3_forge', act: 3, title: 'La forge infernale', art: { monster: 'dragon_cochon' },
    text: 'Une forge creusée dans la roche volcanique. Le métal y fond en un instant, et la chaleur y est à peine supportable.',
    options: [
      { label: 'Tremper tes armes', ops: [{ op: 'loseHp', n: 10 }, { op: 'upgradeAll', type: 'attaque' }], after: 'Tes mains brûlent, tes attaques aussi.' },
      { label: 'Forger une relique', ops: [{ op: 'kamas', n: -150 }, { op: 'relic' }], after: 'Le métal prend une forme que tu n\'avais pas prévue.' },
      leave(),
    ],
  },
  {
    id: 'a3_koalaks', act: 3, title: 'Le village Koalak', art: { monster: 'koalak_coco' },
    text: 'Des huttes, un feu, et des Koalaks qui partagent leur repas. Leur réserve de nourriture est juste derrière.',
    options: [
      { label: 'Partager le repas', ops: [{ op: 'healPct', pct: 0.35 }], after: 'Tu n\'avais pas aussi bien mangé depuis Amakna.' },
      { label: 'Piller la réserve', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'kamas', n: 100 }] }], after: 'Les Koalaks n\'ont plus du tout l\'air accueillants.' },
      leave(),
    ],
  },
  {
    id: 'a3_corbeau', act: 3, title: 'Le corbeau messager', art: { monster: 'corbac' },
    text: 'Un corbeau se pose sur ton épaule, un parchemin à la patte. Puis il s\'envole vers les collines, comme pour t\'inviter à le suivre.',
    options: [
      { label: 'Lire le message', ops: [{ op: 'cardChoice', rarity: 'rare' }], after: 'Une technique oubliée, griffonnée à la hâte.' },
      { label: 'Suivre le corbeau', ops: [{ op: 'chance', p: 0.5, win: [{ op: 'itemChoice', rarity: 'mythique' }], lose: [{ op: 'loseHp', n: 8 }], winText: 'Il te mène à une cache oubliée.', loseText: 'Il te mène droit dans une embuscade, et disparaît.' }], after: '' },
      leave(),
    ],
  },
  {
    id: 'a3_sanctuaire', act: 3, title: 'Le sanctuaire oublié', art: { breed: 1 },
    text: 'Un sanctuaire Féca à moitié effondré. Les glyphes y brillent encore faiblement. Les offrandes des pèlerins sont toujours là.',
    options: [
      { label: 'Prier', ops: [{ op: 'pick', what: 'remove', n: 2 }], after: 'Les glyphes s\'illuminent. Tu te sens délesté.' },
      { label: 'Piller les offrandes', ops: [{ op: 'relic' }, { op: 'curse', id: 'malediction_doute' }, { op: 'curse', id: 'malediction_honte' }], after: 'Les glyphes s\'éteignent un à un derrière toi.' },
      leave(),
    ],
  },
  {
    id: 'a3_dragon', act: 3, title: 'Le trésor du Dragon Cochon', art: { monster: 'dragon_cochon' },
    text: 'Le Dragon Cochon dort sur son trésor. Il ronfle. Fort. Une relique dépasse du tas d\'or, juste à portée de main.',
    options: [
      { label: 'La prendre en douce', ops: [{ op: 'chance', p: 0.5, win: [{ op: 'relic' }], lose: [{ op: 'fight', tier: 'elite' }], winText: 'Il ne se réveille pas. Incroyable.', loseText: 'Il ouvre un œil. Il n\'a pas l\'air content.' }], after: '' },
      { label: 'Ramasser quelques pièces', ops: [{ op: 'kamas', n: 60 }], after: 'Une poignée de kamas, il ne s\'en apercevra pas.' },
      leave(),
    ],
  },
  {
    id: 'a3_marais', act: 3, title: 'Le marais empoisonné', art: { monster: 'kaskargo' },
    text: 'Une eau verte et des bulles qui éclatent en sifflant. Sur l\'autre rive, les restes d\'un aventurier et son sac.',
    options: [
      { label: 'Traverser', ops: [{ op: 'loseHp', n: 10 }, { op: 'itemChoice', rarity: 'rare' }], after: 'Le poison pique, mais le sac est bien rempli.' },
      { label: 'Contourner', ops: [{ op: 'heal', n: 5 }], after: 'Un long détour, qui te laisse le temps de souffler.' },
    ],
  },
  {
    id: 'a3_mansot', act: 3, title: 'Le Mansot perdu', art: { monster: 'timansot' },
    text: 'Un petit Mansot grelotte dans les landes, bien loin de la banquise. Il te suit en se dandinant.',
    options: [
      { label: 'L\'escorter', ops: [{ op: 'fight', tier: 'normal', then: [{ op: 'maxHp', n: 8 }] }], after: 'Des monstres rôdent sur le chemin du retour.' },
      { label: 'Le réchauffer', ops: [{ op: 'heal', n: 10 }], after: 'Il se blottit contre toi. Toi aussi, ça te réchauffe.' },
      leave(),
    ],
  },
  {
    id: 'a3_taverne', act: 3, title: 'La taverne de Brâkmar', art: { breed: 12 },
    text: 'Une taverne enfumée, des joueurs de dés, un tavernier qui ne pose pas de questions.',
    options: [
      { label: 'Payer une tournée', ops: [{ op: 'kamas', n: -50 }, { op: 'healPct', pct: 1 }], after: 'Toute la taverne trinque à ta santé. Ça marche.' },
      { label: 'Jouer aux dés', ops: [{ op: 'kamas', n: -60 }, { op: 'chance', p: 0.45, win: [{ op: 'kamas', n: 210 }], lose: [], winText: 'Double six ! Tu rafles la mise.', loseText: 'Les dés ne t\'aiment pas ce soir.' }], after: '' },
      { label: 'Se reposer dans un coin', ops: [{ op: 'heal', n: 15 }], after: 'Personne ne te dérange.' },
    ],
  },
  {
    id: 'a3_statue', act: 3, title: 'La statue de Rushu', art: { iconId: 18052 },
    text: 'Une statue du démon Rushu, ses yeux de rubis rougeoient. Un shushu y est enchâssé, vivant, et il te parle.',
    options: [
      { label: 'Prendre le shushu', ops: [{ op: 'loseHp', n: 15 }, { op: 'relic', id: 'anneau_rushu' }], after: 'Il te brûle la main, mais il est à toi.' },
      { label: 'Briser la statue', ops: [{ op: 'fight', tier: 'elite', then: [{ op: 'kamas', n: 150 }] }], after: 'Les gardiens de pierre s\'animent.' },
      leave(),
    ],
  },
  {
    id: 'a3_ermite', act: 3, title: 'L\'ermite des landes', art: { breed: 5 },
    text: 'Un vieux Xélor médite dans une grotte, entouré de sabliers. « Le temps m\'a appris deux ou trois choses. »',
    options: [
      { label: 'Méditer avec lui', ops: [{ op: 'upgrade', n: 2 }], after: 'Le temps passe différemment, ici.' },
      { label: 'Lui offrir des kamas', ops: [{ op: 'kamas', n: -100 }, { op: 'pick', what: 'upgrade', n: 3 }], after: 'Il te montre ce qu\'il n\'apprend à personne.' },
      { label: 'Lui demander conseil', ops: [{ op: 'pick', what: 'remove', n: 1 }], after: '« Garde l\'essentiel. Oublie le reste. »' },
    ],
  },
  {
    id: 'a3_coffre', act: 3, title: 'Le coffre maudit', art: { monster: 'coffre_maudit' },
    text: 'Un coffre couvert de chaînes, des runes gravées sur le couvercle. Il bouge, un peu.',
    options: [
      { label: 'L\'ouvrir', ops: [{ op: 'relic' }, { op: 'curse', id: 'malediction_fardeau' }], after: 'Une relique, et une ombre qui s\'accroche à toi.' },
      { label: 'L\'entrouvrir prudemment', ops: [{ op: 'itemChoice', rarity: 'rare' }], after: 'Tu glisses la main, attrapes ce que tu peux, et refermes.' },
      leave(),
    ],
  },
  {
    id: 'a3_fontaine', act: 3, title: 'La fontaine de sang', art: { breed: 11 },
    text: 'Une fontaine où coule un liquide rouge et chaud. Les Sacrieurs viennent y puiser leur force.',
    options: [
      { label: 'Boire', ops: [{ op: 'maxHp', n: 10 }, { op: 'curse', id: 'malediction_honte' }], after: 'Le sang te rend plus fort. Et un peu moins toi-même.' },
      { label: 'S\'y laver', ops: [{ op: 'pick', what: 'remove', n: 1 }], after: 'Ce qui te pesait s\'en va avec l\'eau rouge.' },
      leave(),
    ],
  },
  {
    id: 'a3_ombres', act: 3, title: 'Le marchand des ombres', art: { breed: 4 },
    text: 'Un marchand sans visage ouvre son manteau. Des reliques y pendent, et des objets que personne n\'a vendus depuis des siècles.',
    options: [
      { label: 'Acheter une relique', ops: [{ op: 'kamas', n: -180 }, { op: 'relic' }], after: '« Elle t\'a choisi. »' },
      { label: 'Acheter un objet', ops: [{ op: 'kamas', n: -110 }, { op: 'itemChoice', rarity: 'mythique' }], after: '« Bon usage. »' },
      leave('Il se fond dans l\'ombre.'),
    ],
  },
];

export const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
