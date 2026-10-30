import type { CardDef, CardTarget, CardType, ClassId, Effect, Element, Rarity } from '../core/types.ts';
import { paToCost, spell, spellElement, spellIcon } from './dofus.ts';

// Cartes reliées aux vrais sorts Dofus (src/data/dofus.json) : le NOM, l'ÉLÉMENT, le COÛT (via les PA)
// et l'ICÔNE viennent du sort. Les VALEURS sont les nôtres, calées sur les repères Spire Codex (docs/BALANCE.md) :
//   0 PA ≈ 3-4 dégâts, 1 ≈ 6-8, 2 ≈ 10-15, 3 ≈ 24 ; armure 1 PA ≈ 5 ; amélioration ≈ +33 %.
// Coût : 1-2 PA → 0, 3 PA → 1, 4-5 PA → 2, 6+ PA → 3. Seules les cartes de base peuvent y déroger.
// Règle : les cartes de base sont neutres (aucun deck de départ pénalisé), sauf la signature de la classe.

const dmg = (amount: number, element: Element, hits?: number): Effect =>
  hits ? { type: 'damage', amount, element, hits } : { type: 'damage', amount, element };
const drain = (amount: number, element: Element): Effect => ({ type: 'drain', amount, element });
const block = (amount: number): Effect => ({ type: 'block', amount });
const draw = (amount: number): Effect => ({ type: 'draw', amount });
const status = (
  s: 'puissance' | 'faiblesse' | 'vulnerabilite' | 'brulure',
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
    upgrade: { effects: spec.upgrade },
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

const A = 'attaque' as const;
const C = 'competence' as const;

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
];

export const ALL_CARDS: CardDef[] = [...IOP_CARDS, ...CRA_CARDS];
