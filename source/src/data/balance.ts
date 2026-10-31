// Fichier d'équilibrage (equilibrage.json, à la racine du dépôt) : toutes les valeurs réglables du jeu en un endroit.
//  - Au chargement des données, le fichier s'applique par-dessus les valeurs écrites dans le code.
//  - Le jeu en ligne relit le fichier au démarrage : une modification faite sur GitHub s'applique sans reconstruire.
//  - `node tools/export-balance.ts` ajoute au fichier les cartes et monstres nouveaux, sans toucher aux valeurs existantes.
import type { CardDef, ClassId, Effect, Element, MonsterDef, MonsterMove, MonsterPower, MovePattern, Rarity, CardType } from '../core/types.ts';
import { BOON_RULES, DOFUS_RULES, REWARDS, RULES, TRIGGERS, TRIGGER_BY_ID, REWARD_BY_ID, type ItemEffect, type RuleId } from '../core/effects.ts';
import type { Boon, RunOp, RunPerks } from '../game/boons.ts';
import type { GodDef } from './gods.ts';

type Scale = Record<1 | 2 | 3, Record<string, { hp: number; damage: number }>>;
export interface BalanceTargets {
  cards: Record<string, CardDef>;
  monsters: Record<string, MonsterDef>;
  classHp: Partial<Record<ClassId, number>>;
  starters: Partial<Record<ClassId, Record<string, number>>>;
  passives: { courroux: { attaques: number; puissance: number }; visee: { attaques: number; multiplicateur: number } };
  scale: Scale;
  gods: GodDef[];
}

/** Effet de combat d'une bénédiction, lisible : un déclencheur et une récompense, ou une règle. */
export type BalanceBoonFx =
  | { declencheur: string; recompense: string; quantite: number; par_tour?: number; une_fois?: boolean }
  | { regle: string };
export interface BalanceBoon {
  nom: string;
  effets?: BalanceBoonFx[];
  stats?: { pv?: number; armure?: number; prospection?: number; degats?: Partial<Record<Element, number>> };
  avantages?: { kamas?: number; remise_marchand?: number; cartes_en_plus?: number; resurrection?: number; soin_zaap?: number };
  immediat?: RunOp[];
}
export interface BalanceGod { nom: string; titre: string; phrase: string; benedictions: Record<string, BalanceBoon> }

export interface BalanceCard {
  nom: string; classe: string; type: CardType; cout: number; rarete: Rarity;
  effets: Effect[]; amelioration: { cout?: number; effets: Effect[] };
  epuisee?: boolean; conservee?: boolean; innee?: boolean;
}
export interface BalanceMonster {
  nom: string; pv: [number, number]; resistances: Record<Element, number>;
  mecaniques: MonsterPower[]; actions: Record<string, { nom: string; effets: Effect[] }>; rythme: MovePattern;
  phase2?: { seuil: number; puissance: number; nom: string; rythme: MovePattern };
  divise_en?: string;
}
export interface BalanceFile {
  _aide: string[];
  classes: Record<string, { pv: number; deck_depart: Record<string, number> }>;
  passifs: BalanceTargets['passives'];
  echelle_monstres: Record<string, Record<string, { pv: number; degats: number }>>;
  cartes: Record<string, BalanceCard>;
  monstres: Record<string, BalanceMonster>;
  dieux?: Record<string, BalanceGod>;
}

const RULE_TEXT: Record<string, string> = { ...RULES, ...DOFUS_RULES, ...BOON_RULES };
const PERK_KEYS: [keyof NonNullable<BalanceBoon['avantages']>, keyof RunPerks][] = [
  ['kamas', 'kamasMul'], ['remise_marchand', 'shopDiscount'], ['cartes_en_plus', 'cardChoices'], ['resurrection', 'revive'], ['soin_zaap', 'zaapHeal'],
];

export const HELP = [
  "Fichier d'équilibrage de Dofus Slay. Modifie les nombres puis enregistre : le jeu en ligne relit ce fichier à chaque démarrage.",
  "Garde la forme JSON : guillemets doubles, virgules entre les éléments, pas de virgule après le dernier. En cas d'erreur, le jeu garde ses valeurs par défaut et l'écrit dans la console du navigateur.",
  "classes : PV de départ et deck de départ (identifiant de carte : nombre d'exemplaires). passifs : Courroux du Iop et Visée du Crâ.",
  "echelle_monstres : multiplicateurs de PV et de dégâts des monstres, par acte (1, 2, 3) et par type de salle (faible, normal, elite, boss).",
  "cartes : cout en PA, rarete (base, commune, rare), effets de la carte et de sa version améliorée (amelioration).",
  "monstres : pv [minimum, maximum] avant échelle, resistances en % (négatif = faiblesse, 100 = insensible), mecaniques, actions et rythme.",
  "Effets — damage : dégâts (amount, element : terre, feu, eau, air, neutre ; hits = nombre de coups ; bonus.per / bonus.n = +n par attaques, puissance, armure, ennemis, statuts, main, lancers, visee, epuisees ; pierce = ignore l'armure).",
  "Effets — drain : dégâts dont les PV retirés soignent. block : armure. heal : soin. draw : pioche. energy : PA. loseHp : PV perdus par le lanceur. charge : Visée du Crâ.",
  "Effets — status : statut (status : puissance, faiblesse, vulnerabilite, brulure, poison, bouclier, renvoi, erosion, esquive, etourdi ; on : self, target, all_enemies).",
  "Effets — if : effets (then) joués seulement si la condition (cond) est vraie : cible_morte, cible_blessee, cible_vulnerable, cible_empoisonnee, cible_brule, pv_bas, apres_attaque, apres_competence, premiere_carte, main_vide.",
  "Effets — grant : pouvoir (déclencheur → récompense, comme les objets). multiply, spread, detonate : poison et statuts. echo : prochaine attaque lancée deux fois. addCard : ajoute des cartes. summon : invocation (monstres).",
  "Mécaniques de monstres — carapace n, epines n, colere n every (puissance toutes les « every » attaques jouées), rage n every (toutes les « every » cartes), enroulement n, rituel n, spores n, explosion turns dmg, division, voleur n turns, gardien, regeneration n, esquive n, cameleon, sommeil turns block, plafond n, artefact n.",
  "Rythme — cycle : order = actions jouées dans l'ordre, en boucle. random : weights = poids de chaque action, maxRepeat = répétitions de suite au plus.",
  "dieux : les douze dieux (nom, titre, phrase d'accueil) et leurs six bénédictions. Chaque bénédiction peut avoir des effets de combat, des stats, des avantages de run et des effets immédiats.",
  "dieux — effets : {declencheur, recompense, quantite} (+ par_tour = déclenchements par tour au plus, une_fois = une seule fois par combat), ou {regle}. stats : pv, armure (à chaque gain d'armure), prospection, degats {terre, feu, eau, air, neutre}.",
  "dieux — avantages : kamas (0.35 = +35 % après chaque combat), remise_marchand (0.25 = −25 %), cartes_en_plus (aux récompenses), resurrection (nombre), soin_zaap (0.2 = +20 % de PV au Zaap).",
  "dieux — immediat (à la prise de la bénédiction) : heal n, healPct pct, maxHp n, loseHp n, kamas n, prosp n, upgrade n (au hasard), upgradeAll type, pick what (remove, upgrade, transform, duplicate) n, cardChoice rarity (rare, commune, toute), curse id, itemChoice rarity, relic id, chance p win lose winText loseText.",
  `Déclencheurs : ${TRIGGERS.map((t) => t.id).join(', ')}.`,
  `Récompenses : ${REWARDS.map((r) => r.id).join(', ')}.`,
  `Règles : ${Object.keys(RULE_TEXT).join(', ')}.`,
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const TIERS = ['faible', 'normal', 'elite', 'boss'];

/** Valeurs actuelles des données → contenu du fichier. */
export function exportBalance(t: BalanceTargets, cards: CardDef[], monsters: MonsterDef[]): BalanceFile {
  const out: BalanceFile = { _aide: HELP, classes: {}, passifs: clone(t.passives), echelle_monstres: {}, cartes: {}, monstres: {} };
  for (const cl of Object.keys(t.classHp) as ClassId[]) out.classes[cl] = { pv: t.classHp[cl]!, deck_depart: clone(t.starters[cl] ?? {}) };
  for (const act of [1, 2, 3] as const) {
    out.echelle_monstres[act] = {};
    for (const tier of TIERS) {
      const sc = t.scale[act][tier];
      out.echelle_monstres[act][tier] = { pv: sc.hp, degats: sc.damage };
    }
  }
  for (const c of cards) {
    if (c.token || c.status) continue;
    const card: BalanceCard = {
      nom: c.name, classe: c.classe, type: c.type, cout: c.cost, rarete: c.rarity,
      effets: clone(c.effects), amelioration: { effets: clone(c.upgrade?.effects ?? c.effects) },
    };
    if (c.upgrade?.cost !== undefined) card.amelioration = { cout: c.upgrade.cost, effets: card.amelioration.effets };
    if (c.exhaust) card.epuisee = true;
    if (c.retain) card.conservee = true;
    if (c.innate) card.innee = true;
    out.cartes[c.id] = card;
  }
  for (const m of monsters) {
    const mon: BalanceMonster = {
      nom: m.name, pv: [...m.hp] as [number, number], resistances: clone(m.res), mecaniques: clone(m.powers ?? []),
      actions: Object.fromEntries(Object.entries(m.moves).map(([id, mv]) => [id, { nom: mv.name, effets: clone(mv.effects) }])),
      rythme: clone(m.pattern),
    };
    if (m.phase2) mon.phase2 = { seuil: m.phase2.at, puissance: m.phase2.puissance, nom: m.phase2.name, rythme: clone(m.phase2.pattern) };
    if (m.splitInto) mon.divise_en = m.splitInto;
    out.monstres[m.id] = mon;
  }
  out.dieux = exportGods(t.gods);
  return out;
}

function boonFx(fx: ItemEffect[]): BalanceBoonFx[] {
  return fx.flatMap((e): BalanceBoonFx[] => e.kind === 'rule' ? [{ regle: e.rule }] : e.parts.map((p) => {
    const o: BalanceBoonFx = { declencheur: p.trigger, recompense: p.reward, quantite: p.amount };
    if (p.limit !== undefined) o.par_tour = p.limit;
    if (p.once) o.une_fois = true;
    return o;
  }));
}

export function exportGods(gods: GodDef[]): Record<string, BalanceGod> {
  return Object.fromEntries(gods.map((g) => [g.id, {
    nom: g.name, titre: g.title, phrase: g.greeting,
    benedictions: Object.fromEntries(g.boons.map((b) => {
      const o: BalanceBoon = { nom: b.name };
      if (b.effects?.length) o.effets = boonFx(b.effects);
      if (b.stats && Object.keys(b.stats).length) o.stats = { ...(b.stats.pv ? { pv: b.stats.pv } : {}), ...(b.stats.armure ? { armure: b.stats.armure } : {}), ...(b.stats.prospection ? { prospection: b.stats.prospection } : {}), ...(b.stats.dom ? { degats: clone(b.stats.dom) } : {}) };
      if (b.perks && Object.keys(b.perks).length) o.avantages = Object.fromEntries(PERK_KEYS.filter(([, k]) => b.perks![k]).map(([fr, k]) => [fr, b.perks![k]]));
      if (b.now?.length) o.immediat = clone(b.now);
      return [b.id, o];
    })),
  }]));
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isEffects = (v: unknown): v is Effect[] => Array.isArray(v) && v.every((e) => e && typeof e === 'object' && typeof (e as Effect).type === 'string');
const isPattern = (v: unknown, moves: Record<string, unknown>): v is MovePattern => {
  const p = v as MovePattern;
  if (!p || typeof p !== 'object') return false;
  if (p.kind === 'cycle') return Array.isArray(p.order) && p.order.length > 0 && p.order.every((m) => m in moves);
  if (p.kind === 'random') return !!p.weights && Object.keys(p.weights).every((m) => m in moves) && isNum(p.maxRepeat);
  return false;
};

/** Applique le fichier aux données (en place). Renvoie les avertissements : chaque valeur invalide est ignorée. */
export function applyBalance(raw: unknown, t: BalanceTargets): string[] {
  const warn: string[] = [];
  const b = raw as Partial<BalanceFile>;
  if (!b || typeof b !== 'object') return ['equilibrage.json : contenu illisible'];

  for (const [cl, v] of Object.entries(b.classes ?? {})) {
    const id = cl as ClassId;
    if (!(id in t.classHp)) { warn.push(`classe inconnue : ${cl}`); continue; }
    if (isNum(v.pv) && v.pv > 0) t.classHp[id] = Math.round(v.pv); else warn.push(`${cl}.pv invalide`);
    if (v.deck_depart && typeof v.deck_depart === 'object') {
      const ok = Object.entries(v.deck_depart).every(([c, n]) => c in t.cards && isNum(n) && n >= 0);
      if (ok) t.starters[id] = { ...v.deck_depart }; else warn.push(`${cl}.deck_depart : carte inconnue ou nombre invalide`);
    }
  }
  const pa = b.passifs;
  if (pa) {
    if (isNum(pa.courroux?.attaques) && pa.courroux.attaques >= 1) t.passives.courroux.attaques = Math.round(pa.courroux.attaques);
    if (isNum(pa.courroux?.puissance)) t.passives.courroux.puissance = pa.courroux.puissance;
    if (isNum(pa.visee?.attaques) && pa.visee.attaques >= 2) t.passives.visee.attaques = Math.round(pa.visee.attaques);
    if (isNum(pa.visee?.multiplicateur) && pa.visee.multiplicateur > 0) t.passives.visee.multiplicateur = pa.visee.multiplicateur;
  }
  for (const [act, tiers] of Object.entries(b.echelle_monstres ?? {})) {
    const a = Number(act) as 1 | 2 | 3;
    if (!t.scale[a]) { warn.push(`echelle_monstres : acte ${act} inconnu`); continue; }
    for (const [tier, v] of Object.entries(tiers)) {
      const sc = t.scale[a][tier];
      if (!sc) { warn.push(`echelle_monstres.${act} : salle ${tier} inconnue`); continue; }
      if (isNum(v.pv) && v.pv > 0) sc.hp = v.pv; else warn.push(`echelle_monstres.${act}.${tier}.pv invalide`);
      if (isNum(v.degats) && v.degats >= 0) sc.damage = v.degats; else warn.push(`echelle_monstres.${act}.${tier}.degats invalide`);
    }
  }
  for (const [id, v] of Object.entries(b.cartes ?? {})) {
    const c = t.cards[id];
    if (!c) { warn.push(`carte inconnue : ${id}`); continue; }
    if (typeof v.nom === 'string' && v.nom) c.name = v.nom;
    if (isNum(v.cout) && v.cout >= 0) c.cost = Math.round(v.cout); else warn.push(`${id}.cout invalide`);
    if (['base', 'commune', 'rare'].includes(v.rarete)) c.rarity = v.rarete;
    if (['attaque', 'competence', 'pouvoir'].includes(v.type)) c.type = v.type;
    if (isEffects(v.effets)) c.effects = v.effets; else warn.push(`${id}.effets invalides`);
    if (v.amelioration && isEffects(v.amelioration.effets)) {
      c.upgrade = { effects: v.amelioration.effets };
      if (isNum(v.amelioration.cout)) c.upgrade.cost = Math.round(v.amelioration.cout);
    } else if (v.amelioration) warn.push(`${id}.amelioration invalide`);
    c.exhaust = !!v.epuisee || undefined;
    c.retain = !!v.conservee || undefined;
    c.innate = !!v.innee || undefined;
  }
  for (const [id, v] of Object.entries(b.monstres ?? {})) {
    const m = t.monsters[id];
    if (!m) { warn.push(`monstre inconnu : ${id}`); continue; }
    if (typeof v.nom === 'string' && v.nom) m.name = v.nom;
    if (Array.isArray(v.pv) && v.pv.length === 2 && v.pv.every(isNum) && v.pv[0] > 0 && v.pv[1] >= v.pv[0]) m.hp = [v.pv[0], v.pv[1]];
    else warn.push(`${id}.pv invalide (attendu [minimum, maximum])`);
    if (v.resistances && typeof v.resistances === 'object') {
      for (const el of ['neutre', 'terre', 'feu', 'eau', 'air'] as Element[]) {
        const r = (v.resistances as Record<string, unknown>)[el];
        if (isNum(r)) m.res[el] = Math.max(-100, Math.min(100, r)); else if (r !== undefined) warn.push(`${id}.resistances.${el} invalide`);
      }
    }
    if (Array.isArray(v.mecaniques) && v.mecaniques.every((p) => p && typeof p.kind === 'string')) m.powers = v.mecaniques.length ? v.mecaniques : undefined;
    else if (v.mecaniques !== undefined) warn.push(`${id}.mecaniques invalides`);
    let moves = m.moves;
    if (v.actions && typeof v.actions === 'object') {
      const next: Record<string, MonsterMove> = {};
      let ok = true;
      for (const [mid, mv] of Object.entries(v.actions)) {
        if (mv && typeof mv.nom === 'string' && isEffects(mv.effets)) next[mid] = { name: mv.nom, effects: mv.effets };
        else { ok = false; warn.push(`${id}.actions.${mid} invalide`); }
      }
      if (ok && Object.keys(next).length) moves = next;
    }
    if (v.rythme !== undefined && !isPattern(v.rythme, moves)) { warn.push(`${id}.rythme invalide (actions inconnues ?) : actions et rythme ignorés`); continue; }
    m.moves = moves;
    if (v.rythme) m.pattern = v.rythme;
    if (v.phase2) {
      const p = v.phase2;
      if (isNum(p.seuil) && isNum(p.puissance) && isPattern(p.rythme, m.moves)) m.phase2 = { at: p.seuil, puissance: p.puissance, name: p.nom ?? m.phase2?.name ?? 'Seconde phase', pattern: p.rythme };
      else warn.push(`${id}.phase2 invalide`);
    }
    if (v.divise_en !== undefined) {
      if (v.divise_en in t.monsters) m.splitInto = v.divise_en; else warn.push(`${id}.divise_en : monstre inconnu`);
    }
  }
  for (const [gid, gv] of Object.entries(b.dieux ?? {})) {
    const g = t.gods.find((x) => x.id === gid);
    if (!g) { warn.push(`dieu inconnu : ${gid}`); continue; }
    if (typeof gv.nom === 'string' && gv.nom) g.name = gv.nom;
    if (typeof gv.titre === 'string' && gv.titre) g.title = gv.titre;
    if (typeof gv.phrase === 'string' && gv.phrase) g.greeting = gv.phrase;
    for (const [bid, bv] of Object.entries(gv.benedictions ?? {})) {
      const boon = g.boons.find((x) => x.id === bid);
      if (!boon) { warn.push(`dieux.${gid} : bénédiction inconnue ${bid}`); continue; }
      applyBoon(boon, bv, `dieux.${gid}.${bid}`, warn);
    }
  }
  return warn;
}

const OPS: Record<string, (o: Record<string, unknown>) => boolean> = {
  heal: (o) => isNum(o.n), healPct: (o) => isNum(o.pct), maxHp: (o) => isNum(o.n), loseHp: (o) => isNum(o.n) && (o.n as number) > 0,
  kamas: (o) => isNum(o.n), prosp: (o) => isNum(o.n), upgrade: (o) => isNum(o.n) && (o.n as number) > 0,
  upgradeAll: (o) => ['attaque', 'competence', 'pouvoir'].includes(o.type as string),
  pick: (o) => ['remove', 'upgrade', 'transform', 'duplicate'].includes(o.what as string) && isNum(o.n) && (o.n as number) > 0,
  cardChoice: (o) => ['rare', 'commune', 'toute'].includes(o.rarity as string),
  curse: (o) => ['malediction_doute', 'malediction_honte', 'malediction_fardeau'].includes(o.id as string),
  itemChoice: (o) => ['commun', 'rare', 'mythique', 'legendaire'].includes(o.rarity as string),
  relic: (o) => o.id === undefined || typeof o.id === 'string',
  chance: (o) => isNum(o.p) && isOps(o.win) && isOps(o.lose),
  fight: (o) => ['normal', 'elite'].includes(o.tier as string) && (o.then === undefined || isOps(o.then)),
};
function isOps(v: unknown): v is RunOp[] {
  return Array.isArray(v) && v.every((o) => o && typeof o === 'object' && OPS[(o as { op: string }).op]?.(o as Record<string, unknown>));
}

/** Une bénédiction du fichier → la bénédiction du jeu. Chaque partie invalide est ignorée (l'ancienne valeur reste). */
function applyBoon(boon: Boon, v: BalanceBoon, at: string, warn: string[]): void {
  if (typeof v.nom === 'string' && v.nom) boon.name = v.nom;
  if (v.effets !== undefined) {
    const fx: ItemEffect[] = [];
    let ok = Array.isArray(v.effets);
    for (const e of Array.isArray(v.effets) ? v.effets : []) {
      if (e && 'regle' in e) {
        if (e.regle in RULE_TEXT) fx.push({ kind: 'rule', rule: e.regle as RuleId });
        else { ok = false; warn.push(`${at}.effets : règle inconnue ${e.regle}`); }
      } else if (e && TRIGGER_BY_ID[e.declencheur] && REWARD_BY_ID[e.recompense] && isNum(e.quantite) && (e.par_tour === undefined || (isNum(e.par_tour) && e.par_tour >= 1))) {
        fx.push({ kind: 'roll', parts: [{ trigger: e.declencheur, reward: e.recompense, amount: e.quantite, ...(e.par_tour !== undefined ? { limit: Math.round(e.par_tour) } : {}), ...(e.une_fois ? { once: true } : {}) }] });
      } else { ok = false; warn.push(`${at}.effets : effet invalide (déclencheur, récompense ou quantité)`); }
    }
    if (ok) boon.effects = fx.length ? fx : undefined;
  }
  if (v.stats !== undefined) {
    const st = v.stats ?? {};
    const els = ['terre', 'feu', 'eau', 'air', 'neutre'];
    const ok = [st.pv, st.armure, st.prospection].every((x) => x === undefined || isNum(x))
      && (st.degats === undefined || Object.entries(st.degats).every(([el, n]) => els.includes(el) && isNum(n)));
    if (ok) boon.stats = { ...(st.pv ? { pv: st.pv } : {}), ...(st.armure ? { armure: st.armure } : {}), ...(st.prospection ? { prospection: st.prospection } : {}), ...(st.degats ? { dom: { ...st.degats } } : {}) };
    else warn.push(`${at}.stats invalides`);
  }
  if (v.avantages !== undefined) {
    const av = v.avantages ?? {};
    const ok = Object.entries(av).every(([k, n]) => PERK_KEYS.some(([fr]) => fr === k) && isNum(n));
    if (ok) boon.perks = Object.fromEntries(PERK_KEYS.filter(([fr]) => av[fr] !== undefined).map(([fr, k]) => [k, av[fr]]));
    else warn.push(`${at}.avantages invalides`);
  }
  if (v.immediat !== undefined) {
    if (isOps(v.immediat)) boon.now = v.immediat.length ? clone(v.immediat) : undefined;
    else warn.push(`${at}.immediat invalide`);
  }
}

/** Mise en forme lisible : un objet ou une liste tient sur une ligne s'il est court (un effet par ligne). */
export function formatBalance(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v);
  if (flat === undefined) return 'null';
  if (typeof v !== 'object' || v === null || flat.length + indent.length <= 110) return flat.replace(/":/g, '": ').replace(/,"/g, ', "').replace(/,(\d|-|\[|\{)/g, ', $1');
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + formatBalance(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${formatBalance(x, inner)}`).join(',\n')}\n${indent}}`;
}
