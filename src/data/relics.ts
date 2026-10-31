// Reliques : trésors légendaires trouvés lors des événements. Elles ne prennent aucun emplacement d'équipement
// et durent toute la run. Plus fortes qu'un objet, elles ne s'obtiennent qu'en prenant un risque ou en payant.
import type { EffectPart, ItemEffect, RuleId } from '../core/effects.ts';
import { setRelicNamer, type Boon } from '../game/boons.ts';

const on = (trigger: string, reward: string, amount: number, o: Partial<EffectPart> = {}): ItemEffect =>
  ({ kind: 'roll', parts: [{ trigger, reward, amount, ...o }] });
const rule = (r: RuleId): ItemEffect => ({ kind: 'rule', rule: r });

/** iconId : icône d'objet Dofus (DofusDB) ; fallback : une icône d'effet locale. */
export interface RelicDef extends Boon { iconId?: number; fx: string }

export const RELICS: RelicDef[] = [
  { id: 'larme_ogrest', name: 'Larme d\'Ogrest', fx: 'soin', iconId: 24764, stats: { pv: 12 }, effects: [on('debut_tour', 'soin', 1)],
    lore: 'Une des larmes qui ont noyé le monde, figée en cristal.' },
  { id: 'marteau_moon', name: 'Marteau de Moon', fx: 'degats_zone', iconId: 7736, effects: [on('toutes_3_cartes', 'degats_zone', 6)],
    lore: 'L\'arme du maître de l\'île de Moon, plus lourde qu\'elle n\'en a l\'air.' },
  { id: 'bourse_kerubim', name: 'Bourse de Kerubim', fx: 'prospection', iconId: 24920, perks: { kamasMul: 0.5 },
    lore: 'Le vieil Écaflip la remplissait de kamas, et de souvenirs.' },
  { id: 'sablier_fele', name: 'Sablier miniature cassé', fx: 'pa', iconId: 15913, effects: [on('premier_tour', 'pa', 2)],
    lore: 'Il fuit, mais le premier grain vaut de l\'or.' },
  { id: 'dofus_cawotte', name: 'Dofus Cawotte', fx: 'soin', iconId: 23006, now: [{ op: 'maxHp', n: 10 }], effects: [on('victoire', 'soin', 4)],
    lore: 'Un œuf orange, croquant, et étonnamment nourrissant.' },
  { id: 'corne_minotoboule', name: 'Bracelet du Minotoboule', fx: 'puissance', iconId: 9247, effects: [on('chere', 'puissance', 1, { limit: 1 })],
    lore: 'Arraché à la bête du labyrinthe. Il vibre à chaque gros coup.' },
  { id: 'gelano', name: 'Gelano', fx: 'prospection', iconId: 9047, stats: { prospection: 60 },
    lore: 'L\'anneau gluant que tous les chercheurs de trésor envient.' },
  { id: 'plume_tofu', name: 'Plume de Tofu Royal', fx: 'esquive', iconId: 53413, effects: [on('debut_combat', 'esquive', 2)],
    lore: 'Légère comme un Tofu qui s\'enfuit.' },
  { id: 'griffe_kitsou', name: 'Amulette du Kitsou', fx: 'degats', iconId: 1091, effects: [on('attaque', 'degats', 2)],
    lore: 'Chaque coup laisse une seconde entaille.' },
  { id: 'ecaille_dragoeuf', name: 'Coquille de Dragoeuf', fx: 'armure', iconId: 111203, stats: { armure: 3 },
    lore: 'Plus dure que l\'acier, et bien plus légère.' },
  { id: 'anneau_rushu', name: 'Shushu de Rushu', fx: 'brulure', iconId: 18052, effects: [rule('braises')],
    lore: 'Le démon du feu y a laissé une étincelle qui ne s\'éteint pas.' },
  { id: 'tablette_allister', name: 'Document d\'Allister', fx: 'pioche', iconId: 24026, perks: { cardChoices: 1 },
    lore: 'Le vieux sage y notait tous les tours qu\'il connaissait.' },
  { id: 'parchemin_sagesse', name: 'Parchemin doré', fx: 'regle', iconId: 13025, now: [{ op: 'upgrade', n: 4 }],
    lore: 'Il suffit de le lire une fois pour ne jamais oublier.' },
  { id: 'fiole_resurrection', name: 'Potion de résurrection', fx: 'soin', iconId: 12768, perks: { revive: 1 },
    lore: 'Une seule gorgée, au bon moment.' },
  { id: 'masque_kralamoure', name: 'Kralamoure Unique', fx: 'armure', iconId: 41311, effects: [on('competence', 'armure', 3)],
    lore: 'Un mollusque si rare qu\'il pare les coups par réflexe.' },
  { id: 'cle_marchand', name: 'Clef de la Cour', fx: 'reduction', iconId: 84226, perks: { shopDiscount: 0.3 },
    lore: 'Elle ouvre l\'arrière-boutique de la Cour, là où les prix sont plus doux.' },
  { id: 'oeuf_dragodinde', name: 'Œuf de Dragoeuf', fx: 'soin', iconId: 105204, now: [{ op: 'healPct', pct: 0.5 }], perks: { zaapHeal: 0.2 },
    lore: 'Chaud, vivant, il réconforte ceux qui le portent.' },
  { id: 'sceau_ombre', name: 'Sceau des Zewouan', fx: 'pa', iconId: 9007, effects: [on('ennemi_meurt', 'pa', 1)],
    lore: 'Le sceau d\'une tribu oubliée. Chaque âme qui tombe le nourrit.' },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
setRelicNamer((id) => RELIC_BY_ID[id]?.name ?? id);
