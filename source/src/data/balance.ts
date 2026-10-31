// Fichier d'équilibrage (equilibrage.json, à la racine du dépôt) : toutes les valeurs réglables du jeu en un endroit.
//  - Au chargement des données, le fichier s'applique par-dessus les valeurs écrites dans le code.
//  - Le jeu en ligne relit le fichier au démarrage : une modification faite sur GitHub s'applique sans reconstruire.
//  - `node tools/export-balance.ts` ajoute au fichier les cartes et monstres nouveaux, sans toucher aux valeurs existantes.
import type { CardDef, ClassId, Effect, Element, MonsterDef, MonsterMove, MonsterPower, MovePattern, Rarity, CardType } from '../core/types.ts';

type Scale = Record<1 | 2 | 3, Record<string, { hp: number; damage: number }>>;
export interface BalanceTargets {
  cards: Record<string, CardDef>;
  monsters: Record<string, MonsterDef>;
  classHp: Partial<Record<ClassId, number>>;
  starters: Partial<Record<ClassId, Record<string, number>>>;
  passives: { courroux: { attaques: number; puissance: number }; visee: { attaques: number; multiplicateur: number } };
  scale: Scale;
}

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
}

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
  return out;
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
  return warn;
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
