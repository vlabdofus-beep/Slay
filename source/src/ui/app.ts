// Interface du jeu : rendu DOM simple (re-rendu complet à chaque action) + délégation d'événements.
// Toute la logique est dans src/game/run.ts et src/core ; ce fichier ne fait qu'afficher et relayer.
import { BASE_ENERGY, resolveCard, type Enemy } from '../core/combat.ts';
import { PALIERS, PASSIVE_BY_PALIER, type ElementalElement } from '../core/loadout.ts';
import type { MapNode } from '../core/map.ts';
import type { CardDef, CardInstance, ClassId, Element, ItemDef, StatusMap } from '../core/types.ts';
import { ELEMENTS, SLOTS } from '../core/types.ts';
import { DOFUS } from '../data/dofus.ts';
import { ITEMS } from '../data/items.ts';
import { CLASS_START_HP, LIBRARY } from '../data/library.ts';
import { ACT1_SCALE, ENCOUNTERS } from '../data/monsters.ts';
import { Run, ZAAP_HEAL } from '../game/run.ts';
import {
  activeText, cardText, ELEMENT_NAMES, esc, intentSummary, moveDetail, STATUS_INFO, statsText,
} from './describe.ts';
import { buildCharacter, drawAnim, type Character } from './scene/rt.js';
import { BREED, STAGE, stage } from './scene/stage.ts';

// ───────────── état de l'interface ─────────────

type Selecting = { kind: 'card' | 'active'; index: number } | null;
type Modal = null | { kind: 'deck' } | { kind: 'upgrade' } | { kind: 'forge'; uid?: number } | { kind: 'pile'; pile: 'draw' | 'discard' | 'exhaust' };

const ui = {
  run: null as Run | null,
  selecting: null as Selecting,
  modal: null as Modal,
  logOpen: false,
  hit: new Set<number>(),
  playerHit: 0,
  /** Animation en cours : les actions de combat attendent l'impact. */
  busy: false,
  /** Carte en train d'être lancée (masquée de la main jusqu'à l'impact). */
  casting: -1,
  /** Monstres qui viennent d'attaquer (petit élan vers le joueur). */
  lunge: new Set<number>(),
  gender: loadGender(),
};

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
const PASSIVE_TEXT: Record<ElementalElement, (v: number) => string> = {
  terre: (v) => `Chaque carte Terre donne ${v} armure.`,
  feu: (v) => `Les attaques Feu appliquent ${v} Brûlure.`,
  eau: (v) => `Les attaques Eau soignent ${v} PV.`,
  air: (v) => `Les ${v > 1 ? `${v} premières cartes` : 'première carte'} Air du tour ${v > 1 ? 'piochent' : 'pioche'} 1 carte.`,
};

// ───────────── petits composants ─────────────

const elIcon = (el: Element | 'multi', cls = 'el-ico') =>
  `<img class="${cls}" src="${asset(`elements/${el}.png`)}" alt="${el === 'multi' ? 'Multi' : ELEMENT_NAMES[el]}" title="${el === 'multi' ? 'Multi' : ELEMENT_NAMES[el]}">`;

function pic(src: string | undefined, label: string, cls: string): string {
  const initials = label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
  return `<span class="pic ${cls}"><span class="pic-fb" aria-hidden="true">${esc(initials)}</span>${
    src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}

function bar(value: number, max: number, cls: string, extra = ''): string {
  const pct = Math.max(0, Math.min(100, (100 * value) / Math.max(1, max)));
  return `<span class="bar ${cls}"><span class="bar-fill" style="width:${pct}%"></span><span class="bar-label">${value} / ${max}${extra}</span></span>`;
}

function statusChips(st: StatusMap): string {
  return Object.entries(st)
    .filter(([, v]) => v && v > 0)
    .map(([id, v]) => {
      const info = STATUS_INFO[id as keyof typeof STATUS_INFO];
      return `<span class="chip st-${id}" title="${esc(`${info.name} : ${info.help}`)}">${esc(info.name)} ${v}</span>`;
    })
    .join('');
}

const TYPE_NAMES = { attaque: 'Attaque', competence: 'Compétence' };

function cardHtml(def: CardDef, opts: { inst?: CardInstance; act?: string; data?: string; disabled?: boolean; selected?: boolean; live?: boolean; hint?: string } = {}): string {
  const c = opts.live ? ui.run?.combat ?? null : null;
  const upgraded = opts.inst?.upgraded;
  const forged = opts.inst?.element && opts.inst.element !== LIBRARY.cards[opts.inst.id].element;
  const attrs = opts.act ? `data-act="${opts.act}" ${opts.data ?? ''}` : '';
  const tag = opts.act ? 'button' : 'div';
  const lore = def.lore ? ` title="${esc(def.lore)}"` : '';
  return `<${tag} class="card el-${def.element} rar-${def.rarity}${upgraded ? ' upg' : ''}${opts.selected ? ' sel' : ''}${opts.disabled ? ' off' : ''}" ${attrs}${opts.disabled && tag === 'button' ? ' disabled' : ''}${lore}>
    <span class="card-cost" aria-label="${def.cost} PA">${def.cost}</span>
    <span class="card-art">${pic(def.icon, def.name, 'card-pic')}</span>
    <span class="card-name">${esc(def.name)}${upgraded ? '+' : ''}</span>
    <span class="card-type">${elIcon(def.element, 'el-mini')}${TYPE_NAMES[def.type]} ${ELEMENT_NAMES[def.element]}${forged ? ' (forgemagée)' : ''}</span>
    <span class="card-text">${cardText(def, c)}</span>
    ${opts.hint ? `<span class="card-hint">${opts.hint}</span>` : ''}
  </${tag}>`;
}

function itemTile(it: ItemDef, opts: { act?: string; taken?: boolean; dim?: boolean } = {}): string {
  const run = ui.run;
  const current = run?.equipment[it.slot];
  const replaces = current && current !== it.id ? ITEMS.items[current] : null;
  const set = it.panoplie ? ITEMS.panoplies[it.panoplie] : null;
  const owned = set && run ? set.items.filter((id) => Object.values(run.equipment).includes(id)).length : 0;
  const els = it.elements.length ? it.elements.map((e) => elIcon(e, 'el-mini')).join('') : elIcon('neutre', 'el-mini');
  const tag = opts.act ? 'button' : 'div';
  return `<${tag} class="item rar-${it.rarity}${opts.taken ? ' taken' : ''}${opts.dim ? ' off' : ''}" ${opts.act ? `data-act="${opts.act}" data-id="${it.id}"` : ''}${opts.dim && tag === 'button' ? ' disabled' : ''}>
    ${pic(it.icon, it.name, 'item-pic')}
    <span class="item-body">
      <span class="item-name">${esc(it.name)}</span>
      <span class="item-meta">${SLOT_NAMES[it.slot]} ${els}${it.rarity === 'rare' ? ' <em>rare</em>' : ''}</span>
      <span class="item-stats">${statsText(it.stats).map((s) => `<span>${esc(s)}</span>`).join('')}</span>
      ${it.active ? `<span class="item-active"><b>${esc(it.active.name)}</b> ${activeText(it.active)}</span>` : ''}
      ${set ? `<span class="item-set">${esc(set.name)} ${owned}/${set.items.length}</span>` : ''}
      ${replaces ? `<span class="item-replace">Remplace ${esc(replaces.name)}</span>` : ''}
    </span>
  </${tag}>`;
}

// ───────────── fiche du personnage (carte, récompense, Zaap) ─────────────

function sheet(run: Run): string {
  const l = run.loadout();
  const breed = DOFUS.breeds[run.classe];
  const slots = SLOTS.map((slot) => {
    const id = run.equipment[slot];
    const it = id ? ITEMS.items[id] : null;
    return `<span class="slot${it ? '' : ' empty'}" title="${esc(it ? `${it.name} : ${statsText(it.stats).join(', ')}` : SLOT_NAMES[slot])}">
      ${it ? pic(it.icon, it.name, 'slot-pic') : `<span class="slot-name">${SLOT_NAMES[slot]}</span>`}</span>`;
  }).join('');
  const sets = Object.entries(l.sets).map(([id, n]) => {
    const p = ITEMS.panoplies[id];
    const active = Object.keys(p.bonuses).map(Number).filter((t) => n >= t);
    return `<li>${esc(p.name)} <span class="muted">${n}/${p.items.length}</span>${active.length ? ` <span class="ok">bonus ${active.join(' et ')} pièces</span>` : ''}</li>`;
  }).join('');
  const aff = (ELEMENTS as ElementalElement[]).map((el) => {
    const pts = l.affinity[el];
    const pal = l.paliers[el];
    const max = PALIERS[PALIERS.length - 1];
    const ticks = PALIERS.map((t) => `<i style="left:${(100 * t) / max}%"></i>`).join('');
    const txt = pal ? PASSIVE_TEXT[el](PASSIVE_BY_PALIER[el][pal]) : `Palier 1 à ${PALIERS[0]} points.`;
    return `<li class="aff el-${el}">${elIcon(el, 'el-mini')}<span class="aff-bar"><span style="width:${Math.min(100, (100 * pts) / max)}%"></span>${ticks}</span><span class="aff-pts">${pts}</span><span class="aff-txt">${txt}</span></li>`;
  }).join('');
  return `<aside class="sheet">
    <div class="who"><img class="who-pic" src="${asset(`classes/${breed.id}.png`)}" alt=""><span><b>${esc(breed.n)}</b><span class="muted">${run.stats.floor ? `Étage ${run.stats.floor} sur ${run.map.floors}` : 'Au départ'}</span></span></div>
    ${bar(run.hp, run.maxHp, 'hp')}
    <button class="link" data-act="modal-deck">Voir le deck (${run.deck.length} cartes)</button>
    <h3>Équipement</h3><div class="slots">${slots}</div>
    ${sets ? `<ul class="sets">${sets}</ul>` : ''}
    <h3>Affinités</h3><ul class="affs">${aff}</ul>
    ${l.passives.prisme ? `<p class="prisme">Prisme ${l.passives.prisme} : +${l.passives.prisme} dégâts par élément différent déjà joué ce tour.</p>` : ''}
  </aside>`;
}

// ───────────── écrans ─────────────

function viewTitle(): string {
  const choice = (id: 'iop' | 'cra') => {
    const b = DOFUS.breeds[id];
    const g = ui.gender[id];
    const radio = (v: 'm' | 'f', label: string) =>
      `<button role="radio" aria-checked="${g === v}" class="${g === v ? 'on' : ''}" data-act="gender" data-classe="${id}" data-g="${v}">${label}</button>`;
    return `<div class="class-pick" style="--accent: var(${id === 'iop' ? '--pourpre' : '--emeraude'})">
      <div class="class-stage"><canvas class="class-preview" data-preview="${id}" width="440" height="440" aria-hidden="true"></canvas>
        <img class="class-symbol" src="${asset(`classes/${b.id}.png`)}" alt=""></div>
      <span class="class-name">${esc(b.n)}</span>
      <span class="class-hp">${CLASS_START_HP[id]} PV</span>
      <span class="class-pitch">${CLASS_INFO[id].pitch}</span>
      <div class="gender" role="radiogroup" aria-label="Apparence du personnage">${radio('m', 'Homme')}${radio('f', 'Femme')}</div>
      <button class="primary" data-act="new-run" data-classe="${id}">Jouer ${id === 'iop' ? "l'Iop" : 'le Crâ'}</button>
    </div>`;
  };
  return `<main class="title">
    <h1 class="brand-name big">Dofus Slay</h1>
    <p class="brand-sub">Un deckbuilder dans le Monde des Douze</p>
    <p class="lead">Traverse Amakna jusqu'au Bouftou Royal. Chaque combat t'offre une carte, et parfois un objet : construis ta voie élémentaire.</p>
    <div class="class-row">${choice('iop')}${choice('cra')}</div>
    <p class="fine">Fan game non officiel. Données issues de DofusDB, animations et décors de Dofus 3, univers © Ankama. <a class="link" href="#styleguide">Guide de style</a></p>
  </main>`;
}

// Aperçus animés de l'écran titre
const previews: Record<string, Character | null | 'loading'> = {};
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
      const key = `${id}${ui.gender[id]}`;
      if (!(key in previews)) {
        previews[key] = 'loading';
        void buildCharacter(BREED[id], ui.gender[id]).then((ch) => { previews[key] = ch; });
      }
      const ch = previews[key];
      const x = cv.getContext('2d')!;
      x.clearRect(0, 0, cv.width, cv.height);
      if (ch && ch !== 'loading') {
        cv.parentElement!.classList.add('ready');
        drawAnim(x, ch, 'idle', (performance.now() - t0) / 1000, cv.width / 2, cv.height * 0.93, cv.height * 0.7);
      } else cv.parentElement!.classList.remove('ready');
    }
  };
  previewRaf = requestAnimationFrame(loop);
}

const NODE_LABEL: Record<MapNode['type'], string> = { combat: 'Combat', elite: 'Élite', zaap: 'Zaap', boss: 'Boss' };
const NODE_ICON: Record<MapNode['type'], string> = {
  combat: '<svg viewBox="0 0 24 24"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"/></svg>',
  elite: '<svg viewBox="0 0 24 24"><path d="M5 3l3 5h8l3-5M6 9a6 6 0 0012 0M9 13h.01M15 13h.01M10 17h4M8 9v9h8V9"/></svg>',
  zaap: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  boss: '',
};

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
  const kind = n.type === 'boss' ? 'Boss' : n.type === 'elite' ? 'Élite' : n.type === 'zaap' ? 'Zaap' : n.floor < 4 ? 'Combat facile' : 'Combat';
  let body: string;
  if (n.type === 'zaap') {
    body = `<p class="tip-text">Une halte avant de repartir. Une action au choix :</p>
      <ul class="tip-list"><li>se reposer et récupérer ${Math.round(run.maxHp * ZAAP_HEAL)} PV</li><li>améliorer une carte</li><li>forgemagie : changer l'élément d'une carte</li></ul>`;
  } else {
    const mobs = encounterGroups(run.encounters[n.id]).map(({ def, count }) => {
      const weak = def.weak.map((el) => elIcon(el, 'el-mini')).join('');
      const resist = def.resist.map((el) => elIcon(el, 'el-mini')).join('');
      return `<li>${pic(def.image, def.name, 'tip-pic')}
        <span class="tip-mob"><b>${esc(def.name)}${count > 1 ? ` ×${count}` : ''}</b><span>${hpRange(def.hp)} PV${def.level ? `, niveau ${def.level[0]}` : ''}</span></span>
        <span class="tip-aff">${weak ? `<span title="Faible : +50 % de dégâts">Faible ${weak}</span>` : ''}${resist ? `<span title="Résiste : −50 % de dégâts">Résiste ${resist}</span>` : ''}${!weak && !resist ? '<span>Aucune faiblesse</span>' : ''}</span>
      </li>`;
    }).join('');
    const reward = n.type === 'boss' ? 'Le vaincre termine l\'acte.'
      : n.type === 'elite' ? 'Récompense : une carte, plus souvent rare, et un objet rare.'
      : 'Récompense : une carte. Un objet tous les deux combats.';
    body = `<ul class="tip-mobs">${mobs}</ul><p class="tip-text">${reward}</p>`;
  }
  const side = n.type === 'boss' ? 'tip-below'
    : `${n.col >= 3 ? 'tip-left' : 'tip-right'}${n.floor <= 2 ? ' tip-up' : n.floor >= 11 ? ' tip-down' : ''}`;
  return `<div class="tip ${side}" role="tooltip"><p class="tip-head"><b>${kind}</b><span>Étage ${n.floor}</span></p>${body}</div>`;
}

function viewMap(run: Run): string {
  const m = run.map;
  const W = 104, H = 74, GUTTER = 64, TOP = 176, BOTTOM = 70, BOSS_Y = 64;
  const pos = (n: MapNode) => ({ x: GUTTER + n.col * W, y: n.type === 'boss' ? BOSS_Y : TOP + (m.floors - 1 - n.floor) * H });
  const width = GUTTER * 2 + (m.cols - 1) * W;
  const height = TOP + (m.floors - 2) * H + BOTTOM;
  const avail = new Set(run.availableNodes());
  const visited = new Set(run.path);
  const step = (a: string, b: string) => run.path.indexOf(b) === run.path.indexOf(a) + 1 && run.path.includes(a);
  const lines = Object.values(m.nodes).flatMap((n) => n.next.map((id) => {
    const a = pos(n), b = pos(m.nodes[id]);
    const cls = visited.has(id) && step(n.id, id) ? 'walked' : n.id === run.position && avail.has(id) ? 'next' : '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${cls}"/>`;
  })).join('');
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
  return `<main class="mapview">
    <section class="map-wrap">
      <header class="map-head"><h2>Amakna</h2><p>Choisis ta route. Survole une case pour voir ce qui t'y attend.</p></header>
      <div class="map-scroll"><div class="map" style="width:${width}px;height:${height}px">
        <svg width="${width}" height="${height}" aria-hidden="true">${lines}</svg>
        ${floors}
        ${run.position === null ? `<span class="start-label" style="top:${TOP + (m.floors - 2) * H + 38}px">Départ</span>` : ''}
        ${nodes}
      </div></div>
      <ul class="legend">${(['combat', 'elite', 'zaap'] as const).map((t) => `<li><span class="node mini t-${t}">${NODE_ICON[t]}</span>${NODE_LABEL[t]}</li>`).join('')}<li><span class="node mini t-boss"><img src="${asset('ui/boss.png')}" alt=""></span>Boss</li></ul>
    </section>
    ${sheet(run)}
  </main>`;
}

function enemyHtml(e: Enemy, targeting: boolean): string {
  const c = ui.run!.combat!;
  const it = intentSummary(c, e);
  const weak = e.def.weak.map((el) => elIcon(el, 'el-mini')).join('');
  const resist = e.def.resist.map((el) => elIcon(el, 'el-mini')).join('');
  const can = targeting && !e.dead;
  return `<button class="enemy${e.dead ? ' dead' : ''}${can ? ' targetable' : ''}${ui.hit.has(e.uid) ? ' hit' : ''}${ui.lunge.has(e.uid) ? ' lunge' : ''}" data-uid="${e.uid}" ${can ? 'data-act="target"' : 'tabindex="-1"'} aria-label="${esc(e.def.name)}">
    ${e.dead ? '' : `<span class="intent i-${it.kind}" title="${esc(`${e.def.moves[e.moveId].name} : ${moveDetail(e)}`)}">${it.kind === 'attack' ? `<svg viewBox="0 0 24 24"><path d="M5 19L19 5m-4 0h4v4"/></svg>` : ''}${esc(it.label)}</span>`}
    ${pic(e.def.image, e.def.name, 'enemy-pic')}
    <span class="enemy-under">
      <span class="enemy-name">${esc(e.def.name)}</span>
      ${bar(e.hp, e.maxHp, 'hp', e.block ? ` <span class="shield">${e.block}</span>` : '')}
      <span class="chips">${statusChips(e.status)}</span>
      <span class="affinity">${weak ? `<span title="Faible : +50 % de dégâts">Faible ${weak}</span>` : ''}${resist ? `<span title="Résiste : −50 % de dégâts">Résiste ${resist}</span>` : ''}</span>
    </span>
  </button>`;
}

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.5 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 4 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';

function viewCombat(run: Run): string {
  const c = run.combat!;
  const p = c.player;
  const enc = run.encounter ? ENCOUNTERS[run.encounter] : null;
  const targeting = ui.selecting !== null;
  const title = enc ? [...new Set(enc.monsters.map((id) => LIBRARY.monsters[id].name))].join(', ') : 'Combat';
  const breed = DOFUS.breeds[run.classe];
  const n = c.hand.length;
  const hand = c.hand.map((inst, i) => {
    const def = c.cardDef(inst);
    const sel = ui.selecting?.kind === 'card' && ui.selecting.index === i;
    const o = i - (n - 1) / 2;
    return `<div class="hand-slot${ui.casting === i ? ' casting' : ''}" style="--o:${o}">${cardHtml(def, { inst, act: 'play', data: `data-index="${i}"`, disabled: def.cost > p.energy, selected: sel, live: true, hint: i < 9 ? String(i + 1) : '' })}</div>`;
  }).join('');
  const actives = p.actives.map((a, i) => `<button class="active${a.used ? ' used' : ''}${ui.selecting?.kind === 'active' && ui.selecting.index === i ? ' sel' : ''}" data-act="active" data-index="${i}" ${a.used ? 'disabled' : ''} title="${esc(activeText(a.def))}">${esc(a.def.name)}</button>`).join('');
  const passives = [
    p.passives.terreArmure && PASSIVE_TEXT.terre(p.passives.terreArmure),
    p.passives.feuBrulure && PASSIVE_TEXT.feu(p.passives.feuBrulure),
    p.passives.eauSoin && PASSIVE_TEXT.eau(p.passives.eauSoin),
    p.passives.airPioche && PASSIVE_TEXT.air(p.passives.airPioche),
    p.passives.prisme && `Prisme ${p.passives.prisme}.`,
  ].filter(Boolean);
  return `<main class="combatview${ui.busy ? ' busy' : ''}">
    <header class="topbar">
      <span class="tb-who"><img src="${asset(`classes/${breed.id}.png`)}" alt=""><b>${esc(breed.n)}</b></span>
      <span class="tb-hp" title="Points de vie">${HEART}${p.hp}/${p.maxHp}</span>
      <span class="tb-floor">Étage ${run.stats.floor}</span>
      <span class="tb-enc"><b>${esc(title)}</b> ${run.node ? NODE_LABEL[run.node.type] : ''}, tour ${c.turn}</span>
      <span class="tb-actions">
        <button class="link" data-act="modal-deck">Deck ${run.deck.length}</button>
        ${c.exhaustPile.length ? `<button class="link" data-act="pile" data-pile="exhaust">Épuisées ${c.exhaustPile.length}</button>` : ''}
        <button class="link" data-act="toggle-log">${ui.logOpen ? 'Masquer le journal' : 'Journal'}</button>
      </span>
    </header>
    <section class="arena${targeting ? ' targeting' : ''}">
      <div class="hero${ui.playerHit ? ' hurt' : ''}" style="left:${STAGE.playerX * 100}%;top:${STAGE.ground * 100}%">
        ${bar(p.hp, p.maxHp, 'hp', p.block ? ` <span class="shield">${p.block}</span>` : '')}
        ${ui.playerHit ? `<span class="dmg-float">−${ui.playerHit}</span>` : ''}
        <span class="chips">${statusChips(p.status)}</span>
        ${passives.length ? `<span class="passives">${passives.join(' ')}</span>` : ''}
      </div>
      <div class="foes" style="height:${STAGE.ground * 100}%">${c.enemies.map((e) => enemyHtml(e, targeting)).join('')}</div>
      ${targeting ? `<p class="prompt">Choisis une cible. <button class="link" data-act="cancel">Annuler</button></p>` : ''}
    </section>
    <footer class="tray">
      <button class="pile pile-draw" data-act="pile" data-pile="draw" title="Pioche : ${c.drawPile.length} cartes"><span>${c.drawPile.length}</span></button>
      <div class="gem${p.energy ? '' : ' empty'}" role="img" aria-label="${p.energy} PA sur ${BASE_ENERGY}"><b>${p.energy}/${BASE_ENERGY}</b><span>PA</span></div>
      ${actives ? `<div class="actives">${actives}</div>` : ''}
      <div class="hand fan${n > 7 ? ' crowded' : ''}">${hand || '<p class="muted">Main vide.</p>'}</div>
      <button class="end-turn" data-act="end-turn">Finir le tour</button>
      <button class="pile pile-discard" data-act="pile" data-pile="discard" title="Défausse : ${c.discardPile.length} cartes"><span>${c.discardPile.length}</span></button>
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
      <h2>Victoire</h2>
      <p class="muted">Il te reste ${run.hp} PV sur ${run.maxHp}.</p>
      <h3>${r.cardTaken ? 'Carte ajoutée au deck' : 'Ajoute une carte à ton deck'}</h3>
      <div class="row cards">${cards}</div>
      ${items ? `<h3>${r.itemTaken ? 'Objet équipé' : r.itemRarity === 'rare' ? 'Choisis un objet rare' : 'Choisis un objet'}</h3><div class="row items">${items}</div>` : ''}
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
      <h2>Zaap</h2>
      <p class="muted">Une halte avant de repartir. Une seule action possible.</p>
      <div class="row options">
        <button class="option" data-act="zaap-rest" ${used || heal === 0 ? 'disabled' : ''}><b>Se reposer</b><span>Récupère ${heal} PV.</span></button>
        <button class="option" data-act="modal-upgrade" ${used || run.deck.every((c) => c.upgraded) ? 'disabled' : ''}><b>Améliorer une carte</b><span>Une carte de ton deck devient sa version +.</span></button>
        <button class="option" data-act="modal-forge" ${used ? 'disabled' : ''}><b>Forgemagie</b><span>Change l'élément d'une carte pour nourrir une voie.</span></button>
      </div>
      <button class="primary" data-act="leave-zaap">${used ? 'Reprendre la route' : 'Repartir sans rien faire'}</button>
    </section>
    ${sheet(run)}
  </main>`;
}

function viewEnd(run: Run): string {
  const won = run.phase === 'victory';
  return `<main class="endview">
    <section class="end">
      <h2>${won ? 'Le Bouftou Royal est tombé' : 'Défaite'}</h2>
      <p>${won ? 'Amakna est libérée. La suite du voyage arrive avec les prochains actes.' : `Tu es tombé à l'étage ${run.stats.floor}.`}</p>
      <p class="muted">${run.stats.combats} combats gagnés, dont ${run.stats.elites} élites. Deck de ${run.deck.length} cartes, ${Object.keys(run.equipment).length} objets équipés.</p>
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
  } else if (m.kind === 'upgrade') {
    title = 'Améliorer une carte';
    body = run.deck.filter((c) => !c.upgraded).map((inst) =>
      cardHtml(resolveCard(LIBRARY, { ...inst, upgraded: true }), { inst: { ...inst, upgraded: true }, act: 'zaap-upgrade', data: `data-uid="${inst.uid}"` })).join('');
  } else if (m.kind === 'forge') {
    if (m.uid === undefined) {
      title = 'Forgemagie : choisis une carte';
      body = run.deck.map((inst) => cardHtml(resolveCard(LIBRARY, inst), { inst, act: 'forge-pick', data: `data-uid="${inst.uid}"` })).join('');
    } else {
      const inst = run.deck.find((c) => c.uid === m.uid)!;
      const def = resolveCard(LIBRARY, inst);
      title = `Forgemagie : ${def.name}`;
      body = `<div class="forge">${cardHtml(def, { inst })}<div class="forge-els">${(ELEMENTS as Element[]).filter((el) => el !== def.element).map((el) =>
        `<button class="forge-el el-${el}" data-act="zaap-forge" data-uid="${inst.uid}" data-el="${el}">${elIcon(el)}${ELEMENT_NAMES[el]}</button>`).join('')}</div></div>`;
    }
  }
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-box">
    <header><h2>${esc(title)}</h2><button class="link" data-act="close-modal">Fermer</button></header>
    <div class="modal-grid">${body}</div></div></div>`;
}

// ───────────── guide de style (#styleguide) ─────────────

const SWATCHES: { title: string; items: [string, string, string][] }[] = [
  { title: 'Base', items: [
    ['--bg', '#172129', 'Encre de Brâkmar, fond'], ['--panel', '#1f2c35', "Pierre d'Astrub, cadres"], ['--panel-2', '#283a45', 'Pierre claire'],
    ['--panel-deep', '#131c23', 'Creux, champs'], ['--line', '#3a4d58', 'Bordures'], ['--text', '#efe3c8', 'Vélin, texte'], ['--muted', '#9fae9f', 'Texte secondaire'],
  ] },
  { title: 'Or, pour ce qui se joue', items: [['--gold', '#d9ad57', "Feuille d'or"], ['--gold-2', '#f0d28e', 'Or clair, titres']] },
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
  demo.equip('item_8217');
  demo.equip('item_2445');
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
    <p class="brand-name">Dofus Slay</p><p class="brand-sub">Philosopher italique, sous-titres et lieux</p>
    <h2>Titre d'écran, Philosopher 28</h2>
    <h3>Titre de section, Philosopher or clair</h3>
    <p>Texte courant en Inter 15, interligne 1,55. Les cartes, les objets et les infobulles l'utilisent aussi, en plus petit.</p>
    <p class="muted">Texte secondaire : précisions, unités, états.</p>
  </div>`;

  const accents = ['--emeraude', '--pourpre', '--ocre', '--turquoise'];
  const buttons = `<div class="sg-row">
    ${accents.map((a) => `<button class="primary sg-btn" style="--accent:var(${a}); --accent-deep: color-mix(in srgb, var(${a}) 62%, #000)">Reprendre la route</button>`).join('')}
    <button class="end-turn">Finir le tour</button>
    <button class="link">Voir le deck</button>
    <button class="active">Carapace</button>
    <button class="forge-el el-feu">${elIcon('feu')}Feu</button>
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
    cardHtml(pickCard('iop_coup_epee', { element: 'eau' }), { inst: { uid: 0, id: 'iop_coup_epee', upgraded: false, element: 'eau' } }),
    cardHtml(pickCard('iop_sentence'), { selected: true }),
    cardHtml(pickCard('iop_epee_jugement'), { disabled: true }),
  ].join('');
  const cardLabels = ['Rare', 'Améliorée', 'Forgemagée', 'Sélectionnée', 'Pas assez de PA'];

  const items = [itemTile(ITEMS.items.item_8223), itemTile(ITEMS.items.item_2438), itemTile(ITEMS.items.item_15993, { taken: true })].join('');

  const states = ['avail', 'here', 'done', 'locked'] as const;
  const stateNames = { avail: 'Accessible', here: 'Position actuelle', done: 'Visitée', locked: 'Pas encore accessible' };
  const medals = (['combat', 'elite', 'zaap'] as const).map((t) => `<div class="sg-medal-row"><b>${NODE_LABEL[t]}</b>${states.map((st) =>
    `<figure class="sg-node"><span class="sg-node-box"><span class="node t-${t} s-${st}">${NODE_ICON[t]}</span></span><figcaption>${stateNames[st]}</figcaption></figure>`).join('')}</div>`).join('')
    + `<div class="sg-medal-row"><b>Boss</b><figure class="sg-node big"><span class="sg-node-box"><span class="node t-boss s-locked"><span class="boss-art"><img src="${asset('ui/boss.png')}" alt=""></span></span></span><figcaption>Grand médaillon doré et plaque</figcaption></figure></div>`;

  const chips = statusChips({ puissance: 2, faiblesse: 1, vulnerabilite: 2, brulure: 3 });
  const intents = `<span class="intent sg-intent i-attack"><svg viewBox="0 0 24 24"><path d="M5 19L19 5m-4 0h4v4"/></svg>7</span>
    <span class="intent sg-intent i-attack"><svg viewBox="0 0 24 24"><path d="M5 19L19 5m-4 0h4v4"/></svg>3×2</span>
    <span class="intent sg-intent i-defend">Envol</span><span class="intent sg-intent i-buff">Cri de guerre</span><span class="intent sg-intent i-debuff">Toile</span>`;

  ui.run = saved;
  return `<main class="styleguide">
    <header class="sg-head"><p class="brand-name">Dofus Slay</p><p class="brand-sub">Guide de style : la base visuelle du jeu</p>
      <a class="link" href="#">Revenir au jeu</a></header>
    ${sgSection('Couleurs', "L'ardoise et l'or de Dofusle. Chaque écran prend la couleur d'un Dofus primordial ; les éléments colorent les cartes.", swatches)}
    ${sgSection('Typographie', 'Deux familles : Philosopher pour ce qui se lit comme un titre ou un nom, Inter pour le reste.', type)}
    ${sgSection('Boutons et cadres', "Le bouton principal prend l'accent de l'écran. Coins biseautés pour les cadres, arrondis pour ce qui se joue.", buttons)}
    ${sgSection('Cartes', "Le cadre et le dégradé suivent l'élément. Les valeurs vertes tiennent compte des bonus en combat.",
      `<div class="sg-row cards">${cardsRow}</div><div class="sg-row cards">${cardStates}</div><div class="sg-row sg-labels">${cardLabels.map((l) => `<span>${l}</span>`).join('')}</div>`)}
    ${sgSection('Objets', 'Pièce de panoplie, objet rare avec actif, objet équipé.', `<div class="row items">${items}</div>`)}
    ${sgSection("Carte de l'acte", "La taille et le liseré des médaillons disent l'enjeu. L'infobulle s'ouvre au survol ou au focus.",
      `${medals}<div class="sg-row sg-tips"><div class="sg-static">${tipCombat}</div><div class="sg-static">${tipZaap}</div></div>`)}
    ${sgSection('Combat', 'Intentions des monstres, statuts, barres de vie et armure, PA.',
      `<div class="field sg-field">${enemies}</div><div class="sg-row">${intents}</div><div class="sg-row chips">${chips}</div>
      <div class="sg-row"><span class="sg-bar">${bar(54, 80, 'hp', ' <span class="shield">12</span>')}</span><div class="gem" role="img" aria-label="2 PA sur 3"><b>2/3</b><span>PA</span></div><div class="gem empty" role="img" aria-label="0 PA sur 3"><b>0/3</b><span>PA</span></div></div>`)}
  </main>`;
}

// ───────────── rendu ─────────────

/** En-tête gravé, comme sur Dofusle : nom au centre, lieu et étage en dessous. */
function brandBar(run: Run): string {
  const where = run.stats.floor ? `Amakna, étage ${run.stats.floor} sur ${run.map.floors}` : 'Amakna, au départ';
  return `<header class="brandbar"><p class="brand-name">Dofus Slay</p><p class="brand-sub">${where}</p></header>`;
}

function render(): void {
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
  else html = viewEnd(run);
  document.body.dataset.screen = run ? run.phase : 'title';
  root.innerHTML = (run && run.phase !== 'combat' ? brandBar(run) : '') + html + (run ? viewModal(run) : '');
  if (run?.phase === 'combat' && run.encounter) stage.show(run.encounter, run.classe, run.gender);
  else stage.hide();
  if (!run) startPreviews();
  if (run?.phase === 'map') {
    const here = root.querySelector('.node.s-avail') as HTMLElement | null;
    here?.scrollIntoView({ block: 'center' });
  }
  ui.hit.clear();
  ui.lunge.clear();
  ui.playerHit = 0;
}

// ───────────── actions ─────────────

/** Après une action : marques visuelles, puis fin de combat (laissée visible un instant). */
function afterCombatAction(before: Map<number, number>, hpBefore: number): void {
  const run = ui.run!;
  const c = run.combat!;
  for (const e of c.enemies) if ((before.get(e.uid) ?? e.hp) > e.hp) ui.hit.add(e.uid);
  if (c.player.hp < hpBefore) {
    ui.playerHit = hpBefore - c.player.hp;
    if (c.player.hp > 0) stage.hurt();
  }
  ui.selecting = null;
  if (c.outcome !== 'ongoing' && stage.visible) {
    if (c.outcome === 'lost') stage.die();
    ui.busy = true;
    setTimeout(() => { ui.busy = false; run.checkCombatEnd(); render(); }, c.outcome === 'lost' ? 1800 : 1000);
  } else run.checkCombatEnd();
}

function snapshot(): [Map<number, number>, number] {
  const c = ui.run!.combat!;
  return [new Map(c.enemies.map((e) => [e.uid, e.hp])), c.player.hp];
}

/** Point d'impact d'un monstre à l'écran (bas de son illustration). */
function enemyPoint(uid: number): { x: number; y: number } | null {
  const el = root.querySelector(`.enemy[data-uid="${uid}"] .enemy-pic`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom - r.height * 0.06 };
}

/** Joue une carte : l'animation part tout de suite, l'effet s'applique à l'impact. */
function playCard(index: number, target?: number): void {
  const run = ui.run!;
  const c = run.combat!;
  if (ui.busy || !c.hand[index]) return;
  const def = c.cardDef(c.hand[index]);
  if (def.cost > c.player.energy) return;
  const living = c.living();
  const uid = def.target === 'enemy' ? (target ?? living[0]?.uid) : undefined;
  const points = (def.target === 'enemy' ? [uid as number] : def.target === 'all_enemies' ? living.map((e) => e.uid) : [])
    .map(enemyPoint).filter((p): p is { x: number; y: number } => !!p);
  const delay = stage.visible ? stage.cast(def, points, def.target === 'self') : 0;
  ui.selecting = null;
  const apply = () => {
    const [before, hp] = snapshot();
    try { c.playCard(index, uid); } catch (err) { console.error(err); }
    ui.busy = false;
    ui.casting = -1;
    afterCombatAction(before, hp);
    render();
  };
  if (!delay) { apply(); return; }
  ui.busy = true;
  ui.casting = index;
  setTimeout(apply, delay);
}

function useActive(index: number, target?: number): void {
  if (ui.busy) return;
  const [before, hp] = snapshot();
  ui.run!.combat!.useActive(index, target);
  afterCombatAction(before, hp);
}

function endTurn(): void {
  if (ui.busy) return;
  const c = ui.run!.combat!;
  for (const e of c.living()) if (c.intent(e).damage > 0) ui.lunge.add(e.uid);
  const [before, hp] = snapshot();
  c.endTurn();
  afterCombatAction(before, hp);
}

function select(kind: 'card' | 'active', index: number): void {
  const c = ui.run!.combat!;
  if (ui.busy) return;
  const target = kind === 'card' ? c.cardDef(c.hand[index]).target : c.player.actives[index].def.target;
  if (kind === 'card' && c.cardDef(c.hand[index]).cost > c.player.energy) return;
  const living = c.living();
  if (target === 'enemy' && living.length > 1) {
    ui.selecting = ui.selecting?.kind === kind && ui.selecting.index === index ? null : { kind, index };
    return;
  }
  const t = target === 'enemy' ? living[0].uid : undefined;
  if (kind === 'card') playCard(index, t);
  else useActive(index, t);
}

function handle(act: string, d: DOMStringMap): void {
  const run = ui.run;
  switch (act) {
    case 'new-run': {
      const classe = d.classe as 'iop' | 'cra';
      ui.run = new Run(classe, (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0, ui.gender[classe]);
      ui.modal = null;
      break;
    }
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
      select('card', Number(d.index));
      break;
    case 'active':
      select('active', Number(d.index));
      break;
    case 'target': {
      const s = ui.selecting;
      if (!s) break;
      if (s.kind === 'card') playCard(s.index, Number(d.uid));
      else useActive(s.index, Number(d.uid));
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
    case 'modal-forge':
      ui.modal = { kind: 'forge' };
      break;
    case 'forge-pick':
      ui.modal = { kind: 'forge', uid: Number(d.uid) };
      break;
    case 'zaap-upgrade':
      run!.zaapUpgrade(Number(d.uid));
      ui.modal = null;
      break;
    case 'zaap-forge':
      run!.zaapForge(Number(d.uid), d.el as Element);
      ui.modal = null;
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
    if (ui.selecting && !(ev.target as HTMLElement).closest('.hand, .actives')) {
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

let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = window.setTimeout(() => { if (ui.run?.phase === 'combat' && !drag) render(); }, 120);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (ui.modal) ui.modal = null;
    else ui.selecting = null;
    render();
    return;
  }
  const run = ui.run;
  if (!run || run.phase !== 'combat' || ui.modal) return;
  if (ev.key >= '1' && ev.key <= '9') {
    const i = Number(ev.key) - 1;
    if (i < run.combat!.hand.length) {
      select('card', i);
      render();
    }
  } else if (ev.key === 'e' || ev.key === 'E') {
    handle('end-turn', {});
    render();
  }
});

// Accès de débogage / tests automatisés (Playwright).
(window as unknown as { __game: unknown }).__game = {
  get run() { return ui.run; },
  newRun(classe: ClassId, seed: number, gender: 'm' | 'f' = 'm') { ui.run = new Run(classe, seed, gender); ui.modal = null; ui.selecting = null; render(); },
  playCard, endTurn, stage,
  get busy() { return ui.busy; },
  render,
};

window.addEventListener('hashchange', render);
render();
