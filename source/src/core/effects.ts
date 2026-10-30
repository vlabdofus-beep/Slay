// Effets d'objets tirés au sort à chaque run.
//
// Un effet = DÉCLENCHEUR (un moment du combat, éventuellement conditionné) + RÉCOMPENSE × quantité.
// Chaque déclencheur a une fréquence (nombre moyen de déclenchements par combat) et chaque récompense
// une valeur (en « points », 1 point ≈ 1 dégât). Puissance d'un effet = fréquence × valeur × quantité.
// La rareté de l'objet fixe le budget ; le tirage ne garde que les combinaisons qui y tiennent.
// Les légendaires sont à part : des règles écrites à la main qui changent une mécanique.
//
// Fréquences et valeurs sont chiffrées par simulation (src/sim/calibrate.ts) : voir docs/BALANCE.md.
import type { Combat, Enemy } from './combat.ts';
import type { Rng } from './rng.ts';
import type { CardDef, Element, ItemRarity, StatusId } from './types.ts';

export type EventId =
  | 'combatStart' | 'turnStart' | 'turnEnd' | 'cardPlayed' | 'enemyKilled' | 'hpLost' | 'blockGained' | 'combatWon';

/** Contexte d'un événement de combat. */
export interface EvCtx {
  card?: CardDef;
  /** PA réellement payés pour la carte. */
  cost?: number;
  /** Cible de la carte, ou ennemi qui vient de mourir. */
  target?: Enemy;
  /** Ennemis touchés par la carte. */
  hits?: Enemy[];
  /** Élément de ce qui a causé l'événement (carte jouée, ennemi achevé). */
  element?: Element | null;
  /** PV perdus, armure gagnée… */
  amount?: number;
}

type ElementalEl = Exclude<Element, 'neutre'>;
const ELS: ElementalEl[] = ['terre', 'feu', 'eau', 'air'];
export const EL_NAME: Record<Element, string> = { terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air', neutre: 'neutre' };

export interface TriggerDef {
  id: string;
  event: EventId;
  /** Début de phrase : « Quand tu joues une carte Feu », « Au début de chaque tour »… */
  text: string;
  /** Déclenchements moyens par combat. */
  freq: number;
  el?: ElementalEl;
  test?: (c: Combat, x: EvCtx) => boolean;
  /** 'card' : la cible du sort est connue ; 'end' : fin de tour (ni pioche ni PA) ; 'won' : combat gagné. */
  kind?: 'card' | 'end' | 'won';
  /** Peut donner de la prospection (événements liés au butin). */
  loot?: boolean;
  /** Nombre réel de déclenchements par combat, pour chiffrer la prospection (si différent de freq). */
  lootFreq?: number;
  /** Ne peut survenir qu'une fois par tour (la limite par objet ne s'affiche pas). */
  single?: boolean;
}

export interface RewardDef {
  id: string;
  /** Points par unité. */
  value: number;
  max?: number;
  text: (n: number, t: TriggerDef) => string;
  apply: (c: Combat, n: number, x: EvCtx, t: TriggerDef) => void;
  ok?: (t: TriggerDef) => boolean;
  /** Récompense de butin : se chiffre en prospection, pas en puissance de combat. */
  loot?: boolean;
  /** Nombre maximum de déclenchements par tour pour un même objet (défaut : DEFAULT_PER_TURN). */
  perTurn?: number;
}

/** Un même objet ne se déclenche pas plus de 3 fois par tour ; pioche, PA et réduction : une fois. */
export const DEFAULT_PER_TURN = 3;
export const perTurn = (r: RewardDef) => r.perTurn ?? DEFAULT_PER_TURN;
/** Déclencheurs qui peuvent survenir plusieurs fois dans un tour (la limite par tour se lit alors sur l'objet). */
const REPEATABLE: EventId[] = ['cardPlayed', 'enemyKilled', 'hpLost', 'blockGained'];

// ───────────── déclencheurs ─────────────

const isEl = (el: Element) => (_c: Combat, x: EvCtx) => x.card?.element === el;

export const TRIGGERS: TriggerDef[] = [
  ...ELS.flatMap((el): TriggerDef[] => {
    const E = EL_NAME[el];
    return [
      { id: `carte_${el}`, event: 'cardPlayed', kind: 'card', el, freq: 3.0, text: `Quand tu joues une carte ${E}`, test: isEl(el) },
      { id: `premiere_${el}`, event: 'cardPlayed', kind: 'card', single: true, el, freq: 2.4, text: `Ta première carte ${E} de chaque tour`,
        test: (c, x) => x.card?.element === el && c.turnEl[el] === 1 },
      { id: `deuxieme_${el}`, event: 'cardPlayed', kind: 'card', single: true, el, freq: 0.8, text: `Quand tu joues ta 2e carte ${E} du tour`,
        test: (c, x) => x.card?.element === el && c.turnEl[el] === 2 },
      { id: `ouverture_${el}`, event: 'cardPlayed', kind: 'card', single: true, el, freq: 1.4, text: `Ta première carte ${E} du combat`,
        test: (c, x) => x.card?.element === el && c.combatEl[el] === 1 },
      { id: `acheve_${el}`, event: 'enemyKilled', el, freq: 0.5, loot: true, lootFreq: 0.8, text: `Quand un sort ${E} achève un ennemi`,
        test: (_c, x) => x.element === el },
    ];
  }),
  { id: 'debut_tour', event: 'turnStart', freq: 4.5, text: 'Au début de chaque tour' },
  { id: 'debut_combat', event: 'combatStart', freq: 1.6, text: 'Au début du combat' },
  { id: 'premier_tour', event: 'turnStart', freq: 1.6, text: 'Au premier tour', test: (c) => c.turn === 1 },
  { id: 'tous_3_tours', event: 'turnStart', freq: 1.0, text: 'Tous les 3 tours', test: (c) => c.turn % 3 === 0 },
  { id: 'pv_bas', event: 'turnStart', freq: 2.0, text: 'Au début de ton tour, si tu as moins de la moitié de tes PV',
    test: (c) => c.player.hp * 2 < c.player.maxHp },
  { id: 'fin_pa', event: 'turnEnd', kind: 'end', freq: 0.6, text: 'Si tu finis ton tour avec au moins 1 PA',
    test: (c) => c.player.energy >= 1 },
  { id: 'fin_armure', event: 'turnEnd', kind: 'end', freq: 1.5, text: 'Si tu finis ton tour avec de l\'armure',
    test: (c) => c.player.block > 0 },
  { id: 'fin_main', event: 'turnEnd', kind: 'end', freq: 0.5, text: 'Si tu finis ton tour la main vide',
    test: (c) => c.hand.length === 0 },
  { id: 'ennemi_meurt', event: 'enemyKilled', freq: 1.4, loot: true, lootFreq: 2, text: 'Quand un ennemi meurt' },
  { id: 'pv_perdus', event: 'hpLost', freq: 3.5, text: 'Quand tu perds des PV' },
  { id: 'armure_gagnee', event: 'blockGained', freq: 2.2, text: 'Quand tu gagnes de l\'armure' },
  { id: 'toutes_3_cartes', event: 'cardPlayed', kind: 'card', freq: 4.8, text: 'Toutes les 3 cartes jouées',
    test: (c) => c.combatCards % 3 === 0 },
  { id: 'attaque', event: 'cardPlayed', kind: 'card', freq: 10, text: 'Quand tu joues une attaque', test: (_c, x) => x.card?.type === 'attaque' },
  { id: 'competence', event: 'cardPlayed', kind: 'card', freq: 2.5, text: 'Quand tu joues une compétence', test: (_c, x) => x.card?.type === 'competence' },
  { id: 'gratuite', event: 'cardPlayed', kind: 'card', freq: 2.2, text: 'Quand tu joues une carte à 0 PA', test: (_c, x) => x.cost === 0 },
  { id: 'chere', event: 'cardPlayed', kind: 'card', freq: 1.6, text: 'Quand tu joues une carte à 2 PA ou plus', test: (_c, x) => (x.cost ?? 0) >= 2 },
  { id: 'premiere_carte', event: 'cardPlayed', kind: 'card', single: true, freq: 5, text: 'Ta première carte de chaque tour', test: (c) => c.turnCards === 1 },
  { id: 'dernier_pa', event: 'cardPlayed', kind: 'card', freq: 4.5, text: 'Quand tu dépenses ton dernier PA',
    test: (c, x) => (x.cost ?? 0) > 0 && c.player.energy === 0 },
  { id: 'trois_elements', event: 'cardPlayed', kind: 'card', single: true, freq: 0.4, text: 'La première fois que tu joues 3 éléments différents dans un tour',
    test: (c, x) => !!x.card && x.card.element !== 'neutre' && c.turnElementsCount() === 3 && c.turnEl[x.card.element] === 1 },
  { id: 'zone', event: 'cardPlayed', kind: 'card', freq: 0.9, text: 'Quand un sort touche plusieurs ennemis', test: (_c, x) => (x.hits?.length ?? 0) >= 2 },
  { id: 'cible_brule', event: 'cardPlayed', kind: 'card', freq: 1.9, text: 'Quand tu attaques un ennemi qui brûle',
    test: (_c, x) => x.card?.type === 'attaque' && !!x.target && (x.target.status.brulure ?? 0) > 0 },
  { id: 'cible_empoisonnee', event: 'cardPlayed', kind: 'card', freq: 0.8, text: 'Quand tu attaques un ennemi empoisonné',
    test: (_c, x) => x.card?.type === 'attaque' && !!x.target && (x.target.status.poison ?? 0) > 0 },
  { id: 'cible_vulnerable', event: 'cardPlayed', kind: 'card', freq: 2.0, text: 'Quand tu attaques un ennemi vulnérable',
    test: (_c, x) => x.card?.type === 'attaque' && !!x.target && (x.target.status.vulnerabilite ?? 0) > 0 },
  { id: 'victoire', event: 'combatWon', kind: 'won', freq: 1.5, loot: true, lootFreq: 1, text: 'À la fin d\'un combat gagné' },
  { id: 'victoire_intacte', event: 'combatWon', kind: 'won', freq: 0.3, loot: true, text: 'À la fin d\'un combat gagné sans perdre de PV',
    test: (c) => c.hpLostThisCombat === 0 },
];

// ───────────── récompenses ─────────────

/** Cible d'une récompense offensive : la cible du sort si elle vit encore, sinon un ennemi au hasard. */
function foe(c: Combat, x: EvCtx): Enemy | undefined {
  if (x.target && !x.target.dead) return x.target;
  const living = c.living();
  return living.length ? c.rng.pick(living) : undefined;
}
const where = (t: TriggerDef) => (t.kind === 'card' ? 'à la cible' : 'à un ennemi au hasard');
const notWon = (t: TriggerDef) => t.kind !== 'won';
const inTurn = (t: TriggerDef) => t.kind !== 'won' && t.kind !== 'end';

function foeStatus(id: string, status: StatusId, value: number, name: string, max?: number): RewardDef {
  return {
    id, value, max, ok: notWon,
    text: (n, t) => `applique ${n} ${name} ${where(t)}`,
    apply: (c, n, x) => { const e = foe(c, x); if (e) c.fxStatus(e, status, n); },
  };
}

export const REWARDS: RewardDef[] = [
  { id: 'puissance', value: 5, max: 2, ok: notWon, text: (n) => `+${n} puissance`, apply: (c, n) => c.fxStatus(c.player, 'puissance', n) },
  { id: 'armure', value: 1.8, max: 12, ok: (t) => notWon(t) && t.event !== 'blockGained', text: (n) => `gagne ${n} armure`, apply: (c, n) => c.fxBlock(n) },
  { id: 'bouclier', value: 2.2, max: 12, ok: (t) => notWon(t) && t.event !== 'blockGained', text: (n) => `gagne ${n} bouclier`, apply: (c, n) => c.fxStatus(c.player, 'bouclier', n) },
  { id: 'soin', value: 2.8, max: 12, text: (n) => `soigne ${n} PV`, apply: (c, n) => c.fxHeal(n) },
  { id: 'pioche', value: 3.5, max: 2, perTurn: 1, ok: inTurn, text: (n) => (n > 1 ? `pioche ${n} cartes` : 'pioche 1 carte'), apply: (c, n) => c.fxDraw(n) },
  { id: 'pa', value: 7, max: 1, perTurn: 1, ok: inTurn, text: (n) => `+${n} PA`, apply: (c, n) => c.fxEnergy(n) },
  { id: 'reduction', value: 6, max: 1, perTurn: 1, ok: inTurn, text: (n) => `ta prochaine carte coûte ${n} PA de moins`, apply: (c, n) => c.fxDiscount(n) },
  { id: 'esquive', value: 9, max: 2, ok: notWon, text: (n) => `+${n} esquive`, apply: (c, n) => c.fxStatus(c.player, 'esquive', n) },
  { id: 'renvoi', value: 1.2, max: 6, ok: notWon, text: (n) => `+${n} renvoi de dommages`, apply: (c, n) => c.fxStatus(c.player, 'renvoi', n) },
  foeStatus('brulure', 'brulure', 1.6, 'brûlure', 3),
  foeStatus('poison', 'poison', 1.6, 'poison', 4),
  foeStatus('vulnerabilite', 'vulnerabilite', 5, 'vulnérabilité', 3),
  foeStatus('faiblesse', 'faiblesse', 3.5, 'faiblesse', 3),
  foeStatus('erosion', 'erosion', 0.7, 'érosion', 4),
  foeStatus('etourdi', 'etourdi', 11, 'étourdi', 2),
  { id: 'brulure_zone', value: 2.8, max: 2, ok: notWon, text: (n) => `applique ${n} brûlure à tous les ennemis`,
    apply: (c, n) => { for (const e of c.living()) c.fxStatus(e, 'brulure', n); } },
  { id: 'poison_zone', value: 2.8, max: 3, ok: notWon, text: (n) => `applique ${n} poison à tous les ennemis`,
    apply: (c, n) => { for (const e of c.living()) c.fxStatus(e, 'poison', n); } },
  { id: 'degats', value: 1, max: 15, ok: notWon, text: (n, t) => `inflige ${n} dégâts ${t.el ? EL_NAME[t.el] : 'neutres'} ${where(t)}`,
    apply: (c, n, x, t) => { const e = foe(c, x); if (e) c.fxDamage(e, n, t.el ?? 'neutre'); } },
  { id: 'degats_zone', value: 1.8, max: 10, ok: notWon, text: (n, t) => `inflige ${n} dégâts ${t.el ? EL_NAME[t.el] : 'neutres'} à tous les ennemis`,
    apply: (c, n, _x, t) => { for (const e of c.living()) c.fxDamage(e, n, t.el ?? 'neutre'); } },
  // Réservée aux pouvoirs du Crâ : jamais tirée sur un objet.
  { id: 'visee', value: 4, ok: () => false, text: (n) => `Visée +${n}`, apply: (c, n) => c.fxCharge(n) },
  { id: 'prospection', value: 1, max: 60, loot: true, ok: (t) => !!t.loot, text: (n) => `+${n} prospection au prochain combat`,
    apply: (c, n) => { c.prospection.next += n; } },
  { id: 'prospection_run', value: 4, max: 30, loot: true, ok: (t) => !!t.loot, text: (n) => `+${n} prospection pour le reste de la run`,
    apply: (c, n) => { c.prospection.run += n; } },
];

export const TRIGGER_BY_ID: Record<string, TriggerDef> = Object.fromEntries(TRIGGERS.map((t) => [t.id, t]));
export const REWARD_BY_ID: Record<string, RewardDef> = Object.fromEntries(REWARDS.map((r) => [r.id, r]));

// ───────────── règles légendaires ─────────────

export const RULES = {
  brulure_tenace: 'La brûlure ne diminue plus en fin de round.',
  poison_tenace: 'Le poison perd 1 par round au lieu d\'être divisé par 2.',
  premiere_gratuite: 'Ta première carte de chaque tour coûte 1 PA de moins.',
  eau_vampire: 'Tes dégâts Eau te soignent de la moitié des PV retirés.',
  armure_persistante: 'Tu gardes la moitié de ton armure d\'un tour à l\'autre.',
  pa_plus: '+1 PA à chaque tour, mais tu pioches 1 carte de moins.',
  main_gardee: 'Tu ne défausses plus ta main en fin de tour (10 cartes au plus).',
  contagion: 'Quand un ennemi meurt, sa brûlure, son poison et sa vulnérabilité passent à un autre ennemi.',
  ricochet: 'Tes attaques à cible unique touchent aussi un autre ennemi pour la moitié des dégâts.',
  puissance_armure: 'Ta puissance s\'ajoute aussi à chaque gain d\'armure.',
  air_perce: 'Tes dégâts Air ignorent l\'armure et le bouclier.',
  vulne_forte: 'La vulnérabilité que tu appliques augmente les dégâts de 75 % au lieu de 50 %.',
  brule_empoisonne: 'Chaque brûlure que tu appliques applique autant de poison.',
  etourdi_fragile: 'Les ennemis étourdis subissent le double de dégâts.',
  renvoi_moitie: 'Tu renvoies la moitié des dégâts que tu subis à l\'attaquant.',
  triple_element: 'La première fois que tu joues 3 éléments différents dans un tour : +2 PA et pioche 2 cartes.',
  soin_bouclier: 'Les soins au-delà de tes PV max deviennent du bouclier.',
  double_premier: 'Ta première carte de chaque combat est lancée deux fois.',
  faiblesse_forte: 'Les ennemis affaiblis infligent 50 % de dégâts en moins au lieu de 25 %.',
  prospecteur: '+60 prospection. Chaque combat gagné sans perdre de PV donne +20 prospection pour le reste de la run.',
  armure_offensive: 'À la fin de ton tour, inflige la moitié de ton armure en dégâts à un ennemi au hasard.',
  braises: 'Quand un ennemi qui brûle meurt, il inflige 2 fois sa brûlure à tous les autres ennemis.',
} as const;
/** Règles propres aux Dofus (récompenses de boss), hors du tirage des légendaires. */
export const DOFUS_RULES = {
  ivoire: 'Chaque coup que tu reçois inflige 2 dégâts de moins.',
  pioche_plus: 'Tu pioches 1 carte de plus à chaque tour.',
  resurrection: 'Une fois par run, quand tu tombes à 0 PV, tu reviens avec la moitié de tes PV.',
  ocre: '+1 PA à chaque tour. Les monstres commencent chaque combat avec 1 puissance.',
  cauchemar: 'Les monstres commencent chaque combat avec 3 vulnérabilité.',
} as const;
export type RuleId = keyof typeof RULES | keyof typeof DOFUS_RULES;
export const RULE_IDS = Object.keys(RULES) as (keyof typeof RULES)[];
export const ruleText = (r: RuleId): string => (r in RULES ? RULES[r as keyof typeof RULES] : DOFUS_RULES[r as keyof typeof DOFUS_RULES]);

// ───────────── tirage ─────────────

export interface EffectPart { trigger: string; reward: string; amount: number }
export type ItemEffect = { kind: 'roll'; parts: EffectPart[] } | { kind: 'rule'; rule: RuleId };

/** Budget de chaque rareté, en points par combat. Le mythique répartit le sien sur deux récompenses. */
export const BUDGET: Record<Exclude<ItemRarity, 'legendaire'>, number> = { commun: 6, rare: 11, mythique: 17 };
/** Points de prospection par point de budget. */
export const PROSP_PER_POINT = 8;
const TOLERANCE: [number, number] = [0.6, 1.5];

/** Tours par combat en moyenne (sert à borner la fréquence d'un objet limité par tour). */
const TURNS_PER_COMBAT = 4.5;

export function partPower(t: TriggerDef, r: RewardDef, n: number): number {
  const freq = REPEATABLE.includes(t.event) && !t.single ? Math.min(t.freq, perTurn(r) * TURNS_PER_COMBAT) : t.freq;
  return (r.loot ? (t.lootFreq ?? freq) / PROSP_PER_POINT : freq) * r.value * n;
}

/** Quantité qui fait tenir la combinaison dans le budget, ou null si impossible. */
export function amountFor(t: TriggerDef, r: RewardDef, budget: number): number | null {
  if (r.ok && !r.ok(t)) return null;
  const unit = partPower(t, r, 1);
  let n = Math.max(1, Math.round(budget / unit));
  if (r.max) n = Math.min(n, r.max);
  const p = unit * n;
  if (p < budget * TOLERANCE[0] || p > budget * TOLERANCE[1]) return null;
  return n;
}

/** Toutes les combinaisons valides d'une rareté (un déclencheur, une récompense). */
export function combos(budget: number): EffectPart[] {
  const out: EffectPart[] = [];
  for (const t of TRIGGERS) for (const r of REWARDS) {
    const n = amountFor(t, r, budget);
    if (n !== null) out.push({ trigger: t.id, reward: r.id, amount: n });
  }
  return out;
}

const SINGLE = { commun: combos(BUDGET.commun), rare: combos(BUDGET.rare) };
const HALF_MYTHIC = combos(BUDGET.mythique / 2);

/** Tire l'effet d'un objet de cette rareté. */
export function rollEffect(rarity: ItemRarity, rng: Rng): ItemEffect {
  if (rarity === 'legendaire') return { kind: 'rule', rule: rng.pick(RULE_IDS) };
  if (rarity !== 'mythique') return { kind: 'roll', parts: [rng.pick(SINGLE[rarity])] };
  // Mythique : un déclencheur, deux récompenses différentes (chacune la moitié du budget).
  for (let i = 0; i < 50; i++) {
    const a = rng.pick(HALF_MYTHIC);
    const others = HALF_MYTHIC.filter((p) => p.trigger === a.trigger && p.reward !== a.reward
      && !!REWARD_BY_ID[p.reward].loot === !!REWARD_BY_ID[a.reward].loot);
    if (others.length) return { kind: 'roll', parts: [a, rng.pick(others)] };
  }
  return { kind: 'roll', parts: [rng.pick(combos(BUDGET.mythique))] };
}

/** Nombre d'effets distincts que le tirage peut produire. */
export function poolSize(): { commun: number; rare: number; mythique: number; legendaire: number } {
  let pairs = 0;
  const byTrigger = new Map<string, number>();
  for (const p of HALF_MYTHIC) byTrigger.set(p.trigger, (byTrigger.get(p.trigger) ?? 0) + 1);
  for (const n of byTrigger.values()) pairs += (n * (n - 1)) / 2;
  return { commun: SINGLE.commun.length, rare: SINGLE.rare.length, mythique: pairs, legendaire: RULE_IDS.length };
}

export function partText(p: EffectPart): string {
  const t = TRIGGER_BY_ID[p.trigger];
  return REWARD_BY_ID[p.reward].text(p.amount, t);
}

export function effectText(e: ItemEffect): string {
  if (e.kind === 'rule') return ruleText(e.rule);
  const t = TRIGGER_BY_ID[e.parts[0].trigger];
  const lim = (p: EffectPart) => { const n = perTurn(REWARD_BY_ID[p.reward]); return n === 1 ? 'une fois par tour' : `${n} fois par tour au plus`; };
  if (!REPEATABLE.includes(t.event) || t.single) return `${t.text} : ${e.parts.map(partText).join(' et ')}.`;
  const same = new Set(e.parts.map(lim)).size === 1;
  if (same) return `${t.text} : ${e.parts.map(partText).join(' et ')} (${lim(e.parts[0])}).`;
  return `${t.text} : ${e.parts.map((p) => `${partText(p)} (${lim(p)})`).join(' et ')}.`;
}

/** Puissance chiffrée d'un effet (points par combat ; prospection convertie). Les règles valent un forfait. */
export function effectPower(e: ItemEffect): number {
  if (e.kind === 'rule') return 24;
  return e.parts.reduce((s, p) => s + partPower(TRIGGER_BY_ID[p.trigger], REWARD_BY_ID[p.reward], p.amount), 0);
}
