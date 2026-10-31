// Interface du jeu : rendu DOM simple (re-rendu complet à chaque action) + délégation d'événements.
// Toute la logique est dans src/game/run.ts et src/core ; ce fichier ne fait qu'afficher et relayer.
import { BASE_ENERGY, resolveCard, type Combat, type Enemy } from '../core/combat.ts';
import { PASSIVE_VALUES, PASSIVES } from '../core/classes.ts';
import { EL_NAME, effectText as itemEffectText, partText, perTurn, REWARD_BY_ID, ruleText, TRIGGER_BY_ID, type EffectPart, type ItemEffect } from '../core/effects.ts';
import { lootChance, prospFactor } from '../core/offers.ts';
import type { MapNode } from '../core/map.ts';
import type { CardDef, CardInstance, ClassId, Element, ItemDef, StatusMap } from '../core/types.ts';
import { ELEMENTS, SLOTS } from '../core/types.ts';
import { DOFUS, itemIcon } from '../data/dofus.ts';
import { ITEMS } from '../data/items.ts';
import { BALANCE_TARGETS, CLASS_START_HP, LIBRARY, balanceWarnings } from '../data/library.ts';
import { applyBalance } from '../data/balance.ts';
import { ACT1_SCALE, ACTS, ENCOUNTERS } from '../data/monsters.ts';
import { EGG_BY_ID, eggImage } from '../data/eggs.ts';
import { bestiaryAct, bestiarySearch, bx, viewBestiary, type BxHelpers } from './bestiary.ts';
import { Run, ZAAP_HEAL } from '../game/run.ts';
import {
  cardText, ELEMENT_NAMES, powerInfo, esc, intentSummary, moveDetail, STATUS_INFO, statsText,
} from './describe.ts';
import { buildCharacter, defaultColors, drawAnim, type Appearance, type Character } from './scene/rt.js';
import SKINS from '../data/skins.json' with { type: 'json' };
import { BREED, STAGE, stage } from './scene/stage.ts';
import { paintBoard, paintLandscape } from './scene/paint.ts';

// ───────────── état de l'interface ─────────────

type Selecting = { kind: 'card'; index: number } | null;
type Modal = null | { kind: 'deck' } | { kind: 'upgrade' } | { kind: 'remove' } | { kind: 'pile'; pile: 'draw' | 'discard' | 'exhaust' };

const ui = {
  run: null as Run | null,
  selecting: null as Selecting,
  modal: null as Modal,
  logOpen: false,
  hit: new Set<number>(),
  playerHit: 0,
  /** Chiffres flottants à afficher au prochain rendu (par uid de monstre, -1 pour le joueur). */
  floats: new Map<number, { n: number; el: Element | 'soin' | 'armure'; text?: string }[]>(),
  /** Combat dont l'entrée du boss a déjà été jouée. */
  bossIntro: null as object | null,
  /** Animation en cours : les actions de combat attendent l'impact. */
  busy: false,
  /** Cartes jouées dont le fantôme vole déjà (pas d'envol vers la défausse). */
  flying: new Set<number>(),
  /** Fin de combat en cours de mise en scène. */
  ending: false,
  /** Monstres qui viennent d'attaquer (petit élan vers le joueur). */
  lunge: new Set<number>(),
  gender: loadGender(),
  /** Accueil : classe choisie (gardée d'une visite à l'autre) et panneau d'apparence ouvert. */
  pick: ((): 'iop' | 'cra' => { try { return localStorage.getItem('slay.pick') === 'cra' ? 'cra' : 'iop'; } catch { return 'iop'; } })(),
  lookOpen: false,
  /** Couleurs choisies à l'accueil, par classe et sexe (5 emplacements, null = d'origine). */
  colors: loadColors(),
};

function loadColors(): Record<string, (number | null)[]> {
  try { return JSON.parse(localStorage.getItem('slay.colors') ?? '{}'); } catch { return {}; }
}
function saveColors(): void {
  try { localStorage.setItem('slay.colors', JSON.stringify(ui.colors)); } catch { /* stockage indisponible */ }
}
/** Couleurs d'origine de chaque classe, lues dans son fichier d'apparence. */
const baseColors: Record<string, number[]> = {};
function loadBaseColors(id: 'iop' | 'cra', g: 'm' | 'f'): void {
  const k = `${id}${g}`;
  if (baseColors[k]) return;
  baseColors[k] = [];
  void defaultColors(BREED[id], g).then((c) => { baseColors[k] = c; if (!ui.run && location.hash !== '#bestiaire') render(); });
}
/** Peau d'accessoire d'un objet équipé (coiffe ou cape), si on la connaît. */
const skinOf = (itemId: string | undefined): number => {
  const it = itemId ? ITEMS.items[itemId] : null;
  return it?.dofusId ? (SKINS as Record<string, number>)[String(it.dofusId)] ?? 0 : 0;
};
/** Apparence du personnage d'une partie : couleurs choisies + coiffe et cape portées. */
function appearanceOf(run: Run): Appearance {
  const accs = [skinOf(run.equipment.coiffe), skinOf(run.equipment.cape)].filter((n) => n > 0);
  return { cols: ui.colors[`${run.classe}${run.gender}`] ?? [], accs };
}

function loadGender(): Record<'iop' | 'cra', 'm' | 'f'> {
  try {
    const g = JSON.parse(localStorage.getItem('slay.gender') ?? '{}');
    return { iop: g.iop === 'f' ? 'f' : 'm', cra: g.cra === 'f' ? 'f' : 'm' };
  } catch { return { iop: 'm', cra: 'm' }; }
}

const root = document.getElementById('app') as HTMLElement;
const asset = (p: string) => `assets/${p}`;

const SLOT_NAMES: Record<string, string> = {
  coiffe: 'Coiffe', cape: 'Cape', amulette: 'Amulette', anneau: 'Anneau', ceinture: 'Ceinture', bottes: 'Bottes',
};
const CLASS_INFO: Record<'iop' | 'cra', { pitch: string }> = {
  iop: { pitch: 'Au contact, il frappe fort et encaisse. Ses sorts couvrent les quatre éléments.' },
  cra: { pitch: 'À distance, il affaiblit, brûle et vole la vie. Moins de PV, plus de ressources.' },
};
const RARITY_NAMES: Record<string, string> = { commun: 'Commun', rare: 'Rare', mythique: 'Mythique', legendaire: 'Légendaire' };

// ───────────── petits composants ─────────────

const elIcon = (el: Element | 'multi', cls = 'el-ico') =>
  `<img class="${cls}" src="${asset(`elements/${el}.png`)}" alt="${el === 'multi' ? 'Multi' : ELEMENT_NAMES[el]}" title="${el === 'multi' ? 'Multi' : ELEMENT_NAMES[el]}">`;

function pic(src: string | undefined, label: string, cls: string): string {
  const initials = label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
  return `<span class="pic ${cls}"><span class="pic-fb" aria-hidden="true">${esc(initials)}</span>${
    src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}

function bar(value: number, max: number, cls: string, extra = '', key = ''): string {
  const pct = Math.max(0, Math.min(100, (100 * value) / Math.max(1, max)));
  return `<span class="bar ${cls}"${key ? ` data-key="${key}"` : ''}><span class="bar-fill" style="width:${pct}%"></span><span class="bar-label">${value} / ${max}${extra}</span></span>`;
}

const STATUS_ICON: Record<string, string> = {
  puissance: 'fx/puissance.webp', faiblesse: 'fx/faiblesse.webp', vulnerabilite: 'fx/vulnerabilite.webp', brulure: 'elements/feu.png',
  poison: 'fx/poison.webp', bouclier: 'fx/bouclier.webp', renvoi: 'fx/renvoi.webp', erosion: 'fx/erosion.webp',
  esquive: 'fx/esquive.webp', etourdi: 'fx/etourdi.webp',
};
/** Bons statuts (liseré doré) et mauvais (liseré rouge), vus depuis celui qui les porte. */
const GOOD_STATUS = new Set(['puissance', 'bouclier', 'renvoi', 'esquive']);

/** Statuts en icônes chiffrées, avec la même infobulle que les effets d'objets. */
function statusChips(st: StatusMap, down = false): string {
  return Object.entries(st)
    .filter(([, v]) => v && v > 0)
    .map(([id, v]) => {
      const info = STATUS_INFO[id as keyof typeof STATUS_INFO];
      return `<span class="fxb st ${GOOD_STATUS.has(id) ? 'good' : 'bad'}" tabindex="0" aria-label="${esc(`${info.name} ${v} : ${info.help}`)}">
        <span class="fxi"><img src="${asset(STATUS_ICON[id])}" alt="" draggable="false"><b>${v}</b></span>
        <span class="fxtip${down ? ' down' : ''}" role="tooltip"><b class="fxt">${esc(info.name)} ${v}</b><span class="fx-what"><span>${esc(info.help)}</span></span></span></span>`;
    })
    .join('');
}

const POWER_ICON: Record<string, string> = {
  carapace: 'fx/armure.webp', epines: 'fx/renvoi.webp', colere: 'fx/puissance.webp', enroulement: 'fx/bouclier.webp',
  rituel: 'fx/regle.webp', spores: 'fx/vulnerabilite.webp', explosion: 'fx/degats_zone.webp', division: 'fx/poison.webp',
  voleur: 'ui/kama.svg', gardien: 'fx/bouclier.webp', regeneration: 'fx/soin.webp', esquive: 'fx/esquive.webp',
  cameleon: 'fx/erosion.webp', rage: 'ui/combat.webp', sommeil: 'fx/reduction.webp', plafond: 'ui/defense.webp', artefact: 'fx/regle.webp',
};

/** Mécaniques d'un monstre : icônes à liseré violet, compteur vivant (tours avant explosion, kamas volés…). */
function powerBadges(e: Enemy, c: NonNullable<Run['combat']>): string {
  return (e.def.powers ?? []).map((p) => {
    const info = powerInfo(p);
    let n: string | number | undefined = info.n;
    let extra = '';
    if (p.kind === 'explosion' || (p.kind === 'voleur' && p.turns < 99)) {
      const left = c.countdown(e);
      n = left ?? n;
      extra = ` Encore ${left} tour${left === 1 ? '' : 's'}.`;
    }
    if (p.kind === 'voleur' && e.m.stolen) extra += ` Il a déjà volé ${e.m.stolen} kamas.`;
    if (p.kind === 'artefact') { n = e.m.artefact; extra = ` Encore ${e.m.artefact}.`; }
    if (p.kind === 'rage' || p.kind === 'colere') {
      const left = p.every - e.m.count;
      n = left;
      const what = p.kind === 'rage' ? (left > 1 ? 'cartes' : 'carte') : (left > 1 ? 'attaques' : 'attaque');
      extra = ` Encore ${left} ${what} avant son prochain gain.`;
    }
    if (p.kind === 'sommeil') { n = e.m.asleep; extra = e.m.asleep ? ` Encore ${e.m.asleep} tour${e.m.asleep > 1 ? 's' : ''} de sommeil.` : ' Réveillé.'; }
    if ((p.kind === 'division' && e.m.split) || (p.kind === 'artefact' && !e.m.artefact) || (p.kind === 'sommeil' && !e.m.asleep)) return '';
    return `<span class="fxb st power" tabindex="0" aria-label="${esc(`${info.name} : ${info.help}${extra}`)}">
      <span class="fxi"><img src="${asset(POWER_ICON[p.kind])}" alt="" draggable="false">${n !== undefined ? `<b>${n}</b>` : ''}</span>
      <span class="fxtip" role="tooltip"><b class="fxt">${esc(info.name)}</b><span class="fx-what"><span>${esc(info.help + extra)}</span></span></span></span>`;
  }).join('');
}

/** Barre de PV avec l'armure en médaillon à gauche, comme un bouclier posé sur la barre. */
function hpBar(hp: number, max: number, block: number, key = ''): string {
  const armor = block > 0 ? `<span class="armor hastip" tabindex="0" aria-label="${block} armure"><img src="${asset('fx/armure.webp')}" alt="" draggable="false"><b>${block}</b>
    <span class="fxtip" role="tooltip"><b class="fxt">Armure ${block}</b><span class="fx-what"><span>Absorbe les dégâts avant les PV. Disparaît au début du tour suivant.</span></span></span></span>` : '';
  return `<span class="hpwrap${block > 0 ? ' armored' : ''}">${armor}${bar(hp, max, 'hp', '', key)}</span>`;
}

const TYPE_NAMES = { attaque: 'Attaque', competence: 'Compétence', pouvoir: 'Pouvoir' };

function cardHtml(def: CardDef, opts: { inst?: CardInstance; act?: string; data?: string; disabled?: boolean; selected?: boolean; live?: boolean; hint?: string; cost?: number } = {}): string {
  const c = opts.live ? ui.run?.combat ?? null : null;
  const upgraded = opts.inst?.upgraded;
  const cost = opts.cost ?? def.cost;
  const attrs = opts.act ? `data-act="${opts.act}" ${opts.data ?? ''}` : '';
  const tag = opts.act ? 'button' : 'div';
  const lore = def.lore ? ` title="${esc(def.lore)}"` : '';
  return `<${tag} class="card t-${def.type} el-${def.element} rar-${def.rarity}${def.status ? ' is-status' : ''}${upgraded ? ' upg' : ''}${opts.selected ? ' sel' : ''}${opts.disabled ? ' off' : ''}" ${attrs}${opts.disabled && tag === 'button' ? ' disabled' : ''}${lore}>
    <span class="card-cost${cost < def.cost ? ' cheaper' : ''}" aria-label="${cost} PA">${cost}</span>
    <span class="card-art">${def.icon ? pic(def.icon, def.name, 'card-pic') : `<span class="pic card-pic">${uiIcon(def.type === 'attaque' ? 'combat' : def.type === 'competence' ? 'defense' : 'buff', 'card-ico')}</span>`}</span>
    <span class="card-name">${esc(def.name)}${upgraded ? '<i class="upg-mark">+</i>' : ''}</span>
    <span class="card-type">${elIcon(def.element, 'el-mini')}${TYPE_NAMES[def.type]} ${ELEMENT_NAMES[def.element]}</span>
    <span class="card-text">${cardText(def, c)}</span>
    ${opts.hint ? `<span class="card-hint">${opts.hint}</span>` : ''}
  </${tag}>`;
}

/** Dos de carte : œuf de Dofus sur trame d'Amakna, liseré or. */
function cardBack(cls = ''): string {
  return `<span class="card-back ${cls}" aria-hidden="true"><span class="cb-ring">${uiIcon('dofus', 'cb-egg')}</span></span>`;
}

// ───────────── effets d'objets en icônes ─────────────
// Une icône par récompense avec sa quantité ; le survol (ou le focus) détaille l'effet et son activation.

const FX_ICON: Record<string, string> = {
  puissance: 'fx/puissance.webp', armure: 'fx/armure.webp', bouclier: 'fx/bouclier.webp', soin: 'fx/soin.webp',
  pioche: 'fx/pioche.webp', pa: 'fx/pa.webp', reduction: 'fx/reduction.webp', esquive: 'fx/esquive.webp',
  renvoi: 'fx/renvoi.webp', brulure: 'elements/feu.png', poison: 'fx/poison.webp', vulnerabilite: 'fx/vulnerabilite.webp',
  faiblesse: 'fx/faiblesse.webp', erosion: 'fx/erosion.webp', etourdi: 'fx/etourdi.webp', brulure_zone: 'elements/feu.png',
  poison_zone: 'fx/poison.webp', degats: 'fx/degats.webp', degats_zone: 'fx/degats_zone.webp',
  prospection: 'fx/prospection.webp', prospection_run: 'fx/prospection.webp',
};
const FX_NAME: Record<string, string> = {
  puissance: 'Puissance', armure: 'Armure', bouclier: 'Bouclier', soin: 'Soin', pioche: 'Pioche', pa: 'Points d\'action',
  reduction: 'Réduction de coût', esquive: 'Esquive', renvoi: 'Renvoi de dommages', brulure: 'Brûlure', poison: 'Poison',
  vulnerabilite: 'Vulnérabilité', faiblesse: 'Faiblesse', erosion: 'Érosion', etourdi: 'Étourdi', brulure_zone: 'Brûlure de zone',
  poison_zone: 'Poison de zone', degats: 'Dégâts', degats_zone: 'Dégâts de zone', prospection: 'Prospection', prospection_run: 'Prospection durable',
};
const ZONE = new Set(['brulure_zone', 'poison_zone', 'degats_zone']);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function partIcon(p: EffectPart): string {
  const t = TRIGGER_BY_ID[p.trigger];
  const el = (p.reward === 'degats' || p.reward === 'degats_zone') && t.el ? `elements/${t.el}.png` : FX_ICON[p.reward];
  const zone = ZONE.has(p.reward) ? '<i class="fxz" aria-hidden="true"></i>' : '';
  const plus = p.reward === 'prospection_run' ? '<i class="fxp" aria-hidden="true">∞</i>' : '';
  return `<span class="fxi${ZONE.has(p.reward) ? ' zone' : ''}"><img src="${asset(el)}" alt="" draggable="false">${zone}${plus}<b>${p.amount}</b></span>`;
}

/** Badge d'effet : icônes + quantités ; infobulle avec l'effet détaillé et son activation. */
function fxBadge(fx: ItemEffect, o: { title: string; icon?: string; live?: { used: number; limit: number } | null; flash?: boolean; down?: boolean } = { title: '' }): string {
  let icons: string, what: string, when: string;
  if (fx.kind === 'rule') {
    icons = `<span class="fxi rule"><img src="${o.icon ?? asset('fx/regle.webp')}" alt="" draggable="false"></span>`;
    what = `<span>${esc(ruleText(fx.rule))}</span>`;
    when = 'En permanence.';
  } else {
    const t = TRIGGER_BY_ID[fx.parts[0].trigger];
    icons = fx.parts.map(partIcon).join('');
    what = fx.parts.map((p) => `<span><b>${FX_NAME[p.reward]}</b> : ${esc(cap(partText(p)))}.</span>`).join('');
    const repeat = !t.single && ['cardPlayed', 'enemyKilled', 'hpLost', 'blockGained'].includes(t.event);
    const lim = repeat ? ` ${[...new Set(fx.parts.map((p) => perTurn(REWARD_BY_ID[p.reward])))].map((n) => (n === 1 ? 'Une fois par tour.' : `${n} fois par tour au plus.`)).join(' ')}` : '';
    when = `${esc(t.text)}${t.el ? ` (${EL_NAME[t.el]})` : ''}.${lim}`;
  }
  const live = o.live ? `<span class="fxc${o.live.used >= o.live.limit ? ' full' : ''}" title="Déclenchements ce tour">${o.live.used}/${o.live.limit}</span>` : '';
  return `<span class="fxb${o.flash ? ' flash' : ''}${fx.kind === 'rule' ? ' is-rule' : ''}" tabindex="0" aria-label="${esc(`${o.title} : ${itemEffectText(fx)}`)}">${icons}${live}
    <span class="fxtip${o.down ? ' down' : ''}" role="tooltip">${o.title ? `<b class="fxt">${esc(o.title)}</b>` : ''}<span class="fx-what">${what}</span><span class="fx-when"><i>Activation</i> ${when}</span></span></span>`;
}

/** Passif de classe : symbole de la classe, compteur vivant en combat, détail au survol. */
function passiveBadge(classe: ClassId, o: { c?: Combat | null; flash?: boolean; down?: boolean } = {}): string {
  const p = PASSIVES[classe];
  if (!p) return '';
  const c = o.c;
  let live = '', state = '', ready = false;
  const COURROUX = PASSIVE_VALUES.courroux.attaques, VISEE = PASSIVE_VALUES.visee.attaques;
  if (c && classe === 'iop') {
    const n = Math.min(COURROUX, c.turnAttacks);
    ready = n >= COURROUX;
    live = `<span class="fxc${ready ? ' full' : ''}">${n}/${COURROUX}</span>`;
    state = ready ? 'Gagne 1 puissance à la fin du tour.' : `Attaques ce tour : ${n} sur ${COURROUX}.`;
  } else if (c && classe === 'cra') {
    ready = c.aimReady();
    live = `<span class="fxc${ready ? ' full' : ''}">${ready ? '×2' : `${c.aim}/${VISEE - 1}`}</span>`;
    state = ready ? 'Ta prochaine attaque inflige le double de dégâts.' : `Encore ${VISEE - 1 - c.aim} attaque${VISEE - 1 - c.aim > 1 ? 's' : ''} avant le tir doublé.`;
  }
  return `<span class="fxb passive${o.flash ? ' flash' : ''}${ready ? ' ready' : ''}" tabindex="0" aria-label="${esc(`${p.name} : ${p.text}`)}">
    <span class="fxi"><img src="${asset(`classes/${DOFUS.breeds[classe].id}.png`)}" alt="" draggable="false"></span>${live}
    <span class="fxtip${o.down ? ' down' : ''}" role="tooltip"><b class="fxt">${esc(p.name)}</b><span class="tip-meta">Passif de classe</span>
      <span class="fx-what"><span>${esc(p.text)}</span></span>${state ? `<span class="fx-when"><i>Maintenant</i> ${esc(state)}</span>` : ''}</span></span>`;
}

/** Pouvoirs joués ce combat : icône du sort, nombre d'exemplaires, texte de la carte au survol. */
function powerChips(c: Combat): string {
  return c.powers.map((pw) => {
    const def = LIBRARY.cards[pw.id];
    return `<span class="fxb st pw" tabindex="0" aria-label="${esc(`${pw.name} : ${stripTags(cardText(def))}`)}">
      <span class="fxi">${pic(pw.icon, pw.name, 'pw-pic')}${pw.n > 1 ? `<b>${pw.n}</b>` : ''}</span>
      <span class="fxtip" role="tooltip"><b class="fxt">${esc(pw.name)}</b><span class="tip-meta">Pouvoir</span><span class="fx-what"><span>${cardText(def)}</span></span></span></span>`;
  }).join('');
}
const stripTags = (h: string) => h.replace(/<[^>]+>/g, '');

/** Effet d'un objet pour la run en cours (tiré à la création de la run). */
function itemEffect(id: string): ItemEffect | null {
  return ui.run?.itemEffects[id] ?? null;
}

function itemTile(it: ItemDef, opts: { act?: string; taken?: boolean; dim?: boolean; fx?: ItemEffect | null; catalog?: boolean } = {}): string {
  const run = ui.run;
  const current = run?.equipment[it.slot];
  const replaces = !opts.catalog && current && current !== it.id ? ITEMS.items[current] : null;
  const fx = opts.fx !== undefined ? opts.fx : itemEffect(it.id);
  const tag = opts.act ? 'button' : 'div';
  return `<${tag} class="item rar-${it.rarity}${opts.taken ? ' taken' : ''}${opts.dim ? ' off' : ''}" ${opts.act ? `data-act="${opts.act}" data-id="${it.id}"` : ''}${opts.dim && tag === 'button' ? ' disabled' : ''}>
    <span class="item-head">${pic(it.icon, it.name, 'item-pic')}
      <span class="item-id"><span class="item-name">${esc(it.name)}</span>
      <span class="item-meta"><span class="rar-tag">${RARITY_NAMES[it.rarity]}</span> ${SLOT_NAMES[it.slot]}${it.level ? `, niveau ${it.level}` : ''}</span></span></span>
    <span class="item-stats">${statsText(it.stats).map((t) => `<span>${esc(t)}</span>`).join('')}</span>
    ${fx ? `<span class="item-fxrow">${fxBadge(fx, { title: it.name })}<span class="item-fxhint">${fx.kind === 'rule' ? 'Règle légendaire' : 'Survole pour le détail'}</span></span>` : ''}
    ${replaces ? `<span class="item-replace">Remplace ${esc(replaces.name)}</span>` : ''}
  </${tag}>`;
}

// ───────────── fiche du personnage (carte, récompense, Zaap) ─────────────

function sheet(run: Run): string {
  const breed = DOFUS.breeds[run.classe];
  const prosp = run.prospection();
  const slots = SLOTS.map((slot) => {
    const id = run.equipment[slot];
    const it = id ? ITEMS.items[id] : null;
    const fx = id ? itemEffect(id) : null;
    if (!it) return `<span class="slot empty"><span class="slot-name">${SLOT_NAMES[slot]}</span></span>`;
    return `<span class="slot rar-${it.rarity} hastip" tabindex="0" aria-label="${esc(`${it.name}, ${RARITY_NAMES[it.rarity]} : ${statsText(it.stats).join(', ')}${fx ? `. ${itemEffectText(fx)}` : ''}`)}">
      ${pic(it.icon, it.name, 'slot-pic')}
      <span class="fxtip" role="tooltip"><b class="fxt">${esc(it.name)}</b>
        <span class="tip-meta"><span class="rar-tag">${RARITY_NAMES[it.rarity]}</span> ${SLOT_NAMES[slot]}${it.level ? `, niveau ${it.level}` : ''}</span>
        <span class="item-stats">${statsText(it.stats).map((t) => `<span>${esc(t)}</span>`).join('')}</span>
        ${fx ? `<span class="fx-what"><span>${esc(itemEffectText(fx))}</span></span>` : ''}</span></span>`;
  }).join('');
  const effects = SLOTS.map((slot) => run.equipment[slot]).filter((id): id is string => !!id).map((id) => {
    const it = ITEMS.items[id];
    const fx = itemEffect(id);
    return fx ? `<li class="rar-${it.rarity}"><span class="fx-name">${esc(it.name)}</span>${fxBadge(fx, { title: it.name })}</li>` : '';
  }).join('');
  return `<aside class="sheet">
    <div class="who"><img class="who-pic" src="${asset(`classes/${breed.id}.png`)}" alt=""><span><b>${esc(breed.n)}</b><span class="muted">${run.stats.floor ? `Étage ${run.stats.floor} sur ${run.map.floors}` : 'Au départ'}</span></span></div>
    ${bar(run.hp, run.maxHp, 'hp')}
    <button class="link" data-act="modal-deck">Voir le deck (${run.deck.length} cartes)</button>
    <h3>Passif de classe</h3><p class="passive-line">${passiveBadge(run.classe)}<span><b>${esc(PASSIVES[run.classe]?.name ?? '')}</b> <span class="muted small">${esc(PASSIVES[run.classe]?.text ?? '')}</span></span></p>
    <h3>Équipement</h3><div class="slots">${slots}</div>
    ${effects ? `<ul class="fx-list">${effects}</ul><p class="muted small">Un même objet se déclenche au plus 3 fois par tour (une fois pour la pioche, les PA et les réductions de coût). Les objets se cumulent entre eux.</p>` : '<p class="muted small">Les objets se gagnent après les combats. Chacun donne une stat fixe et un effet tiré au sort pour cette run.</p>'}
    ${run.dofus.length ? `<h3>Dofus</h3><ul class="eggs">${run.dofus.map((id) => `<li>${eggIcon(id)}<span><b>${esc(EGG_BY_ID[id].name)}</b>${eggBadges(id)}</span></li>`).join('')}</ul>` : ''}
    <h3>Kamas et prospection</h3>
    <p class="prosp">${KAMAS(run.kamas)}</p>
    <p class="prosp"><b>${prosp}</b> prospection <span class="muted">:${Math.round(100 * lootChance('normal', prosp))} % de chance d'objet après un combat, raretés ×${(1 + 2 * prospFactor(prosp)).toFixed(1)}</span></p>
  </aside>`;
}

// ───────────── écrans ─────────────

const COLOR_NAMES = ['Peau', 'Cheveux', 'Tenue 1', 'Tenue 2', 'Tenue 3'];
const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
/** Couleurs du personnage : 5 pastilles (sélecteur de couleur natif) et retour aux couleurs d'origine. */
function colorRow(id: 'iop' | 'cra', g: 'm' | 'f'): string {
  loadBaseColors(id, g);
  const base = baseColors[`${id}${g}`] ?? [];
  const mine = ui.colors[`${id}${g}`] ?? [];
  const sw = COLOR_NAMES.map((name, i) => {
    const v = mine[i] ?? base[i];
    if (v == null) return '';
    return `<label class="swatch${mine[i] != null ? ' custom' : ''}" title="${name}" style="--c:${hex(v)}"><span class="sr-only">${name}</span>
      <input type="color" value="${hex(v)}" data-color="${id}" data-g="${g}" data-i="${i}"></label>`;
  }).join('');
  const custom = mine.some((v) => v != null);
  return `<div class="colors" aria-label="Couleurs du personnage">${sw}
    <button class="color-reset" data-act="color-reset" data-classe="${id}" data-g="${g}" ${custom ? '' : 'disabled'} title="Couleurs d'origine" aria-label="Revenir aux couleurs d'origine">↺</button></div>`;
}

const HERO_HUE: Record<'iop' | 'cra', string> = { iop: '#e5483b', cra: '#7dbb2e' };

function viewTitle(): string {
  const pick = ui.pick;
  const hero = (id: 'iop' | 'cra') => {
    const b = DOFUS.breeds[id];
    const on = id === pick;
    return `<button class="hero-pick h-${id}${on ? ' on' : ''}" style="--hue:${HERO_HUE[id]}" role="radio" aria-checked="${on}" data-act="pick-class" data-classe="${id}" aria-label="${esc(b.n)}, ${CLASS_START_HP[id]} PV">
      <span class="hero-stage"><span class="hero-ring" aria-hidden="true"></span><canvas class="hero-canvas" data-preview="${id}" width="600" height="600" aria-hidden="true"></canvas></span>
      <span class="hero-name">${esc(b.n)}</span>
      <span class="hero-hp">${CLASS_START_HP[id]} PV</span>
    </button>`;
  };
  const p = PASSIVES[pick]!;
  const g = ui.gender[pick];
  const radio = (v: 'm' | 'f', label: string) =>
    `<button role="radio" aria-checked="${g === v}" class="${g === v ? 'on' : ''}" data-act="gender" data-classe="${pick}" data-g="${v}">${label}</button>`;
  return `<main class="title" style="--hue:${HERO_HUE[pick]}">
    <div class="land" data-land aria-hidden="true"></div>
    <header class="logo">
      <h1 class="logo-word">Dofus Slay</h1>
      <p class="logo-sub">Un deckbuilder dans le Monde des Douze, d'Amakna aux landes de Brâkmar.</p>
    </header>
    <div class="heroes" role="radiogroup" aria-label="Choisis ta classe">${hero('iop')}${hero('cra')}</div>
    <section class="pick-info" aria-live="polite">
      <p class="pick-pitch">${CLASS_INFO[pick].pitch}</p>
      <p class="pick-passive">${passiveBadge(pick)}<span><b>${esc(p.name)}</b> : ${esc(p.text.charAt(0).toLowerCase() + p.text.slice(1))}</span></p>
      <div class="pick-actions">
        <button class="play" data-act="new-run" data-classe="${pick}">Jouer ${pick === 'iop' ? 'le Iop' : 'le Crâ'}</button>
        <button class="look-toggle" data-act="look-toggle" aria-expanded="${ui.lookOpen}">Apparence</button>
      </div>
      ${ui.lookOpen ? `<div class="look-panel">
        <div class="gender" role="radiogroup" aria-label="Apparence du personnage">${radio('m', 'Homme')}${radio('f', 'Femme')}</div>
        ${colorRow(pick, g)}
      </div>` : ''}
    </section>
    <footer class="title-foot">
      <button class="link" data-act="bestiary">Bestiaire</button>
      <span>Fan game non officiel. Données DofusDB, animations et décors de Dofus 3, univers © Ankama.</span>
      <a class="link" href="#styleguide">Guide de style</a>
    </footer>
  </main>`;
}

/** Paysage de l'accueil : peint une fois par taille d'écran, posé derrière les héros. */
const LAND_PACK = 8;
function mountLand(): void {
  const host = root.querySelector('[data-land]') as HTMLElement | null;
  if (!host) return;
  const W = Math.ceil(window.innerWidth / 160) * 160, H = Math.ceil(window.innerHeight / 120) * 120;
  const horizon = window.innerWidth < window.innerHeight ? 0.36 : 0.5;
  void paintLandscape(LAND_PACK, W, H, 17, horizon).then((c) => {
    if (!c || !host.isConnected || host.firstChild === c) return;
    host.replaceChildren(c);
    host.classList.add('on');
  });
}

// Aperçus animés de l'écran titre
const previews: Record<string, Character | null | 'loading'> = {};
const shownPreview: Record<string, Character | undefined> = {};
let previewRaf = 0;
function startPreviews(): void {
  if (previewRaf) return;
  const t0 = performance.now();
  const loop = () => {
    const canvases = [...root.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]')];
    if (!canvases.length) { previewRaf = 0; return; }
    previewRaf = requestAnimationFrame(loop);
    for (const cv of canvases) {
      const id = cv.dataset.preview as 'iop' | 'cra';
      const g = ui.gender[id];
      const cols = ui.colors[`${id}${g}`] ?? [];
      const key = `${id}${g}|${cols.join(',')}`;
      if (!(key in previews)) {
        previews[key] = 'loading';
        void buildCharacter(BREED[id], g, { cols }).then((c) => { previews[key] = c; });
      }
      // Pendant qu'une nouvelle teinte se prépare, on garde l'ancienne à l'écran.
      const got = previews[key];
      if (got && got !== 'loading') shownPreview[`${id}${g}`] = got;
      const ch: Character | null = got && got !== 'loading' ? got : shownPreview[`${id}${g}`] ?? null;
      const css = cv.clientWidth || 300;
      const dpr = Math.min(3, window.devicePixelRatio || 1), size = Math.round(css * dpr);
      if (cv.width !== size) { cv.width = size; cv.height = size; }
      const x = cv.getContext('2d')!;
      x.clearRect(0, 0, cv.width, cv.height);
      if (ch) {
        cv.parentElement!.classList.add('ready');
        drawAnim(x, ch, 'idle', (performance.now() - t0) / 1000, cv.width / 2, cv.height * 0.97, cv.height * 0.78);
      } else cv.parentElement!.classList.remove('ready');
    }
  };
  previewRaf = requestAnimationFrame(loop);
}

const NODE_LABEL: Record<MapNode['type'], string> = { combat: 'Combat', elite: 'Élite', zaap: 'Zaap', marchand: 'Marchand', boss: 'Boss' };
/** Icônes officielles de l'interface Dofus (modes de Dofusle, objets de Dofus Survivors). */
const uiIcon = (name: string, cls = 'ui-ico') => `<img class="${cls}" src="${asset(`ui/${name}.webp`)}" alt="" draggable="false">`;
const NODE_ICON: Record<MapNode['type'], string> = {
  combat: uiIcon('combat'),
  elite: uiIcon('elite'),
  zaap: uiIcon('zaap'),
  marchand: uiIcon('marchand'),
} as Record<MapNode['type'], string>;
const actName = (run: Run) => ACTS[run.act - 1].name;
/** Icône officielle de la pièce de kama (objet Dofus « Pièce de Kama géante »), repli dessiné en local. */
const KAMA_ICON = itemIcon(24920);
const kamaIco = (cls = 'k-ico') => `<img class="${cls}" src="${KAMA_ICON}" alt="" draggable="false" onerror="this.onerror=null;this.src='${asset('ui/kama.svg')}'">`;
const KAMAS = (n: number) => `<span class="kamas">${kamaIco()}${n}</span>`;
const eggIcon = (id: string, cls = 'egg-ico') => {
  const local = asset(`dofus/${EGG_BY_ID[id].icon}.webp`);
  // Icône officielle de Dofus 3 ; l'icône locale ne sert que si DofusDB est injoignable.
  return `<img class="${cls}" src="${eggImage(EGG_BY_ID[id])}" alt="" draggable="false" onerror="this.onerror=null;this.src='${local}'">`;
};
function eggBadges(id: string, o: { live?: (fxi: number) => { used: number; limit: number } | null; flash?: boolean; down?: boolean } = {}): string {
  const egg = EGG_BY_ID[id];
  const stats = statsText(egg.stats ?? {}).map((t) => `<span class="fxstat">${esc(t)}</span>`).join('');
  return `<span class="fx-badges">${stats}${egg.effects.map((fx, i) => fxBadge(fx, { title: egg.name, icon: eggImage(egg), live: o.live?.(i), flash: o.flash, down: o.down })).join('')}</span>`;
}
function eggText(id: string): string {
  const egg = EGG_BY_ID[id];
  return [...statsText(egg.stats ?? {}).map((t) => `${t}.`), ...egg.effects.map(itemEffectText)].join(' ');
}
const INTENT_ICON: Record<string, string> = { attack: 'combat', defend: 'defense', buff: 'buff', debuff: 'debuff' };
const intentIcon = (kind: string) => INTENT_ICON[kind] ? uiIcon(INTENT_ICON[kind], 'intent-ico') : '';

/** Monstres d'une rencontre, regroupés (« Tofu ×2 »). */
function encounterGroups(encId: string) {
  const counts = new Map<string, number>();
  for (const id of ENCOUNTERS[encId].monsters) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ def: LIBRARY.monsters[id], count }));
}

const hpRange = (hp: [number, number]) => {
  const [a, b] = hp.map((h) => Math.round(h * ACT1_SCALE.hp));
  return a === b ? `${a}` : `${a} à ${b}`;
};

/** Infobulle d'une case : ce qu'on y trouve et ce qu'on y gagne. */
function nodeTip(run: Run, n: MapNode): string {
  const kind = n.type === 'boss' ? 'Boss' : n.type === 'elite' ? 'Élite' : n.type === 'zaap' ? 'Zaap' : n.type === 'marchand' ? 'Marchand' : n.floor < 4 ? 'Combat facile' : 'Combat';
  let body: string;
  if (n.type === 'marchand') {
    body = `<p class="tip-text">Des cartes, des objets et le retrait d'une carte du deck, contre des kamas. Tu en as ${run.kamas}.</p>`;
  } else if (n.type === 'zaap') {
    body = `<p class="tip-text">Une halte avant de repartir. Une action au choix :</p>
      <ul class="tip-list"><li>se reposer et récupérer ${Math.round(run.maxHp * ZAAP_HEAL)} PV</li><li>améliorer une carte</li></ul>`;
  } else {
    const mobs = encounterGroups(run.encounters[n.id]).map(({ def, count }) => {
      return `<li>${pic(def.image, def.name, 'tip-pic')}
        <span class="tip-mob"><b>${esc(def.name)}${count > 1 ? ` ×${count}` : ''}</b><span>${hpRange(def.hp)} PV${def.level ? `, niveau ${def.level[0]}` : ''}</span></span>
        ${resGrid(def.res, true)}
      </li>`;
    }).join('');
    const reward = n.type === 'boss' ? (run.act < 3 ? 'Le vaincre termine l\'acte et te laisse choisir un Dofus.' : 'Le vaincre termine la run.')
      : n.type === 'elite' ? 'Récompense : une carte, plus souvent rare, et toujours un objet rare, mythique ou légendaire.'
      : `Récompense : une carte, et ${Math.round(100 * lootChance('normal', run.prospection()))} % de chance d'objet (prospection ${run.prospection()}).`;
    body = `<ul class="tip-mobs">${mobs}</ul><p class="tip-text">${reward}</p>`;
  }
  const side = n.type === 'boss' ? 'tip-below'
    : `${n.col >= 3 ? 'tip-left' : 'tip-right'}${n.floor <= 2 ? ' tip-up' : n.floor >= 11 ? ' tip-down' : ''}`;
  return `<div class="tip ${side}" role="tooltip"><p class="tip-head"><b>${kind}</b><span>Étage ${n.floor}</span></p>${body}</div>`;
}

/** Disposition de la carte d'un acte : position de chaque case, taille du plateau. */
function mapLayout(run: Run) {
  const m = run.map;
  const W = 126, H = 78, GUTTER = 74, TOP = 190, BOTTOM = 84, BOSS_Y = 72;
  const pos = (n: MapNode) => ({ x: GUTTER + n.col * W, y: n.type === 'boss' ? BOSS_Y : TOP + (m.floors - 1 - n.floor) * H });
  return { pos, width: GUTTER * 2 + (m.cols - 1) * W, height: TOP + (m.floors - 2) * H + BOTTOM, TOP, H };
}
/** Lieu peint sous la carte de chaque acte (packs de Dofus 3). */
const ACT_BOARD: Record<number, number> = { 1: 8, 2: 46, 3: 66 };

function viewMap(run: Run): string {
  const m = run.map;
  const { pos, width, height, TOP, H } = mapLayout(run);
  const avail = new Set(run.availableNodes());
  const visited = new Set(run.path);
  const step = (a: string, b: string) => run.path.indexOf(b) === run.path.indexOf(a) + 1 && run.path.includes(a);
  const segs = Object.values(m.nodes).flatMap((n) => n.next.map((id) => {
    const a = pos(n), b = pos(m.nodes[id]);
    const cls = visited.has(id) && step(n.id, id) ? 'walked' : n.id === run.position && avail.has(id) ? 'next' : run.position === null && avail.has(id) ? 'next' : '';
    return { a, b, cls };
  }));
  // Chemins : un sentier de terre (bord sombre + cœur clair) pour la route prise et les prochains pas, des pointillés ailleurs
  const line = (s: (typeof segs)[number], cls: string) => `<line x1="${s.a.x}" y1="${s.a.y}" x2="${s.b.x}" y2="${s.b.y}" class="${cls}"/>`;
  const lines = segs.map((sg) => line(sg, `edge ${sg.cls}`)).join('') + segs.map((sg) => line(sg, `core ${sg.cls}`)).join('');
  const breed = DOFUS.breeds[run.classe];
  const boss = LIBRARY.monsters[ENCOUNTERS[run.encounters.boss].monsters[0]];
  const nodes = Object.values(m.nodes).map((n) => {
    const p = pos(n);
    const state = avail.has(n.id) ? 'avail' : n.id === run.position ? 'here' : visited.has(n.id) ? 'done' : 'locked';
    const icon = n.type === 'boss'
      ? `<span class="boss-art"><img src="${asset('ui/boss.png')}" alt=""><img src="${boss.image}" alt="" onerror="this.remove()"></span>`
      : NODE_ICON[n.type];
    const label = `${NODE_LABEL[n.type]}, étage ${n.floor}${state === 'avail' ? ', accessible' : ''}`;
    const go = state === 'avail' ? `data-act="go" data-id="${n.id}"` : 'aria-disabled="true" tabindex="-1"';
    return `<div class="node-wrap t-${n.type} s-${state}" style="left:${p.x}px;top:${p.y}px" ${state === 'avail' ? '' : 'tabindex="0"'}>
      <button class="node t-${n.type} s-${state}" ${go} aria-label="${label}">${icon}</button>
      ${n.id === run.position ? `<span class="you" title="Tu es ici"><img src="${asset(`classes/${breed.id}.png`)}" alt="Ta position"></span>` : ''}
      ${n.type === 'boss' ? `<span class="boss-plate">${esc(boss.name)}</span>` : ''}
      ${nodeTip(run, n)}
    </div>`;
  }).join('');
  const floors = Array.from({ length: m.floors - 1 }, (_, i) => i + 1)
    .map((f) => `<span class="floor-no${f === run.stats.floor ? ' current' : ''}" style="top:${TOP + (m.floors - 1 - f) * H}px">${f}</span>`).join('');
  const hint = run.position === null ? 'Choisis ta première case en bas de la carte.' : 'Choisis ta prochaine case. Survole-la pour voir ce qui t\'y attend.';
  return `<main class="mapview">
    <section class="map-wrap">
      <header class="map-head">
        <h2 class="act-title"><span class="act-no">Acte ${run.act}</span>${esc(actName(run))}</h2>
        <p>${hint}</p>
      </header>
      <div class="map-scroll"><div class="map" style="width:${width}px;height:${height}px">
        <div class="map-board" data-board aria-hidden="true"></div>
        <svg class="trails" width="${width}" height="${height}" aria-hidden="true">${lines}</svg>
        ${floors}
        ${run.position === null ? `<span class="start-label" style="top:${TOP + (m.floors - 2) * H + 42}px">Départ</span>` : ''}
        ${nodes}
      </div></div>
      <ul class="legend">${(['combat', 'elite', 'zaap', 'marchand'] as const).map((t) => `<li><span class="node mini t-${t}">${NODE_ICON[t]}</span>${NODE_LABEL[t]}</li>`).join('')}<li><span class="node mini t-boss"><img src="${asset('ui/boss.png')}" alt=""></span>Boss</li></ul>
    </section>
    ${sheet(run)}
  </main>`;
}

/** Plateau peint sous la carte : cases et chemins restent dégagés. */
function mountBoard(run: Run): void {
  const host = root.querySelector('[data-board]') as HTMLElement | null;
  if (!host) return;
  const { pos, width, height } = mapLayout(run);
  const m = run.map;
  const nodes = Object.values(m.nodes).map((n) => ({ ...pos(n), r: n.type === 'boss' ? 64 : 34 }));
  const segs = Object.values(m.nodes).flatMap((n) => n.next.map((id) => {
    const a = pos(n), b = pos(m.nodes[id]);
    return [a.x, a.y, b.x, b.y] as [number, number, number, number];
  }));
  void paintBoard(ACT_BOARD[run.act] ?? 8, { W: width, H: height, nodes, segs }, run.seed * 31 + run.act).then((c) => {
    if (!c || !host.isConnected) return;
    if (host.firstChild !== c) host.replaceChildren(c);
    host.classList.add('on');
  });
}

/** Chiffres de dégâts : couleur de l'élément qui a frappé. */
function floatsHtml(uid: number): string {
  const list = ui.floats.get(uid);
  if (!list) return '';
  return `<span class="floats" aria-hidden="true">${list.map((f, i) =>
    `<span class="num n-${f.el}" style="--i:${i}">${f.text ?? (f.el === 'soin' ? `+${f.n}` : `−${f.n}`)}</span>`).join('')}</span>`;
}

/** Résistances d'un monstre, comme dans Dofus : les cinq éléments (neutre compris) et leur pourcentage. */
const RES_ORDER: Element[] = ['neutre', ...ELEMENTS];
function resGrid(res: Record<Element, number>, compact = false): string {
  return `<span class="res-grid${compact ? ' compact' : ''}">${RES_ORDER.map((el) => {
    const v = res[el] ?? 0;
    const cls = v >= 100 ? 'immune' : v < 0 ? 'weak' : v >= 25 ? 'strong' : '';
    return `<span class="res ${cls}" title="${ELEMENT_NAMES[el]} : ${v} %">${elIcon(el, 'el-mini')}<b>${v > 0 ? '' : v < 0 ? '−' : ''}${Math.abs(v)} %</b></span>`;
  }).join('')}</span>`;
}

function enemyHtml(e: Enemy, targeting: boolean): string {
  const c = ui.run!.combat!;
  const it = intentSummary(c, e);
  const v = shown.get(e.uid);
  const hp = v?.hp ?? e.hp, block = v?.block ?? e.block, dead = v?.dead ?? e.dead;
  const can = targeting && !e.dead;
  const res = c.resOf(e);
  const cam = e.def.powers?.some((p) => p.kind === 'cameleon') && e.m.lastEl;
  return `<button class="enemy hastip${dead ? ' dead' : ''}${can ? ' targetable' : ''}${ui.hit.has(e.uid) ? ' hit' : ''}${ui.lunge.has(e.uid) ? ' lunge' : ''}" data-uid="${e.uid}" ${can ? 'data-act="target"' : 'tabindex="-1"'} aria-label="${esc(e.def.name)}">
    ${dead || e.dead ? '' : `<span class="intent i-${it.kind}" title="${esc(`${e.def.moves[e.moveId].name} : ${moveDetail(e, c)}`)}">${intentIcon(it.kind)}${esc(it.label)}</span>`}
    ${e.def.powers?.length && !(dead || e.dead) ? `<span class="chips powers">${powerBadges(e, c)}</span>` : ''}
    ${pic(e.def.image, e.def.name, 'enemy-pic')}
    ${floatsHtml(e.uid)}
    <span class="enemy-under">
      <span class="enemy-name">${esc(e.def.name)}</span>
      ${hpBar(hp, e.maxHp, block, `e${e.uid}`)}
      <span class="chips">${statusChips(e.status)}</span>
    </span>
    ${dead || e.dead ? '' : `<span class="fxtip res-tip" role="tooltip"><b class="fxt">Résistances</b>${resGrid(res)}
      <span class="fx-when">Chaque point réduit d'autant les dégâts de cet élément ; une valeur négative les augmente.${cam ? ` Peau de roche : +50 % en ${ELEMENT_NAMES[e.m.lastEl as Element]} (dernier coup reçu).` : ''}</span></span>`}
  </button>`;
}

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.5 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 4 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';

function topbarHtml(run: Run): string {
  const c = run.combat!;
  const p = c.player;
  const v = shown.get(-1);
  const enc = run.encounter ? ENCOUNTERS[run.encounter] : null;
  const title = enc ? [...new Set(enc.monsters.map((id) => LIBRARY.monsters[id].name))].join(', ') : 'Combat';
  const breed = DOFUS.breeds[run.classe];
  return `<header class="topbar">
      <span class="tb-who"><img src="${asset(`classes/${breed.id}.png`)}" alt=""><b>${esc(breed.n)}</b></span>
      <span class="tb-hp" title="Points de vie">${HEART}${v?.hp ?? p.hp}/${p.maxHp}</span>
      <span class="tb-floor">Acte ${run.act}, étage ${run.stats.floor}</span>
      <span class="tb-kamas" title="Kamas">${KAMAS(run.kamas)}</span>
      <span class="tb-enc"><b>${esc(title)}</b> ${run.node ? NODE_LABEL[run.node.type] : ''}, tour ${c.turn}</span>
      <span class="tb-actions">
        <button class="tb-btn" data-act="modal-deck">${uiIcon('deck')}Deck ${run.deck.length}</button>
        ${c.exhaustPile.length ? `<button class="link" data-act="pile" data-pile="exhaust">Épuisées ${c.exhaustPile.length}</button>` : ''}
        <button class="tb-btn" data-act="toggle-log" aria-pressed="${ui.logOpen}">${uiIcon('journal')}Journal</button>
        <button class="tb-btn" data-act="bestiary" ${ui.busy ? 'disabled' : ''}>${uiIcon('deck')}Bestiaire</button>
      </span>
      ${relicBar(run)}
    </header>`;
}

/** Barre des objets et Dofus en combat : un badge par effet, qui brille quand il se déclenche. */
const firedSeen: Record<string, number> = {};
function relicBar(run: Run): string {
  const c = run.combat!;
  const flash = (src: string) => {
    const n = c.fired[src] ?? 0;
    const f = n > (firedSeen[src] ?? 0);
    firedSeen[src] = n;
    return f;
  };
  const items = SLOTS.map((slot) => run.equipment[slot]).filter((id): id is string => !!id).map((id) => {
    const it = ITEMS.items[id];
    const fx = itemEffect(id);
    if (!fx) return '';
    return `<span class="relic rar-${it.rarity}">${pic(it.icon, it.name, 'relic-pic')}${fxBadge(fx, { title: it.name, live: c.usage(id), flash: flash(id), down: true })}</span>`;
  });
  const eggs = run.dofus.map((id) => {
    const src = `dofus:${id}`;
    const f = flash(src);
    return `<span class="relic egg">${eggIcon(id)}${eggBadges(id, { live: () => c.usage(src), flash: f, down: true })}</span>`;
  });
  const passive = passiveBadge(run.classe, { c, flash: flash('classe'), down: true });
  const all = [passive, ...eggs, ...items].filter(Boolean).join('');
  return all ? `<div class="relics" aria-label="Effets d'objets et de Dofus">${all}</div>` : '';
}

function arenaHtml(run: Run): string {
  const c = run.combat!;
  const p = c.player;
  const v = shown.get(-1);
  const hp = v?.hp ?? p.hp, block = v?.block ?? p.block;
  const targeting = ui.selecting !== null;
  return `<section class="arena${targeting ? ' targeting' : ''}">
      <div class="hero${ui.playerHit ? ' hurt' : ''}" style="left:${STAGE.playerX * 100}%;top:${STAGE.ground * 100}%">
        ${hpBar(hp, p.maxHp, block, 'p')}
        ${floatsHtml(-1)}
        <span class="chips">${powerChips(c)}${statusChips(p.status)}</span>
      </div>
      <div class="foes" style="height:${STAGE.ground * 100}%">${c.enemies.map((e) => enemyHtml(e, targeting)).join('')}</div>
      ${targeting ? `<p class="prompt">Choisis une cible. <button class="link" data-act="cancel">Annuler</button></p>` : ''}
    </section>`;
}

function viewCombat(run: Run): string {
  const c = run.combat!;
  const p = c.player;
  const n = c.hand.length;
  const hand = c.hand.map((inst, i) => {
    const def = c.cardDef(inst);
    const sel = ui.selecting?.kind === 'card' && ui.selecting.index === i;
    const o = i - (n - 1) / 2;
    return `<div class="hand-slot" data-cid="${inst.uid}" style="--o:${o}">${cardHtml(def, { inst, act: 'play', data: `data-index="${i}"`, disabled: !!def.unplayable || c.costOf(inst) > p.energy, selected: sel, live: true, hint: i < 9 ? String(i + 1) : '', cost: c.costOf(inst) })}</div>`;
  }).join('');
  return `<main class="combatview${ui.busy ? ' busy' : ''}">
    ${topbarHtml(run)}
    ${arenaHtml(run)}
    <footer class="tray">
      <button class="pile pile-draw" data-act="pile" data-pile="draw" title="Pioche : ${c.drawPile.length} cartes" aria-label="Pioche, ${c.drawPile.length} cartes">${c.drawPile.length ? cardBack('pb-2') + cardBack('pb-1') + cardBack() : '<span class="pile-empty"></span>'}<b>${c.drawPile.length}</b></button>
      <div class="gem${p.energy ? '' : ' empty'}" role="img" aria-label="${p.energy} PA sur ${BASE_ENERGY}"><b>${p.energy}/${BASE_ENERGY}</b><span>PA</span></div>
      <div class="hand fan${n > 7 ? ' crowded' : ''}">${hand || '<p class="muted">Main vide.</p>'}</div>
      <button class="end-turn" data-act="end-turn">Finir le tour</button>
      <button class="pile pile-discard" data-act="pile" data-pile="discard" title="Défausse : ${c.discardPile.length} cartes" aria-label="Défausse, ${c.discardPile.length} cartes">${c.discardPile.length ? cardBack('pb-1') + cardBack() : '<span class="pile-empty"></span>'}<b>${c.discardPile.length}</b></button>
    </footer>
    ${ui.logOpen ? `<aside class="log"><ol>${c.log.slice(-40).map((l) => `<li>${esc(l)}</li>`).join('')}</ol></aside>` : ''}
  </main>`;
}

function viewReward(run: Run): string {
  const r = run.reward!;
  const cards = r.cards.map((id) => {
    const def = LIBRARY.cards[id];
    return r.cardTaken
      ? cardHtml(def, { disabled: r.cardTaken !== id, selected: r.cardTaken === id })
      : cardHtml(def, { act: 'take-card', data: `data-id="${id}"` });
  }).join('');
  const items = r.items.map((id) => itemTile(ITEMS.items[id], r.itemTaken ? { taken: r.itemTaken === id, dim: r.itemTaken !== id } : { act: 'take-item' })).join('');
  return `<main class="rewardview">
    <section class="reward">
      <h2 class="with-ico">${uiIcon(r.itemSource === 'elite' ? 'coffre-rare' : 'coffre', 'h-ico')}Victoire</h2>
      <p class="muted">Il te reste ${run.hp} PV sur ${run.maxHp}. Tu ramasses ${KAMAS(r.kamas)}.${r.stolen ? ` Des voleurs se sont enfuis avec ${KAMAS(r.stolen)}.` : ''}</p>
      <h3>${r.cardTaken ? 'Carte ajoutée au deck' : 'Ajoute une carte à ton deck'}</h3>
      <div class="row cards">${cards}</div>
      ${items ? `<h3>${r.itemTaken ? 'Objet équipé' : 'Choisis un objet'}</h3><p class="muted small">Prospection ${r.prospection}. La stat d'un objet est fixe ; son effet a été tiré pour cette run.</p><div class="row items">${items}</div>` : `<p class="muted small">Pas d'objet cette fois (prospection ${r.prospection}).</p>`}
      <button class="primary" data-act="leave-reward">${r.cardTaken || r.itemTaken ? 'Reprendre la route' : 'Passer et reprendre la route'}</button>
    </section>
    ${sheet(run)}
  </main>`;
}

function viewZaap(run: Run): string {
  const heal = run.zaapHealAmount();
  const used = run.zaapUsed;
  return `<main class="zaapview">
    <section class="zaap">
      <h2 class="with-ico">${uiIcon('zaap', 'h-ico')}Zaap</h2>
      <p class="muted">Une halte avant de repartir. Une seule action possible.</p>
      <div class="row options">
        <button class="option" data-act="zaap-rest" ${used || heal === 0 ? 'disabled' : ''}>${uiIcon('repos', 'option-ico')}<b>Se reposer</b><span>Récupère ${heal} PV.</span></button>
        <button class="option" data-act="modal-upgrade" ${used || run.deck.every((c) => c.upgraded) ? 'disabled' : ''}>${uiIcon('ameliorer', 'option-ico')}<b>Améliorer une carte</b><span>Une carte de ton deck devient sa version +.</span></button>
      </div>
      <button class="primary" data-act="leave-zaap">${used ? 'Reprendre la route' : 'Repartir sans rien faire'}</button>
    </section>
    ${sheet(run)}
  </main>`;
}

function viewShop(run: Run): string {
  const shop = run.shop!;
  const tag = (price: number, sold: boolean) => sold ? '<span class="price sold">Vendu</span>' : `<span class="price${price > run.kamas ? ' short' : ''}">${KAMAS(price)}</span>`;
  const cards = shop.cards.map((e) => `<div class="ware">${cardHtml(LIBRARY.cards[e.id], e.sold || e.price > run.kamas ? { disabled: true } : { act: 'buy-card', data: `data-id="${e.id}"` })}${tag(e.price, e.sold)}</div>`).join('');
  const items = shop.items.map((e) => `<div class="ware">${itemTile(ITEMS.items[e.id], e.sold || e.price > run.kamas ? { dim: !e.sold, taken: e.sold } : { act: 'buy-item' })}${tag(e.price, e.sold)}</div>`).join('');
  return `<main class="shopview">
    <section class="shop">
      <h2 class="with-ico">${uiIcon('marchand', 'h-ico')}Marchand</h2>
      <p class="muted">Tu as ${KAMAS(run.kamas)} kamas. Un objet acheté remplace celui de son emplacement.</p>
      <h3>Cartes</h3><div class="row cards wares">${cards}</div>
      <h3>Objets</h3><div class="row items wares">${items}</div>
      <h3>Service</h3>
      <div class="row options">
        <button class="option" data-act="modal-remove" ${shop.removed || shop.removePrice > run.kamas || run.deck.length <= 5 ? 'disabled' : ''}>${uiIcon('ameliorer', 'option-ico')}<b>Retirer une carte</b><span>${shop.removed ? 'Déjà fait chez ce marchand.' : `Retire définitivement une carte du deck pour ${shop.removePrice} kamas.`}</span></button>
      </div>
      <button class="primary" data-act="leave-shop">Reprendre la route</button>
    </section>
    ${sheet(run)}
  </main>`;
}

function viewDofus(run: Run): string {
  const next = ACTS[run.act];
  const offer = run.dofusOffer.map((id) => `<button class="egg-pick" data-act="take-dofus" data-id="${id}">
      ${eggIcon(id, 'egg-big')}<b>${esc(EGG_BY_ID[id].name)}</b>${eggBadges(id)}<span>${esc(eggText(id))}</span></button>`).join('');
  return `<main class="dofusview">
    <section class="dofus-choice">
      <h2>Choisis un Dofus</h2>
      <p class="muted">Un seul des trois. Il t'accompagne jusqu'à la fin de la run. Ensuite : acte ${next.act}, ${esc(next.name)}, et tes PV sont remis au maximum.</p>
      <div class="egg-row">${offer}</div>
    </section>
    ${sheet(run)}
  </main>`;
}

function viewEnd(run: Run): string {
  const won = run.phase === 'victory';
  return `<main class="endview">
    <section class="end">
      <h2 class="with-ico">${won ? uiIcon('victoire', 'h-ico') : ''}${won ? 'Le Minotoror est tombé' : 'Défaite'}</h2>
      <p>${won ? 'Les trois actes sont terminés : Amakna, la forêt des Abraknydes et les landes de Brâkmar.' : `Tu es tombé à l'acte ${run.act} (${esc(actName(run))}), étage ${run.stats.floor}.`}</p>
      ${run.dofus.length ? `<p class="egg-row">${run.dofus.map((id) => `<span title="${esc(EGG_BY_ID[id].name)}">${eggIcon(id)}</span>`).join('')}</p>` : ''}
      <p class="muted">${run.stats.combats} combats gagnés, dont ${run.stats.elites} élites. Deck de ${run.deck.length} cartes, ${Object.keys(run.equipment).length} objets équipés, ${KAMAS(run.stats.kamas)} gagnés.</p>
      <button class="primary" data-act="title">Nouvelle partie</button>
    </section>
    ${sheet(run)}
  </main>`;
}

function viewModal(run: Run): string {
  const m = ui.modal;
  if (!m) return '';
  let title = '';
  let body = '';
  if (m.kind === 'deck' || m.kind === 'pile') {
    const list = m.kind === 'deck' ? run.deck : m.pile === 'draw' ? [...run.combat!.drawPile].sort((a, b) => a.id.localeCompare(b.id)) : m.pile === 'discard' ? run.combat!.discardPile : run.combat!.exhaustPile;
    title = m.kind === 'deck' ? `Deck (${list.length})` : m.pile === 'draw' ? `Pioche (${list.length}, ordre masqué)` : m.pile === 'discard' ? `Défausse (${list.length})` : `Épuisées (${list.length})`;
    body = list.map((inst) => cardHtml(resolveCard(LIBRARY, inst), { inst })).join('') || '<p class="muted">Aucune carte.</p>';
  } else if (m.kind === 'remove') {
    title = `Retirer une carte (${run.shop?.removePrice ?? 0} kamas)`;
    body = run.deck.map((inst) => cardHtml(resolveCard(LIBRARY, inst), { inst, act: 'remove-card', data: `data-uid="${inst.uid}"` })).join('');
  } else if (m.kind === 'upgrade') {
    title = 'Améliorer une carte';
    body = run.deck.filter((c) => !c.upgraded).map((inst) =>
      cardHtml(resolveCard(LIBRARY, { ...inst, upgraded: true }), { inst: { ...inst, upgraded: true }, act: 'zaap-upgrade', data: `data-uid="${inst.uid}"` })).join('');
  }
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-box">
    <header><h2>${esc(title)}</h2><button class="link" data-act="close-modal">Fermer</button></header>
    <div class="modal-grid">${body}</div></div></div>`;
}

// ───────────── guide de style (#styleguide) ─────────────

const SWATCHES: { title: string; items: [string, string, string][] }[] = [
  { title: 'Base', items: [
    ['--bg', '#14231d', "Sous-bois d'Amakna, fond"], ['--panel', '#1b2e26', 'Mousse, cadres'], ['--panel-2', '#243b31', 'Mousse claire'],
    ['--panel-deep', '#0f1b16', 'Creux, champs'], ['--line', '#34503f', 'Bordures'], ['--text', '#fff3d6', 'Laine de Bouftou, texte'], ['--muted', '#a9bfa6', 'Texte secondaire'], ['--ink', '#10201a', 'Encre des contours'],
  ] },
  { title: 'Or, pour ce qui se joue', items: [['--gold', '#f0b739', "Tournesol d'Astrub"], ['--gold-2', '#ffd66b', 'Tournesol clair, titres']] },
  { title: 'Dofus primordiaux, un par écran', items: [
    ['--emeraude', '#93c02c', 'Carte'], ['--pourpre', '#d9613a', 'Combat'], ['--ocre', '#e2b23a', 'Récompense'],
    ['--turquoise', '#34aaa6', 'Zaap'], ['--ivoire', '#dccaa0', 'Réserve'], ['--ebene', '#a9835e', 'Défaite'],
  ] },
  { title: 'Éléments, cadre des cartes', items: [
    ['--terre', '#b07a3c', 'Terre'], ['--feu', '#e2592f', 'Feu'], ['--eau', '#3d8fd8', 'Eau'], ['--air', '#74b84a', 'Air'], ['--neutre', '#9b958a', 'Neutre'],
  ] },
  { title: 'États', items: [['--pv', '#b8473b', 'Points de vie'], ['--armure', '#8fb6c9', 'Armure'], ['--ok', '#7fc28f', 'Amélioration, réussite']] },
];

function sgSection(title: string, note: string, body: string): string {
  return `<section class="sg-section"><header><h2>${title}</h2><p>${note}</p></header>${body}</section>`;
}

function viewStyleguide(): string {
  // Une partie de démonstration, rendue sans toucher à la partie en cours.
  const saved = ui.run;
  const demo = new Run('iop', 7);
  ui.run = demo;
  for (const r of ['rare', 'legendaire'] as const) demo.equip(Object.values(ITEMS.items).find((it) => it.rarity === r && !demo.equipment[it.slot])!.id);
  const combatNode = demo.availableNodes()[0];
  const tipCombat = nodeTip(demo, demo.map.nodes[combatNode]);
  const zaapNode = Object.values(demo.map.nodes).find((n) => n.type === 'zaap');
  const tipZaap = zaapNode ? nodeTip(demo, zaapNode) : '';
  demo.enterNode(combatNode);
  const c = demo.combat!;
  c.player.status.puissance = 2;
  c.enemies[0].status.vulnerabilite = 2;
  c.enemies[0].status.brulure = 3;
  c.enemies[0].block = 6;
  const enemies = c.enemies.map((e) => enemyHtml(e, false)).join('');

  const swatches = SWATCHES.map((g) => `<div class="sg-swatch-group"><h3>${g.title}</h3><div class="sg-swatches">${g.items.map(([v, hex, name]) =>
    `<figure class="sg-swatch"><span style="background:var(${v})"></span><figcaption><b>${name}</b><code>${v} ${hex}</code></figcaption></figure>`).join('')}</div></div>`).join('');

  const type = `<div class="sg-type">
    <p class="brand-name">Dofus Slay</p><p class="brand-sub">Alegreya Sans italique, sous-titres et lieux</p>
    <h2>Titre d'écran, Berkshire Swash</h2>
    <h3>Titre de section, Berkshire Swash tournesol</h3>
    <p>Texte courant en Alegreya Sans 16, interligne 1,5. Les cartes, les objets et les infobulles l'utilisent aussi, en plus petit.</p>
    <p class="muted">Texte secondaire : précisions, unités, états.</p>
  </div>`;

  const accents = ['--emeraude', '--pourpre', '--ocre', '--turquoise'];
  const buttons = `<div class="sg-row">
    ${accents.map((a) => `<button class="primary sg-btn" style="--accent:var(${a}); --accent-deep: color-mix(in srgb, var(${a}) 62%, #000)">Reprendre la route</button>`).join('')}
    <button class="end-turn">Finir le tour</button>
    <button class="link">Voir le deck</button>
  </div>
  <div class="sg-row"><div class="sg-panel">Cadre gravé : pierre, double filet doré, coins biseautés. Utilisé pour la fiche, les récompenses, le Zaap, les fenêtres et les infobulles.</div></div>`;

  const pickCard = (id: string, extra: Partial<CardInstance> = {}) => {
    const inst: CardInstance = { uid: 0, id, upgraded: false, ...extra };
    return resolveCard(LIBRARY, inst);
  };
  const cardsRow = ['iop_coup_epee', 'iop_accumulation', 'iop_tempete', 'iop_endurance', 'iop_zenith']
    .map((id) => cardHtml(pickCard(id), { live: false })).join('');
  const cardStates = [
    cardHtml(pickCard('iop_colere'), {}) ,
    cardHtml(pickCard('iop_epee_destin', { upgraded: true }), { inst: { uid: 0, id: 'iop_epee_destin', upgraded: true } }),
    cardHtml(pickCard('iop_epee_destin'), { cost: 0 }),
    cardHtml(pickCard('iop_sentence'), { selected: true }),
    cardHtml(pickCard('iop_epee_jugement'), { disabled: true }),
  ].join('');
  const cardLabels = ['Rare', 'Améliorée', 'Coût réduit', 'Sélectionnée', 'Pas assez de PA'];
  const byRar = (r: string) => Object.values(LIBRARY.cards).find((c) => c.classe === 'iop' && c.rarity === r)!;
  const frames = [
    cardHtml(byRar('base')), cardHtml(byRar('commune')), cardHtml(byRar('rare')),
    cardHtml(pickCard(byRar('commune').id, { upgraded: true }), { inst: { uid: 0, id: byRar('commune').id, upgraded: true } }),
    `<span class="sg-back">${cardBack()}</span>`,
  ].join('');
  const frameLabels = ['Base : bronze', 'Commune : argent', 'Rare : or', 'Améliorée : reflet', 'Dos de la pioche'];
  const icons = ['combat', 'elite', 'zaap', 'marchand', 'repos', 'ameliorer', 'forge', 'coffre', 'coffre-rare', 'deck', 'journal', 'defense', 'buff', 'debuff', 'victoire', 'dofus']
    .map((n) => `<figure class="sg-icon">${uiIcon(n, 'h-ico')}<figcaption>${n}</figcaption></figure>`).join('');
  const nums = (['terre', 'feu', 'eau', 'air', 'neutre', 'soin', 'armure'] as const)
    .map((el, i) => `<span class="sg-num"><span class="num n-${el}" style="animation:none;position:static;transform:none">${el === 'soin' ? '+6' : el === 'armure' ? 'Bloqué' : `−${8 + i}`}</span><small>${el}</small></span>`).join('');

  const items = (['commun', 'rare', 'mythique', 'legendaire'] as const).map((r, i) => {
    const it = Object.values(ITEMS.items).filter((x) => x.rarity === r)[i + 2];
    return itemTile(it, { taken: r === 'mythique' });
  }).join('');

  const states = ['avail', 'here', 'done', 'locked'] as const;
  const stateNames = { avail: 'Accessible', here: 'Position actuelle', done: 'Visitée', locked: 'Pas encore accessible' };
  const medals = (['combat', 'elite', 'zaap', 'marchand'] as const).map((t) => `<div class="sg-medal-row"><b>${NODE_LABEL[t]}</b>${states.map((st) =>
    `<figure class="sg-node"><span class="sg-node-box"><span class="node t-${t} s-${st}">${NODE_ICON[t]}</span></span><figcaption>${stateNames[st]}</figcaption></figure>`).join('')}</div>`).join('')
    + `<div class="sg-medal-row"><b>Boss</b><figure class="sg-node big"><span class="sg-node-box"><span class="node t-boss s-locked"><span class="boss-art"><img src="${asset('ui/boss.png')}" alt=""></span></span></span><figcaption>Grand médaillon doré et plaque</figcaption></figure></div>`;

  const chips = statusChips({ puissance: 2, faiblesse: 1, vulnerabilite: 2, brulure: 3, poison: 4, bouclier: 6, renvoi: 2, erosion: 1, esquive: 1, etourdi: 1 });
  const intents = `<span class="intent sg-intent i-attack">${intentIcon('attack')}7</span>
    <span class="intent sg-intent i-attack">${intentIcon('attack')}3×2</span>
    <span class="intent sg-intent i-defend">${intentIcon('defend')}Envol</span><span class="intent sg-intent i-buff">${intentIcon('buff')}Cri de guerre</span><span class="intent sg-intent i-debuff">${intentIcon('debuff')}Toile</span>`;

  ui.run = saved;
  return `<main class="styleguide">
    <header class="sg-head"><p class="brand-name">Dofus Slay</p><p class="brand-sub">Guide de style : la base visuelle du jeu</p>
      <a class="link" href="#">Revenir au jeu</a></header>
    ${sgSection('Couleurs', "L'ardoise et l'or de Dofusle. Chaque écran prend la couleur d'un Dofus primordial ; les éléments colorent les cartes.", swatches)}
    ${sgSection('Typographie', 'Deux familles : Berkshire Swash pour ce qui se lit comme un titre ou un nom, Alegreya Sans pour le reste.', type)}
    ${sgSection('Boutons et cadres', "Le bouton principal prend l'accent de l'écran. Coins biseautés pour les cadres, arrondis pour ce qui se joue.", buttons)}
    ${sgSection('Cartes', "Le cadre et le dégradé suivent l'élément. Les valeurs vertes tiennent compte des bonus en combat.",
      `<div class="sg-row cards">${cardsRow}</div><div class="sg-row cards">${cardStates}</div><div class="sg-row sg-labels">${cardLabels.map((l) => `<span>${l}</span>`).join('')}</div>`)}
    ${sgSection('Cadres de carte', "Le métal du cadre dit la rareté, comme les objets de Dofus. L'étoile bleue porte le coût en PA ; la fenêtre prend la couleur de l'élément.",
      `<div class="sg-row cards">${frames}</div><div class="sg-row sg-labels">${frameLabels.map((l) => `<span>${l}</span>`).join('')}</div>`)}
    ${sgSection('Icônes', "Icônes de l'interface et des objets de Dofus, jamais redessinées.", `<div class="sg-row">${icons}</div>`)}
    ${sgSection('Objets', 'Quatre raretés. La stat vient de l\'objet Dofus et ne change pas ; l\'effet est tiré à chaque run : budget croissant du commun au mythique, règle unique pour le légendaire.', `<div class="row items">${items}</div>`)}
    ${sgSection("Carte de l'acte", "La taille et le liseré des médaillons disent l'enjeu. L'infobulle s'ouvre au survol ou au focus.",
      `${medals}<div class="sg-row sg-tips"><div class="sg-static">${tipCombat}</div><div class="sg-static">${tipZaap}</div></div>`)}
    ${sgSection('Combat', "Intentions des monstres, statuts, chiffres de dégâts à la couleur de l'élément, barres de vie et armure, PA.",
      `<div class="field sg-field">${enemies}</div><div class="sg-row">${intents}</div><div class="sg-row chips">${chips}</div><div class="sg-row sg-nums">${nums}</div>
      <div class="sg-row"><span class="sg-bar">${hpBar(54, 80, 12)}</span><div class="gem" role="img" aria-label="2 PA sur 3"><b>2/3</b><span>PA</span></div><div class="gem empty" role="img" aria-label="0 PA sur 3"><b>0/3</b><span>PA</span></div></div>`)}
  </main>`;
}

// ───────────── rendu ─────────────

/** En-tête gravé, comme sur Dofusle : nom au centre, lieu et étage en dessous. */
function brandBar(run: Run): string {
  const where = `Acte ${run.act}, ${actName(run)}${run.stats.floor ? `, étage ${run.stats.floor} sur ${run.map.floors}` : ', au départ'}`;
  return `<header class="brandbar"><p class="brand-name">Dofus Slay</p><p class="brand-sub">${where}</p><button class="tb-btn bb-bx" data-act="bestiary">${uiIcon('journal')}Bestiaire</button></header>`;
}

const BX: BxHelpers = {
  asset, pic, elIcon: (el, cls) => elIcon(el, cls), cardHtml: (def, o) => cardHtml(def, { inst: o?.inst }),
  itemTile: (it) => itemTile(it, { fx: itemEffect(it.id), catalog: true }), get inRun() { return !!ui.run; }, eggIcon, eggBadges: (id) => eggBadges(id),
  statusIcon: (id) => asset(STATUS_ICON[id]), powerIcon: (k) => asset(POWER_ICON[k] ?? 'fx/regle.webp'),
  passiveBadge: (cl) => passiveBadge(cl), slotName: (s) => SLOT_NAMES[s] ?? s, rarityName: (r) => RARITY_NAMES[r] ?? r,
};

function render(): void {
  if (location.hash === '#bestiaire') {
    stage.hide();
    document.body.dataset.screen = 'bestiary';
    const q = document.activeElement instanceof HTMLInputElement && document.activeElement.matches('[data-bx-q]') ? document.activeElement.selectionStart : null;
    root.innerHTML = viewBestiary(BX, !!ui.run);
    if (bx.scroll) {
      bx.scroll = false;
      if (window.innerWidth <= 1000) root.querySelector('.bx-detail')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (q !== null || bx.focus) {
      bx.focus = false;
      const input = root.querySelector('[data-bx-q]') as HTMLInputElement | null;
      input?.focus();
      const at = q ?? input?.value.length ?? 0;
      input?.setSelectionRange(at, at);
    }
    return;
  }
  if (location.hash === '#styleguide') {
    stage.hide();
    document.body.dataset.screen = 'styleguide';
    root.innerHTML = viewStyleguide();
    return;
  }
  const run = ui.run;
  let html = '';
  if (!run) html = viewTitle();
  else if (run.phase === 'map') html = viewMap(run);
  else if (run.phase === 'combat') html = viewCombat(run);
  else if (run.phase === 'reward') html = viewReward(run);
  else if (run.phase === 'zaap') html = viewZaap(run);
  else if (run.phase === 'marchand') html = viewShop(run);
  else if (run.phase === 'dofus') html = viewDofus(run);
  else html = viewEnd(run);
  document.body.dataset.screen = run ? run.phase : 'title';
  if (run?.phase !== 'combat' || !run.combat) {
    for (const ev of pending) clearTimeout(ev.timer);
    pending.length = 0;
    shown.clear();
    for (const k of Object.keys(firedSeen)) delete firedSeen[k];
  }
  const handBefore = captureHand();
  const barsBefore = captureBars();
  root.innerHTML = (run && run.phase !== 'combat' ? brandBar(run) : '') + html + (run ? viewModal(run) : '');
  if (run?.phase === 'combat') { animateHand(handBefore); tweenBars(barsBefore); }
  if (run?.phase === 'combat' && run.encounter) stage.show(run.encounter, run.classe, run.gender, appearanceOf(run));
  else stage.hide();
  if (!run) { startPreviews(); mountLand(); }
  if (run?.phase === 'map') mountBoard(run);
  if (run?.phase === 'map') {
    const here = root.querySelector('.node.s-avail') as HTMLElement | null;
    here?.scrollIntoView({ block: 'center' });
  }
  if (run?.phase === 'combat' && run.combat && run.node?.type === 'boss' && ui.bossIntro !== run.combat) bossIntro(run);
  clearMarks();
}

function clearMarks(): void {
  ui.hit.clear();
  ui.lunge.clear();
  ui.playerHit = 0;
  ui.floats.clear();
}

/** Rendu partiel au moment d'un impact : seuls la scène et la barre du haut changent, la main reste en place
 *  (une carte en cours de glisser n'est pas interrompue). */
function renderArena(): void {
  const run = ui.run;
  const arena = root.querySelector('.arena');
  const top = root.querySelector('.topbar');
  if (!run?.combat || run.phase !== 'combat' || !arena || !top) { if (!drag) render(); return; }
  const barsBefore = captureBars();
  arena.outerHTML = arenaHtml(run);
  top.outerHTML = topbarHtml(run);
  tweenBars(barsBefore);
  if (drag?.over != null) root.querySelector(`.enemy[data-uid="${drag.over}"]`)?.classList.add('aimed');
  clearMarks();
}

// ───────────── mouvements de la main ─────────────
// La main est entièrement redessinée à chaque action ; on rejoue le mouvement (technique FLIP) :
// chaque carte glisse de son ancienne place à la nouvelle, les cartes piochées sortent de la pioche,
// les cartes défaussées filent vers la défausse.

type HandShot = Map<number, { slot: DOMRect; card: DOMRect; el: HTMLElement }>;

function captureHand(): HandShot {
  const m: HandShot = new Map();
  root.querySelectorAll<HTMLElement>('.hand-slot[data-cid]').forEach((s) => {
    const card = s.querySelector('.card') as HTMLElement | null;
    if (card) m.set(Number(s.dataset.cid), { slot: s.getBoundingClientRect(), card: card.getBoundingClientRect(), el: card });
  });
  return m;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function animateHand(before: HandShot): void {
  const flying = new Set(ui.flying);
  ui.flying.clear();
  if (reduceMotion()) return;
  const drawR = root.querySelector('.pile-draw')?.getBoundingClientRect();
  const discR = root.querySelector('.pile-discard')?.getBoundingClientRect();
  const present = new Set<number>();
  let drawn = 0;
  root.querySelectorAll<HTMLElement>('.hand-slot[data-cid]').forEach((s) => {
    const cid = Number(s.dataset.cid);
    present.add(cid);
    const r = s.getBoundingClientRect();
    const old = before.get(cid);
    if (old) {
      const dx = old.slot.left - r.left, dy = old.slot.top - r.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) s.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else if (drawR) {
      const a = center(drawR), b = center(r);
      s.animate([
        { translate: `${a.x - b.x}px ${a.y - b.y}px`, scale: '.22', opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { translate: '0 0', scale: '1', opacity: 1 },
      ], { duration: 420, delay: drawn++ * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    }
  });
  if (!discR) return;
  let k = 0;
  for (const [cid, old] of before) {
    if (present.has(cid) || flying.has(cid)) continue;
    const ghost = old.el.cloneNode(true) as HTMLElement;
    ghost.classList.remove('sel', 'dragging', 'aiming', 'will-play');
    ghost.classList.add('card-flying', 'to-pile');
    Object.assign(ghost.style, { left: `${old.card.left}px`, top: `${old.card.top}px`, width: `${old.card.width}px`, height: `${old.card.height}px`, transform: 'none' });
    document.body.appendChild(ghost);
    const a = center(old.card), b = center(discR);
    const anim = ghost.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(.2) rotate(25deg)`, opacity: 0.2 },
    ], { duration: 360, delay: k++ * 45, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'both' });
    anim.onfinish = () => ghost.remove();
  }
}

// Barres de vie : la barre glisse vers sa nouvelle valeur, une traînée claire montre les PV perdus.
function captureBars(): Map<string, number> {
  const m = new Map<string, number>();
  root.querySelectorAll<HTMLElement>('.bar[data-key]').forEach((b) => {
    const f = b.querySelector('.bar-fill') as HTMLElement | null;
    if (f) m.set(b.dataset.key!, parseFloat(f.style.width));
  });
  return m;
}

function tweenBars(before: Map<string, number>): void {
  if (reduceMotion()) return;
  root.querySelectorAll<HTMLElement>('.bar[data-key]').forEach((b) => {
    const old = before.get(b.dataset.key!);
    const f = b.querySelector('.bar-fill') as HTMLElement | null;
    if (old == null || !f) return;
    const now = parseFloat(f.style.width);
    if (Math.abs(old - now) < 0.1) return;
    f.style.transition = 'none';
    f.style.width = `${old}%`;
    if (now < old) {
      const trail = document.createElement('span');
      trail.className = 'bar-trail';
      trail.style.width = `${old}%`;
      b.insertBefore(trail, f);
      requestAnimationFrame(() => { trail.style.width = `${now}%`; });
      setTimeout(() => trail.remove(), 1100);
    }
    void f.offsetWidth;
    f.style.transition = '';
    f.style.width = `${now}%`;
  });
}

// ───────────── entrée du boss : le seul grand moment de mise en scène ─────────────

function bossIntro(run: Run): void {
  ui.bossIntro = run.combat!;
  const boss = run.combat!.enemies[0];
  if (!boss) return;
  const quick = reduceMotion();
  ui.busy = true;
  const el = document.createElement('div');
  el.className = `boss-intro${quick ? ' quick' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `${boss.def.name} entre en combat`);
  el.innerHTML = `<div class="bi-bar bi-top"></div><div class="bi-bar bi-bottom"></div>
    <div class="bi-stage">
      <div class="bi-halo"></div>
      ${pic(boss.def.image, boss.def.name, 'bi-pic')}
      <p class="bi-kicker">Gardien de l'acte ${run.act} : ${esc(actName(run))}</p>
      <h2 class="bi-name">${esc(boss.def.name)}</h2>
      <p class="bi-meta">${boss.def.level ? `Niveau ${boss.def.level[1]}, ` : ''}${boss.maxHp} points de vie</p>
    </div>
    <p class="bi-skip">Clique pour combattre</p>`;
  document.body.appendChild(el);
  document.body.classList.add('boss-entering');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    document.body.classList.remove('boss-entering');
    setTimeout(() => { el.remove(); ui.busy = false; render(); }, quick ? 150 : 450);
  };
  el.addEventListener('click', finish);
  const onKey = (ev: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(ev.key)) { ev.stopPropagation(); finish(); document.removeEventListener('keydown', onKey, true); } };
  document.addEventListener('keydown', onKey, true);
  setTimeout(finish, quick ? 1600 : 3400);
}

// ───────────── actions ─────────────

// ───────────── impacts ─────────────
// La logique s'applique dès qu'une carte est jouée (PA, main, cibles possibles), ce qui permet d'enchaîner
// les cartes sans attendre la fin des animations. L'affichage, lui, garde les anciennes valeurs (PV, armure,
// mort) jusqu'à l'impact du sort : c'est la table `shown`.

type Vals = { hp: number; block: number; dead: boolean };
type Snap = Map<number, Vals>;
interface Impact { before: Snap; after: Snap; el?: Element; timer: number }

const shown = new Map<number, Vals>();
const pending: Impact[] = [];

function pushFloat(uid: number, f: { n: number; el: Element | 'soin' | 'armure'; text?: string }): void {
  const l = ui.floats.get(uid) ?? [];
  l.push(f);
  ui.floats.set(uid, l);
}

function snapshot(): Snap {
  const c = ui.run!.combat!;
  const m: Snap = new Map(c.enemies.map((e) => [e.uid, { hp: e.hp, block: e.block, dead: e.dead }]));
  m.set(-1, { hp: c.player.hp, block: c.player.block, dead: c.player.hp <= 0 });
  return m;
}

function changedIn(ev: { before: Snap; after: Snap }): number[] {
  const out: number[] = [];
  for (const [uid, a] of ev.after) {
    const b = ev.before.get(uid);
    if (b && (b.hp !== a.hp || b.block !== a.block || b.dead !== a.dead)) out.push(uid);
  }
  return out;
}

/** Enregistre ce qu'une action a changé ; l'affichage suivra après `delay` ms. */
function schedule(before: Snap, after: Snap, el: Element | undefined, delay: number): void {
  const ev: Impact = { before, after, el, timer: 0 };
  const uids = changedIn(ev);
  if (!uids.length) return;
  for (const uid of uids) if (!shown.has(uid)) shown.set(uid, before.get(uid)!);
  pending.push(ev);
  if (delay <= 0) { resolve(ev); return; }
  ev.timer = window.setTimeout(() => { resolve(ev); renderArena(); settle(); }, delay);
}

/** Impact : les valeurs affichées rattrapent la logique, avec chiffres et secousses. */
function resolve(ev: Impact): void {
  const i = pending.indexOf(ev);
  if (i < 0) return;
  pending.splice(i, 1);
  clearTimeout(ev.timer);
  for (const uid of changedIn(ev)) {
    const later = pending.some((p) => changedIn(p).includes(uid));
    if (later) shown.set(uid, ev.after.get(uid)!); else shown.delete(uid);
    const a = ev.before.get(uid)!, b = ev.after.get(uid)!;
    if (uid === -1) {
      if (b.hp < a.hp) {
        ui.playerHit = a.hp - b.hp;
        pushFloat(-1, { n: a.hp - b.hp, el: 'neutre' });
        if (b.hp > 0) stage.hurt();
      } else if (b.hp > a.hp) pushFloat(-1, { n: b.hp - a.hp, el: 'soin' });
      if (b.block > a.block && ev.el) pushFloat(-1, { n: 0, el: 'armure', text: `+${b.block - a.block}` });
    } else if (b.hp < a.hp) {
      ui.hit.add(uid);
      pushFloat(uid, { n: a.hp - b.hp, el: ev.el ?? 'feu' });
    } else if (ev.el && b.block < a.block) pushFloat(uid, { n: 0, el: 'armure', text: 'Bloqué' });
  }
}

/** Tous les impacts en attente, tout de suite (avant le tour des monstres). */
function flushImpacts(): void {
  for (const ev of [...pending]) resolve(ev);
}

/** Fin de combat : on attend le dernier impact, on laisse la scène visible un instant, puis on passe à la suite. */
function settle(): void {
  const run = ui.run;
  const c = run?.combat;
  if (!run || !c || c.outcome === 'ongoing') return;
  ui.busy = true;
  if (pending.length || ui.ending) return;
  ui.ending = true;
  if (c.outcome === 'lost') stage.die();
  setTimeout(() => {
    ui.ending = false;
    ui.busy = false;
    shown.clear();
    run.checkCombatEnd();
    render();
  }, !stage.visible ? 0 : c.outcome === 'lost' ? 1800 : 1000);
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** La carte quitte la main et file vers sa cible (ou vers le personnage), puis s'efface dans un éclat. */
function flyCard(index: number, to: { x: number; y: number }, ms: number): void {
  const src = root.querySelector(`.hand .card[data-index="${index}"]`) as HTMLElement | null;
  if (!src || reduceMotion()) return;
  const r = src.getBoundingClientRect();
  const ghost = src.cloneNode(true) as HTMLElement;
  ghost.classList.remove('dragging', 'aiming', 'will-play', 'sel');
  ghost.classList.add('card-flying');
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, transform: 'none' });
  document.body.appendChild(ghost);
  const dx = to.x - (r.left + r.width / 2), dy = to.y - (r.top + r.height / 2);
  const tilt = dx > 0 ? 14 : -14;
  const anim = ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(.62) rotate(${tilt}deg)`, opacity: 1, filter: 'brightness(1.25)', offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(${tilt * 2}deg)`, opacity: 0, filter: 'brightness(2.2)' },
  ], { duration: Math.max(240, Math.min(ms, 650)), easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
  anim.onfinish = () => ghost.remove();
}

/** Point d'impact d'un monstre à l'écran (bas de son illustration). */
function enemyPoint(uid: number): { x: number; y: number } | null {
  const el = root.querySelector(`.enemy[data-uid="${uid}"] .enemy-pic`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom - r.height * 0.06 };
}

/** Joue une carte : la logique s'applique tout de suite, l'animation part, l'affichage suit à l'impact. */
function playCard(index: number, target?: number): void {
  const run = ui.run!;
  const c = run.combat!;
  if (ui.busy || !c.hand[index]) return;
  const inst = c.hand[index];
  const def = c.cardDef(inst);
  if (c.costOf(inst) > c.player.energy) return;
  const living = c.living();
  const uid = def.target === 'enemy' ? (target ?? living[0]?.uid) : undefined;
  const points = (def.target === 'enemy' ? [uid as number] : def.target === 'all_enemies' ? living.map((e) => e.uid) : [])
    .map(enemyPoint).filter((p): p is { x: number; y: number } => !!p);
  const delay = stage.visible ? stage.cast(def, points, def.target === 'self') : 0;
  const p = stage.player;
  ui.flying.add(inst.uid);
  flyCard(index, points[0] ?? { x: p.x, y: p.y - p.h * 0.55 }, delay);
  ui.selecting = null;
  const before = snapshot();
  try { c.playCard(index, uid); } catch (err) { console.error(err); }
  schedule(before, snapshot(), def.element, delay);
  settle();
}

function endTurn(): void {
  if (ui.busy) return;
  const c = ui.run!.combat!;
  flushImpacts();
  for (const e of c.living()) if (c.intent(e).damage > 0) ui.lunge.add(e.uid);
  const before = snapshot();
  c.endTurn();
  schedule(before, snapshot(), undefined, 0);
  settle();
}

function select(index: number): void {
  const c = ui.run!.combat!;
  if (ui.busy) return;
  const target = c.cardDef(c.hand[index]).target;
  if (c.costOf(c.hand[index]) > c.player.energy) return;
  const living = c.living();
  if (target === 'enemy' && living.length > 1) {
    ui.selecting = ui.selecting?.index === index ? null : { kind: 'card', index };
    return;
  }
  playCard(index, target === 'enemy' ? living[0].uid : undefined);
}

function handle(act: string, d: DOMStringMap): void {
  const run = ui.run;
  if (bestiaryAct(act, d)) return;
  switch (act) {
    case 'bestiary':
      ui.selecting = null;
      ui.modal = null;
      location.hash = '#bestiaire';
      break;
    case 'bx-close':
      history.replaceState(null, '', location.pathname + location.search);
      break;
    case 'new-run': {
      const classe = d.classe as 'iop' | 'cra';
      ui.run = new Run(classe, (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0, ui.gender[classe]);
      ui.modal = null;
      break;
    }
    case 'color-reset':
      delete ui.colors[`${d.classe}${d.g}`];
      saveColors();
      break;
    case 'pick-class':
      ui.pick = d.classe === 'cra' ? 'cra' : 'iop';
      try { localStorage.setItem('slay.pick', ui.pick); } catch { /* stockage indisponible */ }
      break;
    case 'look-toggle':
      ui.lookOpen = !ui.lookOpen;
      break;
    case 'gender':
      ui.gender[d.classe as 'iop' | 'cra'] = d.g === 'f' ? 'f' : 'm';
      try { localStorage.setItem('slay.gender', JSON.stringify(ui.gender)); } catch { /* stockage indisponible */ }
      break;
    case 'title':
      ui.run = null;
      ui.modal = null;
      break;
    case 'go':
      run!.enterNode(d.id!);
      break;
    case 'play':
      select(Number(d.index));
      break;
    case 'target': {
      const s = ui.selecting;
      if (s) playCard(s.index, Number(d.uid));
      break;
    }
    case 'cancel':
      ui.selecting = null;
      break;
    case 'end-turn':
      endTurn();
      break;
    case 'toggle-log':
      ui.logOpen = !ui.logOpen;
      break;
    case 'pile':
      ui.modal = { kind: 'pile', pile: d.pile as 'draw' | 'discard' | 'exhaust' };
      break;
    case 'take-card':
      run!.takeCard(d.id!);
      break;
    case 'take-item':
      run!.takeItem(d.id!);
      break;
    case 'leave-reward':
      run!.leaveReward();
      break;
    case 'zaap-rest':
      run!.zaapRest();
      break;
    case 'modal-deck':
      ui.modal = { kind: 'deck' };
      break;
    case 'modal-upgrade':
      ui.modal = { kind: 'upgrade' };
      break;
    case 'zaap-upgrade':
      run!.zaapUpgrade(Number(d.uid));
      ui.modal = null;
      break;
    case 'buy-card':
      run!.buyCard(d.id!);
      break;
    case 'buy-item':
      run!.buyItem(d.id!);
      break;
    case 'modal-remove':
      ui.modal = { kind: 'remove' };
      break;
    case 'remove-card':
      run!.removeCard(Number(d.uid));
      ui.modal = null;
      break;
    case 'leave-shop':
      run!.leaveShop();
      break;
    case 'take-dofus':
      run!.takeDofus(d.id!);
      break;
    case 'leave-zaap':
      run!.leaveZaap();
      break;
    case 'close-modal':
      ui.modal = null;
      break;
  }
}

// ───────────── glisser-déposer des cartes ─────────────
// Carte à cible : elle se lève et une flèche suit le pointeur jusqu'au monstre visé.
// Carte sans cible : elle suit le pointeur ; lâchée au-dessus de la main, elle est jouée.

interface Drag { index: number; target: string; el: HTMLElement; x0: number; y0: number; moved: boolean; over: number | null }
let drag: Drag | null = null;
let suppressClick = false;
const PLAY_LINE = 0.62;

const aim = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'aim');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<defs><marker id="aim-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><path class="aim-path" marker-end="url(#aim-head)"/>';
  document.body.appendChild(svg);
  const path = svg.querySelector('.aim-path') as SVGPathElement;
  return {
    show(x1: number, y1: number, x2: number, y2: number) {
      svg.classList.add('on');
      const cx = (x1 + x2) / 2, cy = Math.min(y1, y2) - 120;
      path.setAttribute('d', `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`);
    },
    hide() { svg.classList.remove('on'); },
  };
})();

document.addEventListener('pointerdown', (ev) => {
  const el = (ev.target as HTMLElement).closest('.hand .card') as HTMLButtonElement | null;
  const c = ui.run?.combat;
  if (!el || !c || ui.busy || el.disabled || ev.button !== 0) return;
  const index = Number(el.dataset.index);
  drag = { index, target: c.cardDef(c.hand[index]).target, el, x0: ev.clientX, y0: ev.clientY, moved: false, over: null };
});

document.addEventListener('pointermove', (ev) => {
  const d = drag;
  if (!d) return;
  const dx = ev.clientX - d.x0, dy = ev.clientY - d.y0;
  if (!d.moved) {
    if (Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    ui.selecting = null;
    document.body.classList.add('is-dragging');
    d.el.classList.add(d.target === 'enemy' ? 'aiming' : 'dragging');
  }
  if (d.target === 'enemy') {
    const r = d.el.getBoundingClientRect();
    aim.show(r.left + r.width / 2, r.top + 10, ev.clientX, ev.clientY);
    const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.enemy:not(.dead)') as HTMLElement | null;
    root.querySelectorAll('.enemy.aimed').forEach((e) => e.classList.remove('aimed'));
    if (under) under.classList.add('aimed');
    d.over = under ? Number(under.dataset.uid) : null;
  } else {
    d.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    d.el.classList.toggle('will-play', ev.clientY < window.innerHeight * PLAY_LINE);
  }
});

function endDrag(ev: PointerEvent): void {
  const d = drag;
  if (!d) return;
  drag = null;
  aim.hide();
  document.body.classList.remove('is-dragging');
  if (!d.moved) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  if (d.target === 'enemy' ? d.over !== null : ev.clientY < window.innerHeight * PLAY_LINE) {
    playCard(d.index, d.target === 'enemy' ? (d.over as number) : undefined);
  }
  render();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', (ev) => { if (drag) { drag.moved = false; endDrag(ev); render(); } });

document.addEventListener('click', (ev) => {
  if (suppressClick) { suppressClick = false; return; }
  const el = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) {
    // Clic hors d'une cible pendant le ciblage : on annule.
    if (ui.selecting && !(ev.target as HTMLElement).closest('.hand')) {
      ui.selecting = null;
      render();
    }
    return;
  }
  try {
    handle(el.dataset.act as string, el.dataset);
  } catch (err) {
    console.error(err);
  }
  render();
});

// Infobulles d'effets : on les garde dans l'écran (décalage horizontal, ou vers le bas près du haut de l'écran).
function placeFxTip(b: HTMLElement): void {
  const tip = b.querySelector(':scope > .fxtip') as HTMLElement | null;
  if (!tip) return;
  tip.style.setProperty('--dx', '0px');
  const r = tip.getBoundingClientRect();
  const dx = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
  tip.style.setProperty('--dx', `${Math.round(dx)}px`);
  if (r.top < 8 && !tip.classList.contains('down')) tip.classList.add('down');
}
document.addEventListener('pointerover', (ev) => {
  const b = (ev.target as HTMLElement).closest?.('.fxb, .hastip') as HTMLElement | null;
  if (b) requestAnimationFrame(() => placeFxTip(b));
});
document.addEventListener('focusin', (ev) => {
  const b = (ev.target as HTMLElement).closest?.('.fxb, .hastip') as HTMLElement | null;
  if (b) requestAnimationFrame(() => placeFxTip(b));
});

let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = window.setTimeout(() => { if (ui.run?.phase === 'combat' && !drag) render(); }, 120);
});

// Couleurs du personnage : la pastille suit le curseur tout de suite, l'aperçu se recalcule quand on s'arrête.
let colorT = 0;
document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.matches?.('[data-color]')) return;
  const key = `${el.dataset.color}${el.dataset.g}`, i = Number(el.dataset.i);
  (el.parentElement as HTMLElement).style.setProperty('--c', el.value);
  clearTimeout(colorT);
  colorT = window.setTimeout(() => {
    const cur = (ui.colors[key] ?? [null, null, null, null, null]).slice();
    cur[i] = parseInt(el.value.slice(1), 16);
    ui.colors[key] = cur;
    saveColors();
  }, 160);
});
document.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.matches?.('[data-color]')) window.setTimeout(render, 200);
});

document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.matches?.('[data-bx-q]')) return;
  bestiarySearch(el.value);
  render();
});

document.addEventListener('keydown', (ev) => {
  if (location.hash === '#bestiaire') {
    const inField = (ev.target as HTMLElement)?.matches?.('[data-bx-q]');
    // « / » ou Ctrl+F : aller à la recherche. Échap dans le champ : vider la recherche avant de quitter.
    if (!inField && (ev.key === '/' || ((ev.ctrlKey || ev.metaKey) && ev.key === 'f'))) {
      ev.preventDefault();
      (root.querySelector('[data-bx-q]') as HTMLInputElement | null)?.focus();
      return;
    }
    if (ev.key === 'Escape' && inField && bx.q) {
      ev.preventDefault();
      bestiarySearch('');
      bx.focus = true;
      render();
      return;
    }
  }
  if (ev.key === 'Escape' && location.hash === '#bestiaire') {
    history.replaceState(null, '', location.pathname + location.search);
    render();
    return;
  }
  if (ev.key === 'Escape') {
    if (ui.modal) ui.modal = null;
    else ui.selecting = null;
    render();
    return;
  }
  const run = ui.run;
  if (!run || run.phase !== 'combat' || ui.modal || location.hash === '#bestiaire') return;
  if (ev.key >= '1' && ev.key <= '9') {
    const i = Number(ev.key) - 1;
    if (i < run.combat!.hand.length) {
      select(i);
      render();
    }
  } else if (ev.key === 'e' || ev.key === 'E') {
    handle('end-turn', {});
    render();
  }
});

// Fichier d'équilibrage : le jeu relit equilibrage.json au démarrage (une modification faite sur GitHub s'applique
// sans reconstruire). En cas d'erreur, les valeurs intégrées restent en place et la console dit pourquoi.
if (balanceWarnings.length) console.warn('equilibrage.json (intégré) :', balanceWarnings);
void fetch('equilibrage.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((b) => {
    const w = applyBalance(b, BALANCE_TARGETS);
    if (w.length) console.warn('equilibrage.json : valeurs ignorées', w);
    if (!drag && !ui.busy) render();
  })
  .catch((e) => console.warn("equilibrage.json non relu, valeurs intégrées utilisées :", e));

// Accès de débogage / tests automatisés (Playwright).
(window as unknown as { __game: unknown }).__game = {
  get run() { return ui.run; },
  newRun(classe: ClassId, seed: number, gender: 'm' | 'f' = 'm') { ui.run = new Run(classe, seed, gender); ui.modal = null; ui.selecting = null; render(); },
  playCard, endTurn, stage, drawAnim, items: ITEMS,
  get busy() { return ui.busy; },
  render,
};

window.addEventListener('hashchange', render);
render();
// Artwork officiel des Dofus : chargé en arrière-plan, l'écran se redessine s'il en affiche.
