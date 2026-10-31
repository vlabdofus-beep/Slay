import type { Bonus, CardDef, CardTarget, CardType, ClassId, CondId, Effect, Element, Rarity, ScaleId, StatusId } from '../core/types.ts';
import { paToCost, spell, spellElement, spellIcon } from './dofus.ts';

// Cartes reliées aux vrais sorts Dofus (src/data/dofus.json) : le NOM, l'ÉLÉMENT, le COÛT (via les PA)
// et l'ICÔNE viennent du sort. Les VALEURS sont les nôtres, calées sur les repères Spire Codex (docs/BALANCE.md) :
//   0 PA ≈ 3-4 dégâts, 1 ≈ 6-8, 2 ≈ 10-15, 3 ≈ 24 ; armure 1 PA ≈ 5 ; amélioration ≈ +33 %.
// Coût : 1-2 PA → 0, 3 PA → 1, 4-5 PA → 2, 6+ PA → 3. Seules les cartes de base peuvent y déroger.
// Règle : les cartes de base sont neutres (aucun deck de départ pénalisé), sauf la signature de la classe.

const dmg = (amount: number, element: Element, hits?: number, bonus?: Bonus): Effect => {
  const fx: Effect = { type: 'damage', amount, element };
  if (hits && hits > 1) fx.hits = hits;
  if (bonus) fx.bonus = bonus;
  return fx;
};
/** Dégâts qui grossissent : +n par attaque jouée ce tour, par point de puissance… */
const dmgPer = (amount: number, element: Element, per: ScaleId, n: number, hits?: number): Effect => dmg(amount, element, hits, { per, n });
const blockPer = (amount: number, per: ScaleId, n: number): Effect => ({ type: 'block', amount, bonus: { per, n } });
const loseHp = (amount: number): Effect => ({ type: 'loseHp', amount });
const heal = (amount: number): Effect => ({ type: 'heal', amount });
const energy = (amount: number): Effect => ({ type: 'energy', amount });
const charge = (amount: number): Effect => ({ type: 'charge', amount });
const multiply = (s: StatusId, factor: number): Effect => ({ type: 'multiply', status: s, factor });
/** Pouvoir : « déclencheur → récompense » (grammaire des objets), pour le reste du combat. */
const power = (trigger: string, ...rewards: [string, number][]): Effect =>
  ({ type: 'grant', fx: [{ kind: 'roll', parts: rewards.map(([reward, amount]) => ({ trigger, reward, amount })) }] });
const powerRule = (rule: string): Effect => ({ type: 'grant', fx: [{ kind: 'rule', rule }] });
const drain = (amount: number, element: Element): Effect => ({ type: 'drain', amount, element });
const block = (amount: number): Effect => ({ type: 'block', amount });
const draw = (amount: number): Effect => ({ type: 'draw', amount });
const status = (
  s: StatusId,
  amount: number,
  on: 'target' | 'self' | 'all_enemies',
): Effect => ({ type: 'status', status: s, amount, on });

interface SpellCardSpec {
  id: string;
  spell: number;
  type: CardType;
  target: CardTarget;
  rarity: Rarity;
  effects: Effect[];
  upgrade: Effect[];
  exhaust?: boolean;
  /** Dérogation au coût calculé depuis les PA (cartes de base uniquement). */
  cost?: number;
  /** Coût de la version améliorée, si l'amélioration le réduit. */
  upgradeCost?: number;
}

/** Carte construite depuis un sort Dofus : nom, élément, coût, classe et icône viennent du sort. */
function fromSpell(spec: SpellCardSpec): CardDef {
  const s = spell(spec.spell);
  return {
    id: spec.id,
    name: s.n,
    classe: s.b,
    cost: spec.cost ?? paToCost(s.pa),
    type: spec.type,
    element: spellElement(spec.spell),
    target: spec.target,
    rarity: spec.rarity,
    effects: spec.effects,
    upgrade: spec.upgradeCost !== undefined ? { effects: spec.upgrade, cost: spec.upgradeCost } : { effects: spec.upgrade },
    exhaust: spec.exhaust,
    spellId: spec.spell,
    icon: spellIcon(s.icon),
    lore: s.de,
  };
}

/** Carte sans sort Dofus (coup d'arme de base). */
function weapon(id: string, name: string, classe: ClassId, effects: Effect[], upgrade: Effect[]): CardDef {
  return { id, name, classe, cost: 1, type: 'attaque', element: 'neutre', target: 'enemy', rarity: 'base', effects, upgrade: { effects: upgrade } };
}

/** Carte d'arme neutre (toutes classes) : les armes de Dofus, sans sort. */
function arme(id: string, name: string, cost: number, target: CardTarget, rarity: Rarity, effects: Effect[], upgrade: Effect[], icon?: string): CardDef {
  return { id, name, classe: 'neutre', cost, type: 'attaque', element: 'neutre', target, rarity, effects, upgrade: { effects: upgrade }, icon };
}

const A = 'attaque' as const;
const C = 'competence' as const;
const P = 'pouvoir' as const;

export const IOP_CARDS: CardDef[] = [
  // Base : 5 Coup d'épée, 4 Vitalité, 1 Pression (signature Terre)
  weapon('iop_coup_epee', "Coup d'épée", 'iop', [dmg(6, 'neutre')], [dmg(9, 'neutre')]),
  fromSpell({ id: 'iop_vitalite', spell: 13120, type: C, target: 'self', rarity: 'base', effects: [block(5)], upgrade: [block(8)] }),
  fromSpell({ id: 'iop_pression', spell: 13106, type: A, target: 'enemy', rarity: 'base',
    effects: [dmg(6, 'terre'), status('vulnerabilite', 1, 'target')], upgrade: [dmg(8, 'terre'), status('vulnerabilite', 2, 'target')] }),
  // Terre : coups lourds
  fromSpell({ id: 'iop_concentration', spell: 13123, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(6, 'terre')], upgrade: [dmg(9, 'terre')] }),
  fromSpell({ id: 'iop_accumulation', spell: 13138, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(9, 'terre')], upgrade: [dmg(12, 'terre')] }),
  fromSpell({ id: 'iop_epee_de_iop', spell: 13125, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(14, 'terre')], upgrade: [dmg(20, 'terre')] }),
  fromSpell({ id: 'iop_colere', spell: 13124, type: A, target: 'enemy', rarity: 'rare', effects: [dmg(24, 'terre')], upgrade: [dmg(32, 'terre')] }),
  // Feu : brûlure et gros coups
  fromSpell({ id: 'iop_sentence', spell: 13147, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'feu'), status('brulure', 2, 'target')], upgrade: [dmg(7, 'feu'), status('brulure', 3, 'target')] }),
  fromSpell({ id: 'iop_tempete', spell: 13121, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(9, 'feu')], upgrade: [dmg(12, 'feu')] }),
  fromSpell({ id: 'iop_epee_destin', spell: 13111, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(14, 'feu')], upgrade: [dmg(18, 'feu')] }),
  fromSpell({ id: 'iop_epee_destructrice', spell: 13119, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(11, 'feu'), status('vulnerabilite', 1, 'all_enemies')], upgrade: [dmg(15, 'feu'), status('vulnerabilite', 2, 'all_enemies')] }),
  // Air : tempo, multi-coups
  fromSpell({ id: 'iop_souffle', spell: 13116, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(5, 'air')], upgrade: [dmg(8, 'air')] }),
  fromSpell({ id: 'iop_epee_divine', spell: 13110, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(7, 'air'), status('puissance', 1, 'self')], upgrade: [dmg(9, 'air'), status('puissance', 1, 'self')] }),
  fromSpell({ id: 'iop_zenith', spell: 13145, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(7, 'air', 2)], upgrade: [dmg(9, 'air', 2)] }),
  fromSpell({ id: 'iop_epee_celeste', spell: 13122, type: A, target: 'all_enemies', rarity: 'rare', effects: [dmg(14, 'air')], upgrade: [dmg(20, 'air')] }),
  // Eau : bouclier + dégâts
  fromSpell({ id: 'iop_ferveur', spell: 14676, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'eau'), block(3)], upgrade: [dmg(6, 'eau'), block(5)] }),
  fromSpell({ id: 'iop_endurance', spell: 13133, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(6, 'eau'), block(5)], upgrade: [dmg(8, 'eau'), block(7)] }),
  fromSpell({ id: 'iop_epee_jugement', spell: 13117, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(10, 'eau'), block(8)], upgrade: [dmg(13, 'eau'), block(10)] }),
  // Neutre
  fromSpell({ id: 'iop_determination', spell: 13132, type: C, target: 'self', rarity: 'commune', effects: [block(4)], upgrade: [block(7)] }),
  fromSpell({ id: 'iop_puissance', spell: 13118, type: C, target: 'self', rarity: 'rare', effects: [status('puissance', 3, 'self')], upgrade: [status('puissance', 4, 'self')] }),
  fromSpell({ id: 'iop_bond', spell: 13107, type: C, target: 'self', rarity: 'rare',
    effects: [status('vulnerabilite', 2, 'all_enemies'), draw(1)], upgrade: [status('vulnerabilite', 3, 'all_enemies'), draw(1)] }),
  // ───── Extension : Courroux (attaques en chaîne), sang, érosion, renvoi ─────
  fromSpell({ id: 'iop_intimidation', spell: 13108, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'neutre'), status('faiblesse', 1, 'target')], upgrade: [dmg(7, 'neutre'), status('faiblesse', 2, 'target')] }),
  fromSpell({ id: 'iop_massacre', spell: 13112, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmgPer(3, 'neutre', 'attaques', 4)], upgrade: [dmgPer(4, 'neutre', 'attaques', 5)] }),
  fromSpell({ id: 'iop_pugilat', spell: 13146, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmgPer(3, 'terre', 'attaques', 2)], upgrade: [dmgPer(4, 'terre', 'attaques', 3)] }),
  fromSpell({ id: 'iop_fureur', spell: 13156, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmgPer(8, 'terre', 'lancers', 5)], upgrade: [dmgPer(10, 'terre', 'lancers', 7)] }),
  fromSpell({ id: 'iop_couperet', spell: 13115, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(7, 'feu'), status('brulure', 3, 'target')], upgrade: [dmg(10, 'feu'), status('brulure', 4, 'target')] }),
  fromSpell({ id: 'iop_rassemblement', spell: 13136, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(7, 'feu'), status('brulure', 2, 'all_enemies')], upgrade: [dmg(10, 'feu'), status('brulure', 3, 'all_enemies')] }),
  fromSpell({ id: 'iop_tumulte', spell: 13144, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmgPer(9, 'feu', 'ennemis', 4), loseHp(3)], upgrade: [dmgPer(12, 'feu', 'ennemis', 5), loseHp(3)] }),
  fromSpell({ id: 'iop_tannee', spell: 13131, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(7, 'air'), status('faiblesse', 1, 'all_enemies')], upgrade: [dmg(10, 'air'), status('faiblesse', 1, 'all_enemies')] }),
  fromSpell({ id: 'iop_anneau', spell: 13135, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'air', 2)], upgrade: [dmg(5, 'air', 2)] }),
  fromSpell({ id: 'iop_fracture', spell: 13139, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(12, 'air'), status('erosion', 2, 'all_enemies')], upgrade: [dmg(16, 'air'), status('erosion', 3, 'all_enemies')] }),
  fromSpell({ id: 'iop_deferlement', spell: 13126, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmgPer(14, 'eau', 'puissance', 3)], upgrade: [dmgPer(18, 'eau', 'puissance', 4)] }),
  fromSpell({ id: 'iop_menace', spell: 13130, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(7, 'eau'), status('bouclier', 3, 'self')], upgrade: [dmg(10, 'eau'), status('bouclier', 4, 'self')] }),
  fromSpell({ id: 'iop_fendoir', spell: 13134, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(13, 'eau'), blockPer(2, 'ennemis', 3)], upgrade: [dmg(18, 'eau'), blockPer(3, 'ennemis', 4)] }),
  fromSpell({ id: 'iop_fustigation', spell: 14818, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(7, 'eau'), status('erosion', 2, 'all_enemies')], upgrade: [dmg(10, 'eau'), status('erosion', 3, 'all_enemies')] }),
  fromSpell({ id: 'iop_vindicte', spell: 14677, type: C, target: 'enemy', rarity: 'commune',
    effects: [status('erosion', 3, 'target'), status('vulnerabilite', 1, 'target')], upgrade: [status('erosion', 4, 'target'), status('vulnerabilite', 2, 'target')] }),
  fromSpell({ id: 'iop_friction', spell: 13113, type: C, target: 'enemy', rarity: 'commune',
    effects: [status('vulnerabilite', 1, 'target'), draw(1)], upgrade: [status('vulnerabilite', 2, 'target'), draw(1)] }),
  fromSpell({ id: 'iop_duel', spell: 13109, type: C, target: 'enemy', rarity: 'rare',
    effects: [status('vulnerabilite', 3, 'target'), status('faiblesse', 3, 'target')], upgrade: [status('vulnerabilite', 4, 'target'), status('faiblesse', 4, 'target')] }),
  fromSpell({ id: 'iop_emprise', spell: 13141, type: C, target: 'enemy', rarity: 'rare', exhaust: true,
    effects: [status('etourdi', 1, 'target')], upgrade: [status('etourdi', 1, 'target'), status('vulnerabilite', 2, 'target')] }),
  fromSpell({ id: 'iop_coup_pour_coup', spell: 13140, type: C, target: 'self', rarity: 'commune',
    effects: [status('renvoi', 3, 'self'), block(3)], upgrade: [status('renvoi', 4, 'self'), block(4)] }),
  fromSpell({ id: 'iop_precipitation', spell: 13114, type: C, target: 'self', rarity: 'rare', exhaust: true,
    effects: [energy(2), loseHp(3)], upgrade: [energy(2), draw(1), loseHp(3)] }),
  // Pouvoirs
  fromSpell({ id: 'iop_agitation', spell: 13143, type: P, target: 'self', rarity: 'commune',
    effects: [power('attaque', ['armure', 2])], upgrade: [power('attaque', ['armure', 3])] }),
  fromSpell({ id: 'iop_vertu', spell: 13142, type: P, target: 'self', rarity: 'commune',
    effects: [power('debut_tour', ['bouclier', 3])], upgrade: [power('debut_tour', ['bouclier', 4])] }),
  fromSpell({ id: 'iop_violence', spell: 13137, type: P, target: 'self', rarity: 'rare',
    effects: [power('pv_perdus', ['puissance', 1])], upgrade: [power('pv_perdus', ['puissance', 1]), power('premier_tour', ['puissance', 1])] }),
  fromSpell({ id: 'iop_conquete', spell: 13148, type: P, target: 'self', rarity: 'rare', upgradeCost: 0,
    effects: [powerRule('renvoi_moitie')], upgrade: [powerRule('renvoi_moitie')] }),
];

export const CRA_CARDS: CardDef[] = [
  // Base : 5 Coup d'arc, 4 Tir de Repli, 1 Flèche Glacée (signature Eau)
  weapon('cra_coup_arc', "Coup d'arc", 'cra', [dmg(6, 'neutre')], [dmg(9, 'neutre')]),
  fromSpell({ id: 'cra_tir_repli', spell: 32470, type: C, target: 'self', rarity: 'base', cost: 1, effects: [block(5)], upgrade: [block(8)] }),
  fromSpell({ id: 'cra_fleche_glacee', spell: 32435, type: A, target: 'enemy', rarity: 'base',
    effects: [dmg(6, 'eau'), status('faiblesse', 1, 'target')], upgrade: [dmg(8, 'eau'), status('faiblesse', 2, 'target')] }),
  // Air : tempo et zone
  fromSpell({ id: 'cra_fleche_cinglante', spell: 32427, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(6, 'air')], upgrade: [dmg(9, 'air')] }),
  fromSpell({ id: 'cra_fleche_recul', spell: 32426, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(9, 'air')], upgrade: [dmg(12, 'air')] }),
  fromSpell({ id: 'cra_pluie_fleches', spell: 32431, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(6, 'air')], upgrade: [dmg(9, 'air')] }),
  fromSpell({ id: 'cra_fleche_harcelante', spell: 32708, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(6, 'air'), status('brulure', 3, 'target')], upgrade: [dmg(8, 'air'), status('brulure', 4, 'target')] }),
  fromSpell({ id: 'cra_fleche_perforante', spell: 32429, type: A, target: 'enemy', rarity: 'rare', effects: [dmg(15, 'air')], upgrade: [dmg(20, 'air')] }),
  // Eau : drain et affaiblissement
  fromSpell({ id: 'cra_fleche_immobilisation', spell: 32436, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'eau'), status('faiblesse', 1, 'target')], upgrade: [dmg(7, 'eau'), status('faiblesse', 2, 'target')] }),
  fromSpell({ id: 'cra_oeil_de_taupe', spell: 32437, type: A, target: 'all_enemies', rarity: 'commune', effects: [drain(4, 'eau')], upgrade: [drain(8, 'eau')] }),
  fromSpell({ id: 'cra_fleche_redemption', spell: 32442, type: A, target: 'enemy', rarity: 'rare', effects: [drain(11, 'eau')], upgrade: [drain(15, 'eau')] }),
  // Feu : brûlure et zone
  fromSpell({ id: 'cra_fleche_detonante', spell: 32444, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'feu'), status('brulure', 2, 'target')], upgrade: [dmg(7, 'feu'), status('brulure', 3, 'target')] }),
  fromSpell({ id: 'cra_fleche_devorante', spell: 32446, type: A, target: 'enemy', rarity: 'commune', effects: [drain(7, 'feu')], upgrade: [drain(9, 'feu')] }),
  fromSpell({ id: 'cra_fleche_explosive', spell: 32445, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(12, 'feu')], upgrade: [dmg(18, 'feu')] }),
  fromSpell({ id: 'cra_fleche_tyrannique', spell: 32448, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(7, 'feu'), status('brulure', 6, 'target')], upgrade: [dmg(9, 'feu'), status('brulure', 8, 'target')] }),
  // Terre : coups lourds
  fromSpell({ id: 'cra_fleche_abolition', spell: 32453, type: A, target: 'enemy', rarity: 'commune', effects: [drain(5, 'terre')], upgrade: [drain(8, 'terre')] }),
  fromSpell({ id: 'cra_fleche_vagabonde', spell: 32455, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(9, 'terre')], upgrade: [dmg(12, 'terre')] }),
  fromSpell({ id: 'cra_fleche_punitive', spell: 32456, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(12, 'terre'), status('vulnerabilite', 1, 'target')], upgrade: [dmg(16, 'terre'), status('vulnerabilite', 2, 'target')] }),
  fromSpell({ id: 'cra_carreaux_destructeurs', spell: 32459, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(10, 'terre'), status('faiblesse', 1, 'all_enemies')], upgrade: [dmg(14, 'terre'), status('faiblesse', 2, 'all_enemies')] }),
  // Neutre
  fromSpell({ id: 'cra_tir_percant', spell: 32471, type: C, target: 'enemy', rarity: 'commune',
    effects: [status('vulnerabilite', 2, 'target')], upgrade: [status('vulnerabilite', 3, 'target')] }),
  fromSpell({ id: 'cra_sentinelle', spell: 32475, type: C, target: 'self', rarity: 'commune', exhaust: true, effects: [draw(2)], upgrade: [draw(3)] }),
  fromSpell({ id: 'cra_tirs_puissants', spell: 32466, type: C, target: 'self', rarity: 'rare', effects: [status('puissance', 2, 'self')], upgrade: [status('puissance', 3, 'self')] }),
  // ───── Extension : Visée (tirs préparés), poison, esquive, précision ─────
  fromSpell({ id: 'cra_fleche_evasive', spell: 32531, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'eau'), charge(1)], upgrade: [dmg(8, 'eau'), charge(1)] }),
  fromSpell({ id: 'cra_fleche_boomerang', spell: 32432, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(4, 'air', 2)], upgrade: [dmg(5, 'air', 2)] }),
  fromSpell({ id: 'cra_fleche_dispersion', spell: 32428, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(5, 'air'), charge(1)], upgrade: [dmg(8, 'air'), charge(1)] }),
  fromSpell({ id: 'cra_fleche_persecutrice', spell: 32433, type: A, target: 'enemy', rarity: 'rare',
    effects: [drain(8, 'air'), status('poison', 6, 'target')], upgrade: [drain(11, 'air'), status('poison', 8, 'target')] }),
  fromSpell({ id: 'cra_fleche_expiation', spell: 32438, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(13, 'eau'), status('erosion', 2, 'target')], upgrade: [dmg(17, 'eau'), status('erosion', 3, 'target')] }),
  fromSpell({ id: 'cra_fleche_ralentissante', spell: 32439, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(8, 'eau'), status('poison', 2, 'all_enemies')], upgrade: [dmg(12, 'eau'), status('poison', 3, 'all_enemies')] }),
  fromSpell({ id: 'cra_fleche_paralysante', spell: 32441, type: A, target: 'enemy', rarity: 'rare', exhaust: true,
    effects: [dmg(10, 'eau'), status('etourdi', 1, 'target')], upgrade: [dmg(15, 'eau'), status('etourdi', 1, 'target')] }),
  fromSpell({ id: 'cra_fleche_barrage', spell: 32443, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'feu'), block(3)], upgrade: [dmg(6, 'feu'), block(4)] }),
  fromSpell({ id: 'cra_fleche_eclatante', spell: 32449, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'feu'), status('brulure', 2, 'all_enemies')], upgrade: [dmg(6, 'feu'), status('brulure', 3, 'all_enemies')] }),
  fromSpell({ id: 'cra_fleche_fulminante', spell: 32450, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(10, 'feu'), status('brulure', 3, 'all_enemies')], upgrade: [dmg(13, 'feu'), status('brulure', 4, 'all_enemies')] }),
  fromSpell({ id: 'cra_oeil_pour_oeil', spell: 32454, type: A, target: 'enemy', rarity: 'commune',
    effects: [drain(6, 'terre'), status('renvoi', 2, 'self')], upgrade: [drain(8, 'terre'), status('renvoi', 3, 'self')] }),
  fromSpell({ id: 'cra_fleche_massacrante', spell: 32457, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmgPer(7, 'terre', 'ennemis', 4)], upgrade: [dmgPer(10, 'terre', 'ennemis', 5)] }),
  fromSpell({ id: 'cra_fleche_assaillante', spell: 32458, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmgPer(8, 'terre', 'statuts', 4)], upgrade: [dmgPer(10, 'terre', 'statuts', 5)] }),
  fromSpell({ id: 'cra_fleche_jugement', spell: 32460, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmgPer(10, 'terre', 'main', 3)], upgrade: [dmgPer(13, 'terre', 'main', 4)] }),
  fromSpell({ id: 'cra_vendetta', spell: 32473, type: C, target: 'enemy', rarity: 'rare', exhaust: true,
    effects: [multiply('poison', 2)], upgrade: [multiply('poison', 3)] }),
  fromSpell({ id: 'cra_pas_chasse', spell: 32464, type: C, target: 'self', rarity: 'commune', exhaust: true,
    effects: [status('esquive', 1, 'self')], upgrade: [status('esquive', 1, 'self'), draw(1)] }),
  fromSpell({ id: 'cra_balise_tactique', spell: 32467, type: C, target: 'self', rarity: 'commune',
    effects: [charge(2), draw(1)], upgrade: [charge(2), draw(2)] }),
  fromSpell({ id: 'cra_balise_survie', spell: 32474, type: C, target: 'self', rarity: 'commune',
    effects: [status('bouclier', 4, 'self')], upgrade: [status('bouclier', 6, 'self')] }),
  fromSpell({ id: 'cra_fleches_amoureuses', spell: 32618, type: C, target: 'self', rarity: 'rare', exhaust: true,
    effects: [heal(5)], upgrade: [heal(8)] }),
  // Pouvoirs
  fromSpell({ id: 'cra_tirs_eloignes', spell: 32465, type: P, target: 'self', rarity: 'commune',
    effects: [power('debut_tour', ['visee', 1])], upgrade: [power('debut_tour', ['visee', 1], ['armure', 3])] }),
  fromSpell({ id: 'cra_acuite_absolue', spell: 32469, type: P, target: 'self', rarity: 'rare',
    effects: [power('cible_vulnerable', ['pioche', 1])], upgrade: [power('cible_vulnerable', ['pioche', 1]), power('debut_combat', ['vulnerabilite', 2])] }),
  fromSpell({ id: 'cra_represailles', spell: 32472, type: P, target: 'self', rarity: 'rare',
    effects: [power('pv_perdus', ['poison', 3])], upgrade: [power('pv_perdus', ['poison', 4])] }),
  fromSpell({ id: 'cra_fleches_enflammees', spell: 32447, type: P, target: 'self', rarity: 'rare', upgradeCost: 1,
    effects: [powerRule('brule_empoisonne')], upgrade: [powerRule('brule_empoisonne')] }),
];

/** Armes : cartes neutres, proposées à toutes les classes. */
export const NEUTRAL_CARDS: CardDef[] = [
  arme('arme_dague', 'Coup de dague', 0, 'enemy', 'commune', [dmg(3, 'neutre', 2)], [dmg(4, 'neutre', 2)]),
  arme('arme_baton', 'Coup de bâton', 1, 'enemy', 'commune', [dmg(7, 'neutre'), block(4)], [dmg(10, 'neutre'), block(6)]),
  arme('arme_pelle', 'Coup de pelle', 1, 'enemy', 'commune', [dmg(8, 'neutre'), draw(1)], [dmg(11, 'neutre'), draw(1)]),
  arme('arme_marteau', 'Coup de marteau', 2, 'all_enemies', 'rare', [dmg(14, 'neutre')], [dmg(19, 'neutre')]),
  arme('arme_hache', 'Coup de hache', 2, 'enemy', 'rare',
    [dmg(14, 'neutre'), status('vulnerabilite', 1, 'target')], [dmg(18, 'neutre'), status('vulnerabilite', 2, 'target')]),
];


// ───────────── Sorts inventés (31/10/2026) ─────────────
// Pas de sort Dofus derrière : nom, coût et élément sont les nôtres. L'icône vient d'un sort d'une autre
// classe dont l'image colle à l'idée. Ils portent les mécaniques que les vrais sorts ne couvraient pas :
// conditions (« si la cible meurt… »), enchaînements, sorts conservés ou innés, écho, consommation de la
// puissance ou de la Visée, propagation et détonation du poison, cartes créées en combat.

interface InventedSpec {
  id: string; name: string; classe: ClassId; cost: number; type: CardType; element: Element; target: CardTarget;
  rarity: Rarity; icon: number; effects: Effect[]; upgrade: Effect[]; upgradeCost?: number;
  exhaust?: boolean; retain?: boolean; innate?: boolean; token?: boolean; lore?: string;
}
function invented(s: InventedSpec): CardDef {
  const d: CardDef = {
    id: s.id, name: s.name, classe: s.classe, cost: s.cost, type: s.type, element: s.element, target: s.target, rarity: s.rarity,
    effects: s.effects, upgrade: s.upgradeCost !== undefined ? { effects: s.upgrade, cost: s.upgradeCost } : { effects: s.upgrade },
    icon: spellIcon(s.icon),
  };
  if (s.exhaust) d.exhaust = true;
  if (s.retain) d.retain = true;
  if (s.innate) d.innate = true;
  if (s.token) d.token = true;
  if (s.lore) d.lore = s.lore;
  return d;
}
const when = (cond: CondId, ...then: Effect[]): Effect => ({ type: 'if', cond, then });
const pierce = (amount: number, element: Element): Effect => ({ type: 'damage', amount, element, pierce: true });
const spend = (what: 'puissance' | 'visee'): Effect => ({ type: 'spend', what });
const echo = (count = 1): Effect => ({ type: 'echo', count });
const discount = (amount: number): Effect => ({ type: 'discount', amount });
const spread = (s: StatusId): Effect => ({ type: 'spread', status: s });
const detonate = (s: StatusId): Effect => ({ type: 'detonate', status: s });
const create = (card: string, count: number): Effect => ({ type: 'addCard', card, count, pile: 'hand' });

// ───────────── Xélor (proposition validée le 31/10/2026, docs/CLASSE_XELOR.md) ─────────────
// Téléfrag : certains sorts posent une marque, l'attaque suivante la consomme (passif : pioche).
// Ralenti (retrait de PA) : la prochaine action du monstre fait moins de dégâts au total.
// Échéance : des dégâts Feu qui tombent à la fin du prochain tour du monstre.
const tf = (on: 'target' | 'all_enemies' = 'target'): Effect => status('telefrag', 1, on);
const slow = (n: number, on: 'target' | 'all_enemies' = 'target'): Effect => status('ralenti', n, on);
const due = (n: number): Effect => status('echeance', n, 'target');
const siT = (...then: Effect[]): Effect => ({ type: 'if', cond: 'cible_telefrag', then });
const siRalenti = (...then: Effect[]): Effect => ({ type: 'if', cond: 'cible_ralentie', then });
/** Pouvoir qui ne se déclenche qu'une fois par tour. */
const powerOnce = (trigger: string, reward: string, amount: number): Effect =>
  ({ type: 'grant', fx: [{ kind: 'roll', parts: [{ trigger, reward, amount, limit: 1 }] }] });

export const XELOR_CARDS: CardDef[] = [
  // Base : 5 Coup de baguette, 4 Conservation, 1 Frappe de Xélor (signature Terre : pose le Téléfrag)
  weapon('xelor_coup_baguette', 'Coup de baguette', 'xelor', [dmg(6, 'neutre')], [dmg(9, 'neutre')]),
  fromSpell({ id: 'xelor_conservation', spell: 13291, type: C, target: 'self', rarity: 'base', effects: [block(3)], upgrade: [block(5)] }),
  fromSpell({ id: 'xelor_frappe', spell: 13252, type: A, target: 'enemy', rarity: 'base',
    effects: [dmg(6, 'terre'), tf()], upgrade: [dmg(8, 'terre'), tf()] }),
  // Eau : ralentir, voler la vie
  fromSpell({ id: 'xelor_ralentissement', spell: 13242, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(4, 'eau'), slow(3)], upgrade: [dmg(6, 'eau'), slow(4)] }),
  fromSpell({ id: 'xelor_gelure', spell: 13245, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(4, 'eau'), tf()], upgrade: [dmg(6, 'eau'), tf()] }),
  fromSpell({ id: 'xelor_compte_goutte', spell: 13259, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(7, 'eau'), block(4), tf()], upgrade: [dmg(10, 'eau'), block(5), tf()] }),
  fromSpell({ id: 'xelor_petrification', spell: 13290, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(11, 'eau'), slow(4), siT(discount(1))], upgrade: [dmg(15, 'eau'), slow(5), siT(discount(1))] }),
  fromSpell({ id: 'xelor_permutation', spell: 13285, type: A, target: 'enemy', rarity: 'rare', effects: [drain(11, 'eau'), tf()], upgrade: [drain(15, 'eau'), tf()] }),
  fromSpell({ id: 'xelor_flou_temporel', spell: 13246, type: C, target: 'all_enemies', rarity: 'commune',
    effects: [slow(3, 'all_enemies')], upgrade: [slow(4, 'all_enemies')] }),
  // Feu : échéances et zones
  fromSpell({ id: 'xelor_sablier', spell: 13261, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'feu'), due(5)], upgrade: [dmg(4, 'feu'), due(7)] }),
  fromSpell({ id: 'xelor_refraction', spell: 13286, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(4, 'feu'), siT(spread('telefrag'))], upgrade: [dmg(6, 'feu'), siT(spread('telefrag'))] }),
  fromSpell({ id: 'xelor_perturbation', spell: 13288, type: A, target: 'enemy', rarity: 'commune', effects: [drain(6, 'feu'), tf()], upgrade: [drain(9, 'feu'), tf()] }),
  fromSpell({ id: 'xelor_sables', spell: 13292, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(6, 'feu', 2), tf()], upgrade: [dmg(8, 'feu', 2), tf()] }),
  fromSpell({ id: 'xelor_poussiere', spell: 13257, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(10, 'feu')], upgrade: [dmg(14, 'feu')] }),
  fromSpell({ id: 'xelor_rayon_obscur', spell: 13253, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmgPer(8, 'feu', 'telefrag', 5)], upgrade: [dmgPer(11, 'feu', 'telefrag', 7)] }),
  // Terre : coups lourds et aiguilles
  fromSpell({ id: 'xelor_aiguille', spell: 13244, type: A, target: 'enemy', rarity: 'commune',
    effects: [status('poison', 3, 'target'), siT(dmg(5, 'terre'))], upgrade: [status('poison', 4, 'target'), siT(dmg(7, 'terre'))] }),
  fromSpell({ id: 'xelor_engrenage', spell: 13299, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(5, 'terre'), tf('all_enemies')], upgrade: [dmg(7, 'terre'), tf('all_enemies')] }),
  fromSpell({ id: 'xelor_horloge', spell: 13256, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(10, 'terre'), slow(3), siT(dmg(6, 'terre'))], upgrade: [dmg(13, 'terre'), slow(4), siT(dmg(8, 'terre'))] }),
  fromSpell({ id: 'xelor_rouage', spell: 13283, type: A, target: 'all_enemies', rarity: 'rare', effects: [drain(8, 'terre')], upgrade: [drain(11, 'terre')] }),
  fromSpell({ id: 'xelor_glas', spell: 13300, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmgPer(4, 'terre', 'telefrag_tour', 4)], upgrade: [dmgPer(5, 'terre', 'telefrag_tour', 5)] }),
  // Air : le Téléfrag qui paie
  fromSpell({ id: 'xelor_souvenir', spell: 13281, type: A, target: 'enemy', rarity: 'commune', effects: [drain(3, 'air'), tf()], upgrade: [drain(5, 'air'), tf()] }),
  fromSpell({ id: 'xelor_gousset', spell: 14651, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'air'), slow(2), siT(due(6))], upgrade: [dmg(4, 'air'), slow(2), siT(due(8))] }),
  fromSpell({ id: 'xelor_fletrissement', spell: 13254, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(6, 'air'), siT(dmg(6, 'air'))], upgrade: [dmg(8, 'air'), siT(dmg(8, 'air'))] }),
  fromSpell({ id: 'xelor_dessechement', spell: 13284, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(9, 'air'), siT(energy(1))], upgrade: [dmg(12, 'air'), siT(energy(1))] }),
  fromSpell({ id: 'xelor_distorsion', spell: 13289, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(11, 'air'), tf('all_enemies')], upgrade: [dmg(15, 'air'), tf('all_enemies')] }),
  fromSpell({ id: 'xelor_pendule', spell: 13294, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(12, 'air'), block(4), tf()], upgrade: [dmg(16, 'air'), block(6), tf()] }),
  // Le temps (neutre)
  fromSpell({ id: 'xelor_teleportation', spell: 13249, type: C, target: 'enemy', rarity: 'commune', effects: [block(3), tf()], upgrade: [block(5), tf()] }),
  fromSpell({ id: 'xelor_astrolabe', spell: 13282, type: C, target: 'enemy', rarity: 'commune', effects: [tf(), draw(1)], upgrade: [tf(), draw(1), block(3)] }),
  fromSpell({ id: 'xelor_espace_temps', spell: 13297, type: C, target: 'enemy', rarity: 'commune',
    effects: [tf(), status('renvoi', 3, 'self')], upgrade: [tf(), status('renvoi', 5, 'self')] }),
  fromSpell({ id: 'xelor_paradoxe', spell: 13250, type: C, target: 'enemy', rarity: 'commune', effects: [spread('ralenti')], upgrade: [slow(2), spread('ralenti')] }),
  fromSpell({ id: 'xelor_desynchronisation', spell: 13296, type: C, target: 'all_enemies', rarity: 'commune', exhaust: true,
    effects: [tf('all_enemies')], upgrade: [tf('all_enemies'), draw(1)] }),
  fromSpell({ id: 'xelor_remanence', spell: 13255, type: C, target: 'enemy', rarity: 'commune',
    effects: [tf(), status('vulnerabilite', 1, 'target')], upgrade: [tf(), status('vulnerabilite', 2, 'target')] }),
  fromSpell({ id: 'xelor_vingt_cinquieme_heure', spell: 14650, type: C, target: 'all_enemies', rarity: 'rare', exhaust: true, upgradeCost: 0,
    effects: [{ type: 'consume', then: [status('etourdi', 1, 'target')] }], upgrade: [{ type: 'consume', then: [status('etourdi', 1, 'target')] }] }),
  fromSpell({ id: 'xelor_momification', spell: 13260, type: C, target: 'self', rarity: 'rare', exhaust: true,
    effects: [status('esquive', 1, 'self')], upgrade: [status('esquive', 1, 'self'), draw(1)] }),
  // Pouvoirs
  fromSpell({ id: 'xelor_complice', spell: 13287, type: P, target: 'self', rarity: 'commune',
    effects: [power('debut_tour', ['renvoi', 2])], upgrade: [power('debut_tour', ['renvoi', 3])] }),
  fromSpell({ id: 'xelor_cadran', spell: 13258, type: P, target: 'self', rarity: 'rare',
    effects: [power('debut_tour', ['telefrag', 1])], upgrade: [power('debut_tour', ['telefrag', 1], ['armure', 3])] }),
  fromSpell({ id: 'xelor_synchro', spell: 13247, type: P, target: 'self', rarity: 'rare',
    effects: [powerOnce('telefrag_consomme', 'degats_zone', 4)], upgrade: [powerOnce('telefrag_consomme', 'degats_zone', 6)] }),
  fromSpell({ id: 'xelor_instabilite', spell: 13301, type: P, target: 'self', rarity: 'rare',
    effects: [powerOnce('telefrag_consomme', 'ralenti_zone', 2)], upgrade: [powerOnce('telefrag_consomme', 'ralenti_zone', 3)] }),
];


export const IOP_INVENTED: CardDef[] = [
  invented({ id: 'iop_enchainement', name: 'Enchaînement', classe: 'iop', cost: 1, type: A, element: 'terre', target: 'enemy', rarity: 'commune', icon: 11939,
    effects: [dmg(8, 'terre'), when('apres_attaque', dmg(7, 'terre'))], upgrade: [dmg(11, 'terre'), when('apres_attaque', dmg(9, 'terre'))],
    lore: 'Le premier coup ouvre la garde, le second la traverse.' }),
  invented({ id: 'iop_coup_de_grace', name: 'Coup de Grâce', classe: 'iop', cost: 1, type: A, element: 'feu', target: 'enemy', rarity: 'commune', icon: 12007,
    effects: [dmg(7, 'feu'), when('cible_morte', energy(1), draw(1))], upgrade: [dmg(10, 'feu'), when('cible_morte', energy(1), draw(1))] }),
  invented({ id: 'iop_tourbillon', name: 'Tourbillon de Lames', classe: 'iop', cost: 2, type: A, element: 'air', target: 'all_enemies', rarity: 'rare', icon: 11963, retain: true,
    effects: [dmg(7, 'air', 2)], upgrade: [dmg(9, 'air', 2)] }),
  invented({ id: 'iop_explosion_rage', name: 'Explosion de Rage', classe: 'iop', cost: 2, type: A, element: 'feu', target: 'enemy', rarity: 'rare', icon: 11955,
    effects: [dmgPer(10, 'feu', 'puissance', 8), spend('puissance')], upgrade: [dmgPer(13, 'feu', 'puissance', 10), spend('puissance')] }),
  invented({ id: 'iop_frappe_ecrasante', name: 'Frappe Écrasante', classe: 'iop', cost: 2, type: A, element: 'terre', target: 'enemy', rarity: 'commune', icon: 12775,
    effects: [pierce(14, 'terre')], upgrade: [pierce(19, 'terre')] }),
  invented({ id: 'iop_charge_blindee', name: 'Charge Blindée', classe: 'iop', cost: 1, type: A, element: 'eau', target: 'enemy', rarity: 'commune', icon: 12583,
    effects: [dmgPer(0, 'eau', 'armure', 1)], upgrade: [dmgPer(0, 'eau', 'armure', 1)], upgradeCost: 0 }),
  invented({ id: 'iop_tempete_coups', name: 'Tempête de Coups', classe: 'iop', cost: 1, type: A, element: 'air', target: 'enemy', rarity: 'commune', icon: 11975,
    effects: [dmg(3, 'air', 3), when('cible_vulnerable', dmg(3, 'air', 2))], upgrade: [dmg(4, 'air', 3), when('cible_vulnerable', dmg(4, 'air', 2))] }),
  invented({ id: 'iop_rage_aveugle', name: 'Rage Aveugle', classe: 'iop', cost: 1, type: A, element: 'terre', target: 'enemy', rarity: 'rare', icon: 11947,
    effects: [{ type: 'exhaustHand' }, dmgPer(6, 'terre', 'epuisees', 4)], upgrade: [{ type: 'exhaustHand' }, dmgPer(8, 'terre', 'epuisees', 5)] }),
  invented({ id: 'iop_vitalite_insolente', name: 'Vitalité Insolente', classe: 'iop', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: 12156,
    effects: [block(6), when('pv_bas', block(6))], upgrade: [block(8), when('pv_bas', block(8))] }),
  invented({ id: 'iop_cri_de_guerre', name: 'Cri de Guerre', classe: 'iop', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: 12874, innate: true, exhaust: true,
    effects: [status('faiblesse', 2, 'all_enemies'), status('vulnerabilite', 1, 'all_enemies')], upgrade: [status('faiblesse', 3, 'all_enemies'), status('vulnerabilite', 2, 'all_enemies')] }),
  invented({ id: 'iop_pacte_sang', name: 'Pacte de Sang', classe: 'iop', cost: 0, type: C, element: 'neutre', target: 'self', rarity: 'rare', icon: 11977, exhaust: true,
    effects: [loseHp(6), energy(2), draw(2)], upgrade: [loseHp(4), energy(2), draw(2)] }),
  invented({ id: 'iop_dedoublement', name: 'Dédoublement', classe: 'iop', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'rare', icon: 11964, exhaust: true,
    effects: [echo()], upgrade: [echo()], upgradeCost: 0 }),
  invented({ id: 'iop_fievre_combat', name: 'Fièvre du Combat', classe: 'iop', cost: 1, type: P, element: 'neutre', target: 'self', rarity: 'rare', icon: 11949,
    effects: [power('attaque', ['degats', 2])], upgrade: [power('attaque', ['degats', 3])] }),
  invented({ id: 'iop_furie_ecarlate', name: 'Furie Écarlate', classe: 'iop', cost: 2, type: P, element: 'neutre', target: 'self', rarity: 'rare', icon: 12484,
    effects: [power('debut_tour', ['puissance', 2], ['perte_pv', 2])], upgrade: [power('debut_tour', ['puissance', 2], ['perte_pv', 2])], upgradeCost: 1 }),
];

export const CRA_INVENTED: CardDef[] = [
  invented({ id: 'cra_fleche_improvisee', name: 'Flèche Improvisée', classe: 'cra', cost: 0, type: A, element: 'air', target: 'enemy', rarity: 'base', icon: 13826, token: true, exhaust: true,
    effects: [dmg(4, 'air')], upgrade: [dmg(6, 'air')] }),
  invented({ id: 'cra_carquois', name: 'Carquois Garni', classe: 'cra', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: 12588,
    effects: [create('cra_fleche_improvisee', 2)], upgrade: [create('cra_fleche_improvisee', 3)],
    lore: 'Des flèches taillées à la hâte : elles ne servent qu\'une fois, mais chacune compte pour la Visée.' }),
  invented({ id: 'cra_tir_charge', name: 'Tir Chargé', classe: 'cra', cost: 1, type: A, element: 'air', target: 'enemy', rarity: 'rare', icon: 12527,
    effects: [dmgPer(6, 'air', 'visee', 8), spend('visee')], upgrade: [dmgPer(8, 'air', 'visee', 10), spend('visee')] }),
  invented({ id: 'cra_fleche_venimeuse', name: 'Flèche Venimeuse', classe: 'cra', cost: 0, type: A, element: 'air', target: 'enemy', rarity: 'commune', icon: 12020,
    effects: [dmg(4, 'air'), status('poison', 3, 'target')], upgrade: [dmg(6, 'air'), status('poison', 4, 'target')] }),
  invented({ id: 'cra_fleche_contagieuse', name: 'Flèche Contagieuse', classe: 'cra', cost: 1, type: A, element: 'eau', target: 'enemy', rarity: 'commune', icon: 12738,
    effects: [dmg(7, 'eau'), spread('poison')], upgrade: [dmg(10, 'eau'), status('poison', 2, 'target'), spread('poison')] }),
  invented({ id: 'cra_fleche_necrotique', name: 'Flèche Nécrotique', classe: 'cra', cost: 1, type: C, element: 'neutre', target: 'enemy', rarity: 'rare', icon: 12010, exhaust: true,
    effects: [detonate('poison')], upgrade: [detonate('poison')], upgradeCost: 0 }),
  invented({ id: 'cra_pluie_empoisonnee', name: 'Pluie Empoisonnée', classe: 'cra', cost: 2, type: A, element: 'air', target: 'all_enemies', rarity: 'rare', icon: 13387,
    effects: [dmg(6, 'air'), status('poison', 3, 'all_enemies')], upgrade: [dmg(8, 'air'), status('poison', 4, 'all_enemies')] }),
  invented({ id: 'cra_tir_execution', name: "Tir d'Exécution", classe: 'cra', cost: 1, type: A, element: 'terre', target: 'enemy', rarity: 'commune', icon: 12002,
    effects: [dmg(8, 'terre'), when('cible_blessee', dmg(8, 'terre'))], upgrade: [dmg(10, 'terre'), when('cible_blessee', dmg(10, 'terre'))] }),
  invented({ id: 'cra_volee', name: 'Volée de Flèches', classe: 'cra', cost: 2, type: A, element: 'air', target: 'enemy', rarity: 'commune', icon: 12538,
    effects: [dmg(4, 'air', 4)], upgrade: [dmg(5, 'air', 4)] }),
  invented({ id: 'cra_repli_strategique', name: 'Repli Stratégique', classe: 'cra', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: 12207, retain: true,
    effects: [block(7), charge(1)], upgrade: [block(10), charge(1)] }),
  invented({ id: 'cra_oeil_lynx', name: 'Œil de Lynx', classe: 'cra', cost: 0, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: 12301, innate: true,
    effects: [draw(1), charge(1)], upgrade: [draw(2), charge(1)] }),
  invented({ id: 'cra_marque_chasseur', name: 'Marque du Chasseur', classe: 'cra', cost: 1, type: C, element: 'neutre', target: 'enemy', rarity: 'rare', icon: 12034, exhaust: true,
    effects: [status('vulnerabilite', 2, 'target'), charge(4)], upgrade: [status('vulnerabilite', 3, 'target'), charge(4)] }),
  invented({ id: 'cra_esprit_faucon', name: 'Esprit du Faucon', classe: 'cra', cost: 1, type: P, element: 'neutre', target: 'self', rarity: 'rare', icon: 12834,
    effects: [power('competence', ['visee', 1])], upgrade: [power('competence', ['visee', 1])], upgradeCost: 0 }),
];

/** Icône d'un sort du Xélor (sorts inventés). */
const xIcon = (id: number) => spell(id).icon;
export const XELOR_INVENTED: CardDef[] = [
  invented({ id: 'xelor_seconde', name: 'Seconde', classe: 'xelor', cost: 0, type: A, element: 'neutre', target: 'enemy', rarity: 'base', icon: xIcon(13251), token: true, exhaust: true,
    effects: [dmg(3, 'neutre'), tf()], upgrade: [dmg(5, 'neutre'), tf()] }),
  invented({ id: 'xelor_tic_tac', name: 'Tic-Tac', classe: 'xelor', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: xIcon(13293),
    effects: [create('xelor_seconde', 2)], upgrade: [create('xelor_seconde', 3)],
    lore: 'Chaque tic pose une marque, chaque tac la fait payer.' }),
  invented({ id: 'xelor_aiguille_heures', name: 'Aiguille des Heures', classe: 'xelor', cost: 1, type: A, element: 'terre', target: 'enemy', rarity: 'commune', icon: xIcon(13244),
    effects: [dmg(8, 'terre'), siT(dmg(8, 'terre'))], upgrade: [dmg(10, 'terre'), siT(dmg(10, 'terre'))] }),
  invented({ id: 'xelor_aiguille_minutes', name: 'Aiguille des Minutes', classe: 'xelor', cost: 0, type: A, element: 'air', target: 'enemy', rarity: 'commune', icon: xIcon(13254),
    effects: [dmg(3, 'air', 2), tf()], upgrade: [dmg(4, 'air', 2), tf()] }),
  invented({ id: 'xelor_contretemps', name: 'Contretemps', classe: 'xelor', cost: 1, type: A, element: 'eau', target: 'enemy', rarity: 'commune', icon: xIcon(13242),
    effects: [dmg(7, 'eau'), siRalenti(draw(1))], upgrade: [dmg(10, 'eau'), siRalenti(draw(1))] }),
  invented({ id: 'xelor_rouille', name: 'Rouille', classe: 'xelor', cost: 1, type: C, element: 'neutre', target: 'enemy', rarity: 'commune', icon: xIcon(13283),
    effects: [status('erosion', 2, 'target'), slow(3)], upgrade: [status('erosion', 3, 'target'), slow(4)],
    lore: 'Les rouages grincent, l\'armure s\'effrite.' }),
  invented({ id: 'xelor_instant_suspendu', name: 'Instant Suspendu', classe: 'xelor', cost: 1, type: C, element: 'neutre', target: 'self', rarity: 'commune', icon: xIcon(13291), retain: true,
    effects: [block(8)], upgrade: [block(11)] }),
  invented({ id: 'xelor_sablier_brise', name: 'Sablier Brisé', classe: 'xelor', cost: 1, type: A, element: 'feu', target: 'enemy', rarity: 'rare', icon: xIcon(13261),
    effects: [dmg(5, 'feu'), detonate('echeance')], upgrade: [dmg(8, 'feu'), detonate('echeance')],
    lore: 'Le sable tombe d\'un coup, et l\'échéance reste due.' }),
  invented({ id: 'xelor_arret_temps', name: 'Arrêt du Temps', classe: 'xelor', cost: 2, type: C, element: 'neutre', target: 'all_enemies', rarity: 'rare', icon: xIcon(13246), exhaust: true,
    effects: [slow(10, 'all_enemies')], upgrade: [slow(14, 'all_enemies')] }),
  invented({ id: 'xelor_derniere_seconde', name: 'Dernière Seconde', classe: 'xelor', cost: 0, type: C, element: 'neutre', target: 'self', rarity: 'rare', icon: xIcon(13262), exhaust: true,
    effects: [draw(1), when('pv_bas', energy(2))], upgrade: [draw(2), when('pv_bas', energy(2))] }),
  invented({ id: 'xelor_horloge_interne', name: 'Horloge Interne', classe: 'xelor', cost: 1, type: P, element: 'neutre', target: 'self', rarity: 'commune', icon: xIcon(13258),
    effects: [power('telefrag_consomme', ['armure', 3])], upgrade: [power('telefrag_consomme', ['armure', 4])] }),
  invented({ id: 'xelor_boucle_temporelle', name: 'Boucle Temporelle', classe: 'xelor', cost: 1, type: P, element: 'neutre', target: 'self', rarity: 'rare', icon: xIcon(13243),
    effects: [power('toutes_3_cartes', ['pioche', 1])], upgrade: [power('toutes_3_cartes', ['pioche', 1])], upgradeCost: 0,
    lore: 'Tic, tac, pioche. Tic, tac, pioche.' }),
];

export const ALL_CARDS: CardDef[] = [...IOP_CARDS, ...CRA_CARDS, ...XELOR_CARDS, ...NEUTRAL_CARDS, ...IOP_INVENTED, ...CRA_INVENTED, ...XELOR_INVENTED];
