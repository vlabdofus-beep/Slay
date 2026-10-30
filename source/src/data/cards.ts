import type { Bonus, CardDef, CardTarget, CardType, ClassId, Effect, Element, Rarity, ScaleId, StatusId } from '../core/types.ts';
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
  fromSpell({ id: 'iop_concentration', spell: 13123, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(4, 'terre')], upgrade: [dmg(6, 'terre')] }),
  fromSpell({ id: 'iop_accumulation', spell: 13138, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(8, 'terre')], upgrade: [dmg(11, 'terre')] }),
  fromSpell({ id: 'iop_epee_de_iop', spell: 13125, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(10, 'terre')], upgrade: [dmg(14, 'terre')] }),
  fromSpell({ id: 'iop_colere', spell: 13124, type: A, target: 'enemy', rarity: 'rare', effects: [dmg(24, 'terre')], upgrade: [dmg(32, 'terre')] }),
  // Feu : brûlure et gros coups
  fromSpell({ id: 'iop_sentence', spell: 13147, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'feu'), status('brulure', 2, 'target')], upgrade: [dmg(4, 'feu'), status('brulure', 3, 'target')] }),
  fromSpell({ id: 'iop_tempete', spell: 13121, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(8, 'feu')], upgrade: [dmg(11, 'feu')] }),
  fromSpell({ id: 'iop_epee_destin', spell: 13111, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(14, 'feu')], upgrade: [dmg(18, 'feu')] }),
  fromSpell({ id: 'iop_epee_destructrice', spell: 13119, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(9, 'feu'), status('vulnerabilite', 1, 'all_enemies')], upgrade: [dmg(12, 'feu'), status('vulnerabilite', 2, 'all_enemies')] }),
  // Air : tempo, multi-coups
  fromSpell({ id: 'iop_souffle', spell: 13116, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(3, 'air')], upgrade: [dmg(5, 'air')] }),
  fromSpell({ id: 'iop_epee_divine', spell: 13110, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(6, 'air'), status('puissance', 1, 'self')], upgrade: [dmg(8, 'air'), status('puissance', 1, 'self')] }),
  fromSpell({ id: 'iop_zenith', spell: 13145, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(6, 'air', 2)], upgrade: [dmg(8, 'air', 2)] }),
  fromSpell({ id: 'iop_epee_celeste', spell: 13122, type: A, target: 'all_enemies', rarity: 'rare', effects: [dmg(10, 'air')], upgrade: [dmg(14, 'air')] }),
  // Eau : bouclier + dégâts
  fromSpell({ id: 'iop_ferveur', spell: 14676, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(3, 'eau'), block(3)], upgrade: [dmg(4, 'eau'), block(5)] }),
  fromSpell({ id: 'iop_endurance', spell: 13133, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'eau'), block(5)], upgrade: [dmg(7, 'eau'), block(7)] }),
  fromSpell({ id: 'iop_epee_jugement', spell: 13117, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(10, 'eau'), block(8)], upgrade: [dmg(13, 'eau'), block(10)] }),
  // Neutre
  fromSpell({ id: 'iop_determination', spell: 13132, type: C, target: 'self', rarity: 'commune', effects: [block(4)], upgrade: [block(7)] }),
  fromSpell({ id: 'iop_puissance', spell: 13118, type: C, target: 'self', rarity: 'rare', effects: [status('puissance', 2, 'self')], upgrade: [status('puissance', 3, 'self')] }),
  fromSpell({ id: 'iop_bond', spell: 13107, type: C, target: 'self', rarity: 'rare',
    effects: [status('vulnerabilite', 2, 'all_enemies'), draw(1)], upgrade: [status('vulnerabilite', 3, 'all_enemies'), draw(1)] }),
  // ───── Extension : Courroux (attaques en chaîne), sang, érosion, renvoi ─────
  fromSpell({ id: 'iop_intimidation', spell: 13108, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(4, 'neutre'), status('faiblesse', 1, 'target')], upgrade: [dmg(5, 'neutre'), status('faiblesse', 2, 'target')] }),
  fromSpell({ id: 'iop_massacre', spell: 13112, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmgPer(2, 'neutre', 'attaques', 3)], upgrade: [dmgPer(3, 'neutre', 'attaques', 4)] }),
  fromSpell({ id: 'iop_pugilat', spell: 13146, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmgPer(2, 'terre', 'attaques', 1)], upgrade: [dmgPer(3, 'terre', 'attaques', 2)] }),
  fromSpell({ id: 'iop_fureur', spell: 13156, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmgPer(7, 'terre', 'lancers', 4)], upgrade: [dmgPer(8, 'terre', 'lancers', 6)] }),
  fromSpell({ id: 'iop_couperet', spell: 13115, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'feu'), status('brulure', 3, 'target')], upgrade: [dmg(7, 'feu'), status('brulure', 4, 'target')] }),
  fromSpell({ id: 'iop_rassemblement', spell: 13136, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'feu'), status('brulure', 2, 'all_enemies')], upgrade: [dmg(5, 'feu'), status('brulure', 3, 'all_enemies')] }),
  fromSpell({ id: 'iop_tumulte', spell: 13144, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmgPer(7, 'feu', 'ennemis', 3), loseHp(3)], upgrade: [dmgPer(9, 'feu', 'ennemis', 4), loseHp(3)] }),
  fromSpell({ id: 'iop_tannee', spell: 13131, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'air'), status('faiblesse', 1, 'all_enemies')], upgrade: [dmg(6, 'air'), status('faiblesse', 1, 'all_enemies')] }),
  fromSpell({ id: 'iop_anneau', spell: 13135, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(3, 'air', 2)], upgrade: [dmg(4, 'air', 2)] }),
  fromSpell({ id: 'iop_fracture', spell: 13139, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(9, 'air'), status('erosion', 2, 'all_enemies')], upgrade: [dmg(12, 'air'), status('erosion', 3, 'all_enemies')] }),
  fromSpell({ id: 'iop_deferlement', spell: 13126, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmgPer(10, 'eau', 'puissance', 2)], upgrade: [dmgPer(13, 'eau', 'puissance', 3)] }),
  fromSpell({ id: 'iop_menace', spell: 13130, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(5, 'eau'), status('bouclier', 3, 'self')], upgrade: [dmg(7, 'eau'), status('bouclier', 4, 'self')] }),
  fromSpell({ id: 'iop_fendoir', spell: 13134, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(8, 'eau'), blockPer(2, 'ennemis', 3)], upgrade: [dmg(11, 'eau'), blockPer(3, 'ennemis', 4)] }),
  fromSpell({ id: 'iop_fustigation', spell: 14818, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(5, 'eau'), status('erosion', 2, 'all_enemies')], upgrade: [dmg(7, 'eau'), status('erosion', 3, 'all_enemies')] }),
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
  fromSpell({ id: 'cra_fleche_cinglante', spell: 32427, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(4, 'air')], upgrade: [dmg(6, 'air')] }),
  fromSpell({ id: 'cra_fleche_recul', spell: 32426, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(8, 'air')], upgrade: [dmg(11, 'air')] }),
  fromSpell({ id: 'cra_pluie_fleches', spell: 32431, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(5, 'air')], upgrade: [dmg(7, 'air')] }),
  fromSpell({ id: 'cra_fleche_harcelante', spell: 32708, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'air'), status('brulure', 3, 'target')], upgrade: [dmg(4, 'air'), status('brulure', 4, 'target')] }),
  fromSpell({ id: 'cra_fleche_perforante', spell: 32429, type: A, target: 'enemy', rarity: 'rare', effects: [dmg(15, 'air')], upgrade: [dmg(20, 'air')] }),
  // Eau : drain et affaiblissement
  fromSpell({ id: 'cra_fleche_immobilisation', spell: 32436, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'eau'), status('faiblesse', 1, 'target')], upgrade: [dmg(4, 'eau'), status('faiblesse', 2, 'target')] }),
  fromSpell({ id: 'cra_oeil_de_taupe', spell: 32437, type: A, target: 'all_enemies', rarity: 'commune', effects: [drain(3, 'eau')], upgrade: [drain(5, 'eau')] }),
  fromSpell({ id: 'cra_fleche_redemption', spell: 32442, type: A, target: 'enemy', rarity: 'rare', effects: [drain(10, 'eau')], upgrade: [drain(14, 'eau')] }),
  // Feu : brûlure et zone
  fromSpell({ id: 'cra_fleche_detonante', spell: 32444, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'feu'), status('brulure', 2, 'target')], upgrade: [dmg(4, 'feu'), status('brulure', 3, 'target')] }),
  fromSpell({ id: 'cra_fleche_devorante', spell: 32446, type: A, target: 'enemy', rarity: 'commune', effects: [drain(6, 'feu')], upgrade: [drain(8, 'feu')] }),
  fromSpell({ id: 'cra_fleche_explosive', spell: 32445, type: A, target: 'all_enemies', rarity: 'commune', effects: [dmg(10, 'feu')], upgrade: [dmg(14, 'feu')] }),
  fromSpell({ id: 'cra_fleche_tyrannique', spell: 32448, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(6, 'feu'), status('brulure', 6, 'target')], upgrade: [dmg(8, 'feu'), status('brulure', 8, 'target')] }),
  // Terre : coups lourds
  fromSpell({ id: 'cra_fleche_abolition', spell: 32453, type: A, target: 'enemy', rarity: 'commune', effects: [drain(3, 'terre')], upgrade: [drain(5, 'terre')] }),
  fromSpell({ id: 'cra_fleche_vagabonde', spell: 32455, type: A, target: 'enemy', rarity: 'commune', effects: [dmg(8, 'terre')], upgrade: [dmg(11, 'terre')] }),
  fromSpell({ id: 'cra_fleche_punitive', spell: 32456, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(11, 'terre'), status('vulnerabilite', 1, 'target')], upgrade: [dmg(14, 'terre'), status('vulnerabilite', 2, 'target')] }),
  fromSpell({ id: 'cra_carreaux_destructeurs', spell: 32459, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmg(8, 'terre'), status('faiblesse', 1, 'all_enemies')], upgrade: [dmg(11, 'terre'), status('faiblesse', 2, 'all_enemies')] }),
  // Neutre
  fromSpell({ id: 'cra_tir_percant', spell: 32471, type: C, target: 'enemy', rarity: 'commune',
    effects: [status('vulnerabilite', 2, 'target')], upgrade: [status('vulnerabilite', 3, 'target')] }),
  fromSpell({ id: 'cra_sentinelle', spell: 32475, type: C, target: 'self', rarity: 'commune', exhaust: true, effects: [draw(2)], upgrade: [draw(3)] }),
  fromSpell({ id: 'cra_tirs_puissants', spell: 32466, type: C, target: 'self', rarity: 'rare', effects: [status('puissance', 1, 'self')], upgrade: [status('puissance', 2, 'self')] }),
  // ───── Extension : Visée (tirs préparés), poison, esquive, précision ─────
  fromSpell({ id: 'cra_fleche_evasive', spell: 32531, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(3, 'eau'), charge(1)], upgrade: [dmg(5, 'eau'), charge(1)] }),
  fromSpell({ id: 'cra_fleche_boomerang', spell: 32432, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(4, 'air', 2)], upgrade: [dmg(5, 'air', 2)] }),
  fromSpell({ id: 'cra_fleche_dispersion', spell: 32428, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(4, 'air'), charge(1)], upgrade: [dmg(6, 'air'), charge(1)] }),
  fromSpell({ id: 'cra_fleche_persecutrice', spell: 32433, type: A, target: 'enemy', rarity: 'rare',
    effects: [drain(6, 'air'), status('poison', 6, 'target')], upgrade: [drain(8, 'air'), status('poison', 8, 'target')] }),
  fromSpell({ id: 'cra_fleche_expiation', spell: 32438, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmg(11, 'eau'), status('erosion', 2, 'target')], upgrade: [dmg(14, 'eau'), status('erosion', 3, 'target')] }),
  fromSpell({ id: 'cra_fleche_ralentissante', spell: 32439, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(5, 'eau'), status('poison', 3, 'all_enemies')], upgrade: [dmg(7, 'eau'), status('poison', 4, 'all_enemies')] }),
  fromSpell({ id: 'cra_fleche_paralysante', spell: 32441, type: A, target: 'enemy', rarity: 'rare', exhaust: true,
    effects: [dmg(8, 'eau'), status('etourdi', 1, 'target')], upgrade: [dmg(12, 'eau'), status('etourdi', 1, 'target')] }),
  fromSpell({ id: 'cra_fleche_barrage', spell: 32443, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(5, 'feu'), block(3)], upgrade: [dmg(7, 'feu'), block(4)] }),
  fromSpell({ id: 'cra_fleche_eclatante', spell: 32449, type: A, target: 'all_enemies', rarity: 'commune',
    effects: [dmg(3, 'feu'), status('brulure', 2, 'all_enemies')], upgrade: [dmg(4, 'feu'), status('brulure', 3, 'all_enemies')] }),
  fromSpell({ id: 'cra_fleche_fulminante', spell: 32450, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmg(9, 'feu'), status('brulure', 3, 'all_enemies')], upgrade: [dmg(12, 'feu'), status('brulure', 4, 'all_enemies')] }),
  fromSpell({ id: 'cra_oeil_pour_oeil', spell: 32454, type: A, target: 'enemy', rarity: 'commune',
    effects: [drain(5, 'terre'), status('renvoi', 2, 'self')], upgrade: [drain(7, 'terre'), status('renvoi', 3, 'self')] }),
  fromSpell({ id: 'cra_fleche_massacrante', spell: 32457, type: A, target: 'all_enemies', rarity: 'rare',
    effects: [dmgPer(6, 'terre', 'ennemis', 3)], upgrade: [dmgPer(8, 'terre', 'ennemis', 4)] }),
  fromSpell({ id: 'cra_fleche_assaillante', spell: 32458, type: A, target: 'enemy', rarity: 'commune',
    effects: [dmgPer(6, 'terre', 'statuts', 3)], upgrade: [dmgPer(8, 'terre', 'statuts', 4)] }),
  fromSpell({ id: 'cra_fleche_jugement', spell: 32460, type: A, target: 'enemy', rarity: 'rare',
    effects: [dmgPer(8, 'terre', 'main', 2)], upgrade: [dmgPer(10, 'terre', 'main', 3)] }),
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
  arme('arme_dague', 'Coup de dague', 0, 'enemy', 'commune', [dmg(2, 'neutre', 2)], [dmg(3, 'neutre', 2)]),
  arme('arme_baton', 'Coup de bâton', 1, 'enemy', 'commune', [dmg(4, 'neutre'), block(4)], [dmg(6, 'neutre'), block(6)]),
  arme('arme_pelle', 'Coup de pelle', 1, 'enemy', 'commune', [dmg(5, 'neutre'), draw(1)], [dmg(7, 'neutre'), draw(1)]),
  arme('arme_marteau', 'Coup de marteau', 2, 'all_enemies', 'rare', [dmg(8, 'neutre')], [dmg(11, 'neutre')]),
  arme('arme_hache', 'Coup de hache', 2, 'enemy', 'rare',
    [dmg(14, 'neutre'), status('vulnerabilite', 1, 'target')], [dmg(18, 'neutre'), status('vulnerabilite', 2, 'target')]),
];

export const ALL_CARDS: CardDef[] = [...IOP_CARDS, ...CRA_CARDS, ...NEUTRAL_CARDS];
