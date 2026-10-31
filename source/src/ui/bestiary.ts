// Bestiaire (#bestiaire) : tout le contenu du jeu en un endroit — monstres, cartes, objets, Dofus, effets.
// Pour l'instant tout est visible ; `known()` est le point d'entrée prévu pour ne montrer que ce qui a été croisé.
import { resolveCard } from '../core/combat.ts';
import { PASSIVES } from '../core/classes.ts';
import { DOFUS_RULES, EL_NAME, REWARDS, RULES, TRIGGERS, poolSize, type ItemEffect } from '../core/effects.ts';
import type { CardDef, ClassId, Effect, Element, ItemDef, MonsterDef, MonsterMove } from '../core/types.ts';
import { ELEMENTS, SLOTS } from '../core/types.ts';
import { ALL_CARDS } from '../data/cards.ts';
import { EGGS } from '../data/eggs.ts';
import { ITEMS } from '../data/items.ts';
import { LIBRARY } from '../data/library.ts';
import { ACTS, ENCOUNTERS, TIER_SCALE, type EncounterTier } from '../data/monsters.ts';
import { STATUS_CARDS } from '../data/statusCards.ts';
import { GODS } from '../data/gods.ts';
import { RELICS } from '../data/relics.ts';
import { itemIcon } from '../data/dofus.ts';
import { boonLines } from '../game/boons.ts';
import { ELEMENT_NAMES, STATUS_INFO, cardText, esc, powerInfo, statsText } from './describe.ts';

/** Outils de rendu partagés avec app.ts (cartes, objets, badges). */
export interface BxHelpers {
  asset: (p: string) => string;
  pic: (src: string | undefined, label: string, cls: string) => string;
  elIcon: (el: Element, cls?: string) => string;
  cardHtml: (def: CardDef, o?: { inst?: { uid: number; id: string; upgraded: boolean } }) => string;
  itemTile: (it: ItemDef) => string;
  /** Une partie est en cours : les objets y ont déjà leur effet tiré. */
  inRun: boolean;
  eggIcon: (id: string, cls?: string) => string;
  eggBadges: (id: string) => string;
  statusIcon: (id: string) => string;
  powerIcon: (kind: string) => string;
  passiveBadge: (classe: ClassId) => string;
  slotName: (slot: string) => string;
  rarityName: (r: string) => string;
}

type Tab = 'tout' | 'monstres' | 'cartes' | 'objets' | 'dofus' | 'dieux' | 'effets';
export const bx = {
  tab: 'monstres' as Tab,
  /** Onglet ouvert avant de lancer une recherche : on y revient quand la recherche est vidée. */
  back: 'monstres' as Tab,
  act: 0, rank: '', q: '', pick: '',
  classe: '', type: '', rarity: '', el: '', up: false,
  slot: '', irar: '',
  /** Après un choix de monstre : amener la fiche à l'écran (petits écrans). */
  scroll: false,
  /** Redonner le focus au champ de recherche au prochain rendu. */
  focus: false,
};

/** Une frappe dans la recherche : la première lettre ouvre la vue « Tout ». */
export function bestiarySearch(q: string): void {
  const was = terms().length > 0;
  bx.q = q;
  const now = terms().length > 0;
  if (now && !was && bx.tab !== 'tout') { bx.back = bx.tab; bx.tab = 'tout'; }
}

/** Ce que le joueur a déjà rencontré. Tout est accessible pour l'instant. */
const known = (_kind: 'monstre' | 'carte' | 'objet' | 'dofus', _id: string) => true;

// ───────────── recherche ─────────────
// Sans accents ni casse, mot par mot : « feu crâ » trouve les sorts Crâ qui parlent de feu.
// On cherche dans le nom ET dans les textes (actions, mécaniques, effets des sorts, stats des objets).
const norm = (s: string) => s.replace(/<[^>]*>/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const terms = () => norm(bx.q).split(/[\s,;:]+/).filter(Boolean);
/** Mot court (3 lettres ou moins) : seulement en début de mot, pour que « cra » ne trouve pas « écrasement ». */
const wordStart = (w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const has = (h: string, w: string) => (w.length > 3 ? h.includes(w) : wordStart(w).test(h));
const hit = (hay: string) => { const t = terms(); if (!t.length) return true; const h = norm(hay); return t.every((w) => has(h, w)); };
const match = hit;
/** Le nom contient-il toute la recherche ? Sert à classer ces résultats en premier. */
const named = (name: string) => { const t = terms(); const n = norm(name); return t.every((w) => has(n, w)); };
const byName = <T>(list: T[], name: (x: T) => string) => [...list].sort((a, b) => Number(named(name(b))) - Number(named(name(a))));


// ───────────── index des monstres ─────────────

const RANK_ORDER: EncounterTier[] = ['boss', 'elite', 'normal', 'faible'];
const RANK_NAME: Record<string, string> = { boss: 'Boss', escorte: 'Escorte', elite: 'Élite', normal: 'Normal', faible: 'Faible', invocation: 'Invocation' };

interface Seen { act: 1 | 2 | 3; tier: EncounterTier; monsters: string[] }
interface MonsterEntry {
  def: MonsterDef;
  act: 1 | 2 | 3;
  rank: EncounterTier | 'escorte' | 'invocation';
  /** Palier dont on affiche les valeurs en jeu. */
  scale: { hp: number; damage: number };
  seen: Seen[];
  summonedBy: string[];
  splitFrom: string[];
}

let INDEX: MonsterEntry[] | null = null;
function index(): MonsterEntry[] {
  if (INDEX) return INDEX;
  const seen: Record<string, Seen[]> = {};
  for (const e of Object.values(ENCOUNTERS)) for (const id of new Set(e.monsters)) (seen[id] ??= []).push({ act: e.act, tier: e.tier, monsters: e.monsters });
  const summonedBy: Record<string, string[]> = {}, splitFrom: Record<string, string[]> = {};
  for (const m of Object.values(LIBRARY.monsters)) {
    if (m.splitInto) (splitFrom[m.splitInto] ??= []).push(m.id);
    for (const mv of Object.values(m.moves)) for (const fx of mv.effects) if (fx.type === 'summon') {
      const l = (summonedBy[fx.monster] ??= []);
      if (!l.includes(m.id)) l.push(m.id);
    }
  }
  const out: MonsterEntry[] = [];
  const pending: MonsterDef[] = [];
  for (const def of Object.values(LIBRARY.monsters)) {
    const s = (seen[def.id] ?? []).sort((a, b) => a.act - b.act || RANK_ORDER.indexOf(a.tier) - RANK_ORDER.indexOf(b.tier));
    if (!s.length) { pending.push(def); continue; }
    // Rang : boss s'il en est un ; sinon le palier le plus bas où on le croise (un Bouftou reste « normal » même
    // s'il escorte un élite) ; « escorte » s'il n'apparaît qu'aux côtés d'un boss.
    const pool = def.boss ? s.filter((x) => x.tier === 'boss') : s;
    const main = pool.reduce((best, x) => (RANK_ORDER.indexOf(x.tier) > RANK_ORDER.indexOf(best.tier) ? x : best), pool[0]);
    const rank = !def.boss && main.tier === 'boss' ? 'escorte' : main.tier;
    out.push({ def, act: main.act, rank, scale: TIER_SCALE[main.act][main.tier], seen: s, summonedBy: summonedBy[def.id] ?? [], splitFrom: splitFrom[def.id] ?? [] });
  }
  // Invocations et rejetons : acte et palier de celui qui les fait apparaître.
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    for (const def of [...pending]) {
      const parents = [...(summonedBy[def.id] ?? []), ...(splitFrom[def.id] ?? [])];
      const p = out.find((x) => parents.includes(x.def.id));
      if (!p) continue;
      out.push({ def, act: p.act, rank: 'invocation', scale: p.scale, seen: [], summonedBy: summonedBy[def.id] ?? [], splitFrom: splitFrom[def.id] ?? [] });
      pending.splice(pending.indexOf(def), 1);
    }
  }
  const rankKey = (r: MonsterEntry['rank']) => (r === 'escorte' ? 0.5 : r === 'invocation' ? 4 : RANK_ORDER.indexOf(r));
  out.sort((a, b) => a.act - b.act || rankKey(a.rank) - rankKey(b.rank) || a.def.name.localeCompare(b.def.name, 'fr'));
  INDEX = out;
  return out;
}

const scaledHp = (e: MonsterEntry) => e.def.hp.map((h) => Math.max(1, Math.round(h * e.scale.hp)));
const dmg = (n: number, e: MonsterEntry) => Math.round(n * e.scale.damage);
const monsterName = (id: string) => LIBRARY.monsters[id]?.name ?? id;
const PILE: Record<string, string> = { discard: 'ta défausse', draw: 'ta pioche', hand: 'ta main' };

function moveText(mv: MonsterMove, e: MonsterEntry): string {
  return mv.effects.map((fx: Effect) => {
    switch (fx.type) {
      case 'damage': {
        const el = fx.element === 'neutre' ? 'neutres' : EL_NAME[fx.element];
        return `inflige <b>${dmg(fx.amount, e)}</b>${fx.hits && fx.hits > 1 ? `×${fx.hits}` : ''} dégâts ${el}`;
      }
      case 'drain': return `vole <b>${dmg(fx.amount, e)}</b> PV`;
      case 'block': return `gagne <b>${fx.amount}</b> armure`;
      case 'heal': return `se soigne de <b>${fx.amount}</b>`;
      case 'status': return `${fx.on === 'self' ? 'gagne' : fx.on === 'all_enemies' ? 'donne à ses alliés' : "t'applique"} <b>${fx.amount}</b> ${STATUS_INFO[fx.status].name.toLowerCase()}`;
      case 'summon': return `invoque ${fx.count && fx.count > 1 ? `${fx.count} ` : ''}${esc(monsterName(fx.monster))}`;
      case 'addCard': return `glisse ${fx.count} « ${esc(LIBRARY.cards[fx.card]?.name ?? fx.card)} » dans ${PILE[fx.pile]}`;
      default: return '';
    }
  }).filter(Boolean).join(', ') || 'ne fait rien';
}

function patternText(def: MonsterDef, p = def.pattern): string {
  if (p.kind === 'cycle') return `Cycle : ${p.order.map((m) => esc(def.moves[m]?.name ?? m)).join(' → ')}, puis recommence.`;
  const total = Object.values(p.weights).reduce((a, b) => a + b, 0);
  const parts = Object.entries(p.weights).map(([m, w]) => `${esc(def.moves[m]?.name ?? m)} ${Math.round((100 * w) / total)} %`).join(', ');
  return `Au hasard : ${parts}. Jamais plus de ${p.maxRepeat} fois de suite la même action.`;
}

const RANK_WORDS: Record<string, string> = { boss: 'boss', escorte: 'escorte boss', elite: 'élite', normal: 'normal', faible: 'faible', invocation: 'invocation invoqué' };
const hayCache = new Map<string, string>();
function monsterHay(e: MonsterEntry): string {
  const k = 'm:' + e.def.id;
  let h = hayCache.get(k);
  if (h === undefined) {
    const d = e.def;
    h = [d.name, RANK_WORDS[e.rank], `acte ${e.act}`, ACTS[e.act - 1].name,
      ...(d.powers ?? []).map((p) => { const i = powerInfo(p); return `${i.name} ${i.help}`; }),
      ...Object.values(d.moves).map((mv) => `${mv.name} ${moveText(mv, e)}`),
      d.phase2?.name ?? '', d.splitInto ? `division ${monsterName(d.splitInto)}` : ''].join(' ');
    hayCache.set(k, h);
  }
  return h;
}
const CLASS_WORDS: Record<string, string> = { iop: 'iop', cra: 'crâ cra', neutre: 'arme armes neutre' };
function cardHay(c: CardDef): string {
  const k = 'c:' + c.id + (bx.up ? '+' : '');
  let h = hayCache.get(k);
  if (h === undefined) {
    const def = bx.up && c.upgrade ? resolveCard(LIBRARY, { uid: 0, id: c.id, upgraded: true }) : c;
    h = [def.name, c.status ? 'statut' : CLASS_WORDS[c.classe ?? ''] ?? '', TYPE_NAMES[c.type] ?? c.type, c.element ? ELEMENT_NAMES[c.element] : '', cardText(def)].join(' ');
    hayCache.set(k, h);
  }
  return h;
}
const itemHay = (it: ItemDef, h: BxHelpers) => [it.name, h.slotName(it.slot), h.rarityName(it.rarity), ...statsText(it.stats)].join(' ');
const eggHay = (e: (typeof EGGS)[number]) => [e.name, ...e.effects.map(effectLine)].join(' ');

/** Ce que la recherche trouve dans chaque onglet. */
function counts(h: BxHelpers): Record<Exclude<Tab, 'tout'>, number> {
  return {
    monstres: index().filter((e) => hit(monsterHay(e))).length,
    cartes: [...ALL_CARDS, ...STATUS_CARDS].filter((c) => hit(cardHay(c))).length,
    objets: Object.values(ITEMS.items).filter((it) => hit(itemHay(it, h))).length,
    dofus: EGGS.filter((e) => hit(eggHay(e))).length,
    dieux: GODS.reduce((n, g) => n + g.boons.filter((b) => hit(boonHay(b, `${g.name} ${g.title}`))).length, 0) + RELICS.filter((r) => hit(boonHay(r, 'relique'))).length,
    effets: effectLines(h).filter((l) => hit(l.text)).length,
  };
}

interface EffectLine { group: string; html: string; text: string }
function effectLines(h: BxHelpers): EffectLine[] {
  const out: EffectLine[] = [];
  for (const [id, s] of Object.entries(STATUS_INFO)) out.push({ group: 'Statuts', text: `${s.name} ${s.help}`, html: `<img src="${h.statusIcon(id)}" alt="" class="bx-st-ico"><span><b>${esc(s.name)}</b> ${esc(s.help)}</span>` });
  for (const cl of Object.keys(PASSIVES) as ClassId[]) { const p = PASSIVES[cl]!; out.push({ group: 'Passifs de classe', text: `${p.name} ${cl === 'iop' ? 'Iop' : 'Crâ'} ${p.text}`, html: `${h.passiveBadge(cl)}<span><b>${esc(p.name)}</b> (${cl === 'iop' ? 'Iop' : 'Crâ'}) ${esc(p.text)}</span>` }); }
  for (const t of TRIGGERS) out.push({ group: "Déclencheurs d'objets", text: t.text, html: esc(t.text) });
  for (const r of Object.values(RULES)) out.push({ group: 'Règles légendaires', text: r, html: esc(r) });
  for (const r of Object.values(DOFUS_RULES)) out.push({ group: 'Règles des Dofus', text: r, html: esc(r) });
  return out;
}

/** Mettre en évidence les mots cherchés dans un texte déjà échappé (hors balises). */
function mark(html: string): string {
  const t = terms();
  if (!t.length) return html;
  return html.replace(/(<[^>]*>)|([^<]+)/g, (all, tag: string | undefined, text: string | undefined) => {
    if (tag || !text) return all;
    const plain = norm(text);
    const spans: [number, number][] = [];
    for (const w of t) for (let i = plain.indexOf(w); i >= 0; i = plain.indexOf(w, i + w.length)) if (w.length > 3 || i === 0 || !/[a-z0-9]/.test(plain[i - 1])) spans.push([i, i + w.length]);
    if (!spans.length) return text;
    spans.sort((a, b) => a[0] - b[0]);
    let res = '', at = 0;
    for (const [a, b] of spans) { if (a < at) continue; res += text.slice(at, a) + `<mark>${text.slice(a, b)}</mark>`; at = b; }
    return res + text.slice(at);
  });
}

// ───────────── vues ─────────────

function chips(key: keyof typeof bx, options: [string | number, string][]): string {
  return `<span class="bx-chips" role="group">${options.map(([v, label]) => {
    const on = String(bx[key]) === String(v);
    return `<button class="bx-chip${on ? ' on' : ''}" aria-pressed="${on}" data-act="bx-set" data-k="${key}" data-v="${v}">${label}</button>`;
  }).join('')}</span>`;
}

function viewMonsters(h: BxHelpers): string {
  const list = index().filter((e) => known('monstre', e.def.id) && (!bx.act || e.act === bx.act) && (!bx.rank || e.rank === bx.rank) && hit(monsterHay(e)));
  const pick = list.find((e) => e.def.id === bx.pick) ?? list[0];
  const filters = `<div class="bx-filters">
    ${chips('act', [[0, 'Tous les actes'], ...ACTS.map((a): [number, string] => [a.act, `Acte ${a.act}`])])}
    ${chips('rank', [['', 'Tous'], ['boss', 'Boss'], ['escorte', 'Escortes'], ['elite', 'Élites'], ['normal', 'Normaux'], ['faible', 'Faibles'], ['invocation', 'Invocations']])}
  </div>`;
  let groups = '';
  for (const a of ACTS) {
    const inAct = list.filter((e) => e.act === a.act);
    if (!inAct.length) continue;
    groups += `<h3 class="bx-group">Acte ${a.act}, ${esc(a.name)} <span class="muted">${inAct.length}</span></h3><div class="bx-mgrid">${inAct.map((e) => {
      const hp = scaledHp(e);
      return `<button class="bx-mtile r-${e.rank}${e === pick ? ' on' : ''}" data-act="bx-pick" data-id="${e.def.id}" aria-pressed="${e === pick}">
        ${h.pic(e.def.image, e.def.name, 'bx-mpic')}
        <span class="bx-mname">${esc(e.def.name)}</span>
        <span class="bx-mmeta"><span class="bx-rank">${RANK_NAME[e.rank]}</span>${hp[0] === hp[1] ? hp[0] : `${hp[0]}–${hp[1]}`} PV</span>
      </button>`;
    }).join('')}</div>`;
  }
  return `${filters}<div class="bx-split"><div class="bx-list">${groups || '<p class="muted">Aucun monstre ne correspond.</p>'}</div>
    <aside class="bx-detail">${pick ? monsterDetail(pick, h) : ''}</aside></div>`;
}

function monsterDetail(e: MonsterEntry, h: BxHelpers): string {
  const d = e.def;
  const hp = scaledHp(e);

  const powers = (d.powers ?? []).map((p) => {
    const info = powerInfo(p);
    return `<li><img src="${h.powerIcon(p.kind)}" alt="" class="bx-pow-ico"><span><b>${esc(info.name)}</b> ${esc(info.help)}</span></li>`;
  }).join('');
  const moves = Object.entries(d.moves).map(([, mv]) => `<li><b>${esc(mv.name)}</b> : ${moveText(mv, e)}.</li>`).join('');
  const p2 = d.phase2;
  const where = e.seen.map((s) => {
    const group = Object.entries(s.monsters.reduce<Record<string, number>>((acc, id) => ((acc[id] = (acc[id] ?? 0) + 1), acc), {}))
      .map(([id, n]) => `${id === d.id ? `<b>${esc(monsterName(id))}</b>` : esc(monsterName(id))}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    return `<li><span class="bx-rank r-${s.tier}">${RANK_NAME[s.tier]}</span> Acte ${s.act} : ${group}</li>`;
  });
  for (const id of e.summonedBy) where.push(`<li>Invoqué par <b>${esc(monsterName(id))}</b></li>`);
  for (const id of e.splitFrom) where.push(`<li>Naît de la division de <b>${esc(monsterName(id))}</b></li>`);
  return `<div class="bx-dhead">${h.pic(d.image, d.name, 'bx-dpic')}
      <div><h2>${esc(d.name)}</h2>
      <p class="bx-sub"><span class="bx-rank r-${e.rank}">${RANK_NAME[e.rank]}</span> Acte ${e.act}, ${esc(ACTS[e.act - 1].name)}${d.level ? ` · niveau Dofus ${d.level[0]}${d.level[1] !== d.level[0] ? `–${d.level[1]}` : ''}` : ''}</p></div></div>
    <dl class="bx-stats">
      <div><dt>Points de vie</dt><dd>${hp[0] === hp[1] ? hp[0] : `${hp[0]} à ${hp[1]}`}</dd></div>
      ${d.boss ? '<div><dt>Étourdi</dt><dd>2 cumuls pour lui faire sauter une action</dd></div>' : ''}
    </dl>
    <h3>Résistances</h3><p class="bx-affs">${(['neutre', ...ELEMENTS] as Element[]).map((el) => { const v = d.res[el] ?? 0; return `<span class="bx-aff${v < 0 ? ' weak' : v >= 25 ? ' strong' : ''}">${h.elIcon(el, 'el-mini')}${ELEMENT_NAMES[el]} <b>${v < 0 ? '−' : ''}${Math.abs(v)} %</b></span>`; }).join('')}</p>
    ${powers ? `<h3>Mécaniques</h3><ul class="bx-pow">${powers}</ul>` : ''}
    ${d.splitInto ? `<p class="bx-note">À la moitié de ses PV, se divise en deux ${esc(monsterName(d.splitInto))}.</p>` : ''}
    <h3>Actions</h3><ul class="bx-moves">${moves}</ul>
    <p class="bx-note">${patternText(d)}</p>
    ${p2 ? `<h3>${esc(p2.name)}</h3><p class="bx-note">Sous ${Math.round(p2.at * 100)} % de ses PV, il gagne ${p2.puissance} puissance et change de rythme. ${patternText(d, p2.pattern)}</p>` : ''}
    <h3>Où le croiser</h3><ul class="bx-where">${where.join('')}</ul>
    <p class="bx-fine">PV et dégâts tels qu'en jeu dans ${e.rank === 'invocation' ? "le combat de qui l'invoque" : e.rank === 'escorte' ? 'le combat de boss' : `un combat ${RANK_NAME[e.rank].toLowerCase()}`}, acte ${e.act}. Ils varient un peu selon le palier.</p>`;
}

const TYPE_NAMES: Record<string, string> = { attaque: 'Attaques', competence: 'Compétences', pouvoir: 'Pouvoirs' };
const CARD_RARITY: Record<string, string> = { base: 'Base', commune: 'Commune', rare: 'Rare' };

function viewCards(h: BxHelpers): string {
  const all = [...ALL_CARDS, ...STATUS_CARDS];
  const list = all.filter((c) => known('carte', c.id)
    && (!bx.classe || (bx.classe === 'statut' ? !!c.status : c.classe === bx.classe && !c.status))
    && (!bx.type || c.type === bx.type) && (!bx.rarity || c.rarity === bx.rarity) && (!bx.el || c.element === bx.el) && hit(cardHay(c)));
  const filters = `<div class="bx-filters">
    ${chips('classe', [['', 'Toutes'], ['iop', 'Iop'], ['cra', 'Crâ'], ['neutre', 'Armes'], ['statut', 'Statut']])}
    ${chips('type', [['', 'Tous types'], ...Object.entries(TYPE_NAMES)])}
    ${chips('rarity', [['', 'Toutes raretés'], ...Object.entries(CARD_RARITY)])}
    ${chips('el', [['', 'Tous éléments'], ...ELEMENTS.map((el): [string, string] => [el, ELEMENT_NAMES[el]])])}
    <button class="bx-chip${bx.up ? ' on' : ''}" aria-pressed="${bx.up}" data-act="bx-up">Version améliorée</button>
  </div>`;
  const sections = (['iop', 'cra', 'neutre'] as const).map((cl) => {
    const cards = list.filter((c) => c.classe === cl && !c.status);
    if (!cards.length) return '';
    const title = cl === 'neutre' ? 'Armes, toutes classes' : cl === 'iop' ? 'Iop' : 'Crâ';
    const passive = cl !== 'neutre' && PASSIVES[cl] ? `<p class="bx-passive">${h.passiveBadge(cl)}<span><b>${esc(PASSIVES[cl]!.name)}</b>, passif de classe : ${esc(PASSIVES[cl]!.text)}</span></p>` : '';
    return `<h3 class="bx-group">${title} <span class="muted">${cards.length}</span></h3>${passive}<div class="bx-cgrid">${cards.map((c) => cardOf(c, h)).join('')}</div>`;
  }).join('');
  const status = list.filter((c) => c.status);
  const st = status.length ? `<h3 class="bx-group">Cartes de statut <span class="muted">${status.length}</span></h3><p class="bx-note">Glissées dans ton deck par certains monstres, pour le combat en cours.</p><div class="bx-cgrid">${status.map((c) => cardOf(c, h)).join('')}</div>` : '';
  return `${filters}${sections}${st}${!list.length ? '<p class="muted">Aucune carte ne correspond.</p>' : ''}`;
}

function cardOf(c: CardDef, h: BxHelpers): string {
  const inst = { uid: 0, id: c.id, upgraded: bx.up && !!c.upgrade };
  const def = inst.upgraded ? resolveCard(LIBRARY, inst) : c;
  return `<div class="bx-card">${h.cardHtml(def, { inst })}</div>`;
}

function viewItems(h: BxHelpers): string {
  const items = Object.values(ITEMS.items).filter((it) => known('objet', it.id) && (!bx.slot || it.slot === bx.slot) && (!bx.irar || it.rarity === bx.irar) && hit(itemHay(it, h)));
  const size = poolSize();
  const filters = `<div class="bx-filters">
    ${chips('slot', [['', 'Tous emplacements'], ...SLOTS.map((s): [string, string] => [s, h.slotName(s)])])}
    ${chips('irar', [['', 'Toutes raretés'], ...['commun', 'rare', 'mythique', 'legendaire'].map((r): [string, string] => [r, h.rarityName(r)])])}
  </div>`;
  const intro = `<p class="bx-lead">Chaque objet donne une stat fixe. Son effet, lui, est tiré au sort au début de chaque run selon sa rareté :
    ${size.commun} effets communs possibles, ${size.rare} rares, ${size.mythique} combinaisons mythiques et ${size.legendaire} règles légendaires.
    ${h.inRun ? "Pour la partie en cours, chaque objet montre l'effet qu'il a reçu." : ''} Le détail des déclencheurs et des récompenses est dans l'onglet Effets.</p>`;
  const bySlot = SLOTS.map((s) => {
    const its = items.filter((it) => it.slot === s).sort((a, b) => ['commun', 'rare', 'mythique', 'legendaire'].indexOf(a.rarity) - ['commun', 'rare', 'mythique', 'legendaire'].indexOf(b.rarity) || (a.level ?? 0) - (b.level ?? 0));
    if (!its.length) return '';
    return `<h3 class="bx-group">${h.slotName(s)} <span class="muted">${its.length}</span></h3><div class="bx-igrid">${its.map((it) => h.itemTile(it)).join('')}</div>`;
  }).join('');
  return `${filters}${intro}${bySlot || '<p class="muted">Aucun objet ne correspond.</p>'}`;
}

function viewEggs(h: BxHelpers): string {
  const eggs = EGGS.filter((e) => known('dofus', e.id) && hit(eggHay(e)));
  return `<p class="bx-lead">Après les boss des actes 1 et 2, tu choisis un Dofus parmi trois. Ses effets durent toute la run.</p>
    <div class="bx-eggs">${eggs.map((e) => `<div class="bx-egg">${h.eggIcon(e.id, 'bx-egg-ico')}<div><b>${esc(e.name)}</b>${h.eggBadges(e.id)}
      <span class="bx-eggtxt">${e.effects.map(effectLine).map((t) => `<span>${esc(t)}</span>`).join('')}</span></div></div>`).join('')}</div>`;
}

function effectLine(fx: ItemEffect): string {
  if (fx.kind === 'rule') return (RULES as Record<string, string>)[fx.rule] ?? (DOFUS_RULES as Record<string, string>)[fx.rule] ?? fx.rule;
  const t = TRIGGERS.find((x) => x.id === fx.parts[0].trigger);
  return `${t?.text ?? ''} : ${fx.parts.map((p) => REWARDS.find((r) => r.id === p.reward)!.text(p.amount, t!)).join(' et ')}.`;
}

const boonHay = (b: { name: string; lore?: string }, extra = '') => [b.name, extra, b.lore ?? '', ...boonLines(b as never)].join(' ');

function viewGods(h: BxHelpers): string {
  const gods = GODS.map((g) => {
    const boons = g.boons.filter((b) => hit(boonHay(b, `${g.name} ${g.title}`)));
    if (!boons.length) return '';
    return `<section class="bx-god" style="--god:${g.color}"><h3 class="bx-group"><img src="${h.asset(`classes/${g.breed}.png`)}" alt="" class="bx-god-ico">${esc(g.name)}, ${esc(g.title)}</h3>
      <ul class="bx-boons">${boons.map((b) => `<li><b>${mark(esc(b.name))}</b> ${boonLines(b).map((l) => mark(esc(l))).join(' ')}</li>`).join('')}</ul></section>`;
  }).join('');
  const relics = RELICS.filter((r) => hit(boonHay(r, 'relique'))).map((r) => `<li><img src="${r.iconId ? itemIcon(r.iconId) : h.asset(`fx/${r.fx}.webp`)}" alt="" class="bx-relic-ico" onerror="this.style.visibility='hidden'">
      <span><b>${mark(esc(r.name))}</b> ${boonLines(r).map((l) => mark(esc(l))).join(' ')}<i>${esc(r.lore ?? '')}</i></span></li>`).join('');
  return `<p class="bx-lead">Au début de chaque acte, un des douze dieux apparaît et propose trois de ses six bénédictions. Les reliques, elles, se trouvent dans les événements (cases « ? ») : légendaires, elles ne prennent aucun emplacement.</p>
    <div class="bx-gods">${gods}</div>
    ${relics ? `<h3 class="bx-group">Reliques <span class="muted">${RELICS.length}</span></h3><ul class="bx-relics">${relics}</ul>` : ''}`;
}

function viewEffects(h: BxHelpers): string {
  const statuses = Object.entries(STATUS_INFO).filter(([, s]) => hit(`${s.name} ${s.help}`)).map(([id, s]) => `<li><img src="${h.statusIcon(id)}" alt="" class="bx-st-ico"><span><b>${esc(s.name)}</b> ${esc(s.help)}</span></li>`).join('');
  const passives = (Object.keys(PASSIVES) as ClassId[]).filter((cl) => hit(`${PASSIVES[cl]!.name} ${cl} ${PASSIVES[cl]!.text}`)).map((cl) => `<li>${h.passiveBadge(cl)}<span><b>${esc(PASSIVES[cl]!.name)}</b> (${cl === 'iop' ? 'Iop' : 'Crâ'}) ${esc(PASSIVES[cl]!.text)}</span></li>`).join('');
  const triggers = TRIGGERS.filter((t) => match(t.text)).map((t) => `<li>${esc(t.text)}${t.el ? '' : ''}</li>`).join('');
  const rewards = REWARDS.filter((r) => r.id !== 'visee').map((r) => {
    const t = TRIGGERS.find((x) => x.kind === 'card') ?? TRIGGERS[0];
    return `<li>${esc(r.text(1, t).replace(/^./, (c) => c.toUpperCase()))}${r.max ? ` <span class="muted">(jusqu'à ${r.max})</span>` : ''}</li>`;
  }).join('');
  const rules = Object.values(RULES).filter(match).map((r) => `<li>${esc(r)}</li>`).join('');
  const drules = Object.values(DOFUS_RULES).filter(match).map((r) => `<li>${esc(r)}</li>`).join('');
  return `<div class="bx-cols">
    <section><h3 class="bx-group">Statuts</h3><ul class="bx-st">${statuses}</ul>
      <h3 class="bx-group">Passifs de classe</h3><ul class="bx-st">${passives}</ul></section>
    <section><h3 class="bx-group">Effets d'objets</h3>
      <p class="bx-note">Un effet = un déclencheur et une ou deux récompenses (mythique). La quantité dépend de la rareté et de la fréquence du déclencheur. Un même objet se déclenche au plus 3 fois par tour, une seule fois pour la pioche, les PA et les réductions de coût.</p>
      <h4>Déclencheurs <span class="muted">${TRIGGERS.length}</span></h4><ul class="bx-plain">${triggers}</ul>
      <h4>Récompenses <span class="muted">${REWARDS.length - 1}</span></h4><ul class="bx-plain">${rewards}</ul></section>
    <section><h3 class="bx-group">Règles légendaires <span class="muted">${Object.keys(RULES).length}</span></h3><ul class="bx-plain">${rules}</ul>
      <h3 class="bx-group">Règles des Dofus</h3><ul class="bx-plain">${drules}</ul></section>
  </div>`;
}

const TABS: [Exclude<Tab, 'tout'>, string, () => number][] = [
  ['monstres', 'Monstres', () => index().length],
  ['cartes', 'Cartes', () => ALL_CARDS.length + STATUS_CARDS.length],
  ['objets', 'Objets', () => Object.keys(ITEMS.items).length],
  ['dofus', 'Dofus', () => EGGS.length],
  ['dieux', 'Dieux et reliques', () => GODS.length * 6 + RELICS.length],
  ['effets', 'Effets et statuts', () => 0],
];

/** Combien de résultats montrer par catégorie dans la vue « Tout » avant de renvoyer vers l'onglet. */
const PREVIEW = { monstres: 12, cartes: 8, objets: 9, dofus: 6, dieux: 0, effets: 10 };

function more(tab: Exclude<Tab, 'tout'>, shown: number, total: number, label: string): string {
  return `<h3 class="bx-group bx-hit-head">${label} <span class="muted">${total}</span>
    ${total > shown ? `<button class="bx-more" data-act="bx-tab" data-tab="${tab}">Voir les ${total}</button>` : `<button class="bx-more" data-act="bx-tab" data-tab="${tab}">Ouvrir l'onglet</button>`}</h3>`;
}

function viewAll(h: BxHelpers, n: ReturnType<typeof counts>): string {
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  if (!total) return `<div class="bx-empty"><p>Rien ne correspond à « ${esc(bx.q)} ».</p>
    <p class="muted">La recherche lit les noms et les textes : essaie un élément (« feu »), un statut (« poison »), une mécanique (« invoque ») ou une partie de nom.</p></div>`;
  let out = `<p class="bx-lead bx-found">${total} résultat${total > 1 ? 's' : ''} pour « ${esc(bx.q)} ».</p>`;
  if (n.monstres) {
    const list = byName(index().filter((e) => hit(monsterHay(e))), (e) => e.def.name);
    out += more('monstres', Math.min(list.length, PREVIEW.monstres), list.length, 'Monstres');
    out += `<div class="bx-mgrid">${list.slice(0, PREVIEW.monstres).map((e) => {
      const hp = scaledHp(e);
      const why = named(e.def.name) ? '' : `<span class="bx-why">${snippet(monsterHay(e))}</span>`;
      return `<button class="bx-mtile r-${e.rank}" data-act="bx-goto" data-id="${e.def.id}">
        ${h.pic(e.def.image, e.def.name, 'bx-mpic')}
        <span class="bx-mname">${mark(esc(e.def.name))}</span>
        <span class="bx-mmeta"><span class="bx-rank">${RANK_NAME[e.rank]}</span>${hp[0] === hp[1] ? hp[0] : `${hp[0]}–${hp[1]}`} PV</span>${why}
      </button>`;
    }).join('')}</div>`;
  }
  if (n.cartes) {
    const list = byName([...ALL_CARDS, ...STATUS_CARDS].filter((c) => hit(cardHay(c))), (c) => c.name);
    out += more('cartes', Math.min(list.length, PREVIEW.cartes), list.length, 'Cartes');
    out += `<div class="bx-cgrid">${list.slice(0, PREVIEW.cartes).map((c) => cardOf(c, h)).join('')}</div>`;
  }
  if (n.objets) {
    const list = byName(Object.values(ITEMS.items).filter((it) => hit(itemHay(it, h))), (it) => it.name);
    out += more('objets', Math.min(list.length, PREVIEW.objets), list.length, 'Objets');
    out += `<div class="bx-igrid">${list.slice(0, PREVIEW.objets).map((it) => h.itemTile(it)).join('')}</div>`;
  }
  if (n.dofus) {
    const list = EGGS.filter((e) => hit(eggHay(e)));
    out += more('dofus', list.length, list.length, 'Dofus');
    out += `<div class="bx-eggs">${list.map((e) => `<div class="bx-egg">${h.eggIcon(e.id, 'bx-egg-ico')}<div><b>${mark(esc(e.name))}</b>${h.eggBadges(e.id)}
      <span class="bx-eggtxt">${e.effects.map(effectLine).map((t) => `<span>${mark(esc(t))}</span>`).join('')}</span></div></div>`).join('')}</div>`;
  }
  if (n.dieux) {
    out += more('dieux', 0, n.dieux, 'Bénédictions et reliques');
    out += viewGods(h).replace(/^<p class="bx-lead">[\s\S]*?<\/p>/, '');
  }
  if (n.effets) {
    const list = effectLines(h).filter((l) => hit(l.text));
    out += more('effets', Math.min(list.length, PREVIEW.effets), list.length, 'Effets et règles');
    out += `<ul class="bx-st bx-hits">${list.slice(0, PREVIEW.effets).map((l) => `<li>${l.html.includes('<span>') ? mark(l.html) : `<span><span class="bx-tag">${esc(l.group)}</span> ${mark(l.html)}</span>`}</li>`).join('')}</ul>`;
  }
  return out;
}

/** Extrait du texte autour du premier mot trouvé, pour dire pourquoi un résultat sort. */
function snippet(hay: string): string {
  const plain = hay.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
  const n = norm(plain);
  const w = terms().find((t) => has(n, t));
  if (!w) return '';
  const m = w.length > 3 ? null : wordStart(w).exec(n);
  const i = m ? m.index + m[1].length : n.indexOf(w);
  const a = Math.max(0, plain.lastIndexOf(' ', Math.max(0, i - 28)));
  const b = plain.indexOf(' ', Math.min(plain.length, i + w.length + 34));
  return mark(esc(`${a > 0 ? '… ' : ''}${plain.slice(a, b < 0 ? undefined : b).trim()}${b > 0 ? ' …' : ''}`));
}

export function viewBestiary(h: BxHelpers, inRun: boolean): string {
  const searching = terms().length > 0;
  if (!searching && bx.tab === 'tout') bx.tab = bx.back;
  const n = searching ? counts(h) : null;
  const body = bx.tab === 'tout' && n ? viewAll(h, n) : bx.tab === 'monstres' ? viewMonsters(h) : bx.tab === 'cartes' ? viewCards(h) : bx.tab === 'objets' ? viewItems(h)
    : bx.tab === 'dofus' ? viewEggs(h) : bx.tab === 'dieux' ? viewGods(h) : viewEffects(h);
  const total = n ? Object.values(n).reduce((a, b) => a + b, 0) : 0;
  return `<main class="bestiary">
    <header class="bx-head">
      <div><h1 class="brand-name">Bestiaire</h1><p class="brand-sub">Monstres, sorts et reliques du Monde des Douze</p></div>
      <button class="ghost" data-act="bx-close">${inRun ? 'Reprendre la partie' : "Retour à l'accueil"}</button>
    </header>
    <form class="bx-search" role="search" onsubmit="return false">
      <label for="bx-q" class="sr-only">Rechercher dans le bestiaire</label>
      <svg class="bx-search-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
      <input id="bx-q" type="search" data-bx-q placeholder="Chercher un monstre, un sort, un objet, un effet… (ex. « poison », « feu crâ »)" value="${esc(bx.q)}" autocomplete="off" spellcheck="false" aria-describedby="bx-q-help">
      ${searching ? '<button type="button" class="bx-clear" data-act="bx-clear" aria-label="Effacer la recherche">Effacer</button>' : '<kbd class="bx-kbd" aria-hidden="true">/</kbd>'}
      <span id="bx-q-help" class="sr-only">Cherche dans les noms et les descriptions. Échap efface la recherche.</span>
    </form>
    <nav class="bx-tabs" role="tablist">
      ${searching ? `<button role="tab" aria-selected="${bx.tab === 'tout'}" class="bx-tab${bx.tab === 'tout' ? ' on' : ''}" data-act="bx-tab" data-tab="tout">Tout <span>${total}</span></button>` : ''}
      ${TABS.map(([id, label, count]) => {
        const c = n ? n[id] : count();
        return `<button role="tab" aria-selected="${bx.tab === id}" class="bx-tab${bx.tab === id ? ' on' : ''}${n && !c ? ' none' : ''}" data-act="bx-tab" data-tab="${id}">${label}${c || n ? ` <span>${c}</span>` : ''}</button>`;
      }).join('')}
    </nav>
    ${body}
  </main>`;
}

/** Clics du bestiaire. Renvoie true si l'action le concernait. */
export function bestiaryAct(act: string, d: DOMStringMap): boolean {
  switch (act) {
    case 'bx-tab': bx.tab = d.tab as Tab; if (bx.tab !== 'tout') bx.back = bx.tab; return true;
    case 'bx-goto': bx.tab = 'monstres'; bx.back = 'monstres'; bx.pick = d.id ?? ''; bx.act = 0; bx.rank = ''; bx.q = ''; bx.scroll = true; return true;
    case 'bx-clear': bx.q = ''; bx.focus = true; return true;
    case 'bx-pick': bx.pick = d.id ?? ''; bx.scroll = true; return true;
    case 'bx-up': bx.up = !bx.up; hayCache.clear(); return true;
    case 'bx-set': {
      const k = d.k as keyof typeof bx;
      const v = d.v ?? '';
      if (k === 'act') bx.act = Number(v);
      else (bx as Record<string, unknown>)[k] = v;
      return true;
    }
    default: return false;
  }
}
