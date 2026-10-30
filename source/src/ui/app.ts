// Interface du jeu : rendu DOM simple (re-rendu complet à chaque action) + délégation d'événements.
// Toute la logique est dans src/game/run.ts et src/core ; ce fichier ne fait qu'afficher et relayer.
import { resolveCard, type Enemy } from '../core/combat.ts';
import { PALIERS, PASSIVE_BY_PALIER, type ElementalElement } from '../core/loadout.ts';
import type { MapNode } from '../core/map.ts';
import type { CardDef, CardInstance, ClassId, Element, ItemDef, StatusMap } from '../core/types.ts';
import { ELEMENTS, SLOTS } from '../core/types.ts';
import { DOFUS } from '../data/dofus.ts';
import { ITEMS } from '../data/items.ts';
import { CLASS_START_HP, LIBRARY } from '../data/library.ts';
import { ENCOUNTERS } from '../data/monsters.ts';
import { Run } from '../game/run.ts';
import {
  activeText, cardText, ELEMENT_NAMES, esc, intentSummary, moveDetail, STATUS_INFO, statsText,
} from './describe.ts';

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
};

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
    return `<button class="class-pick" data-act="new-run" data-classe="${id}" style="--accent: var(${id === 'iop' ? '--pourpre' : '--emeraude'})">
      <img src="${asset(`classes/${b.id}.png`)}" alt="">
      <span class="class-name">${esc(b.n)}</span>
      <span class="class-hp">${CLASS_START_HP[id]} PV</span>
      <span class="class-pitch">${CLASS_INFO[id].pitch}</span>
    </button>`;
  };
  return `<main class="title">
    <h1 class="brand-name big">Dofus Slay</h1>
    <p class="brand-sub">Un deckbuilder dans le Monde des Douze</p>
    <p class="lead">Traverse Amakna jusqu'au Bouftou Royal. Chaque combat t'offre une carte, et parfois un objet : construis ta voie élémentaire.</p>
    <div class="class-row">${choice('iop')}${choice('cra')}</div>
    <p class="fine">Fan game non officiel. Données issues de DofusDB, univers © Ankama.</p>
  </main>`;
}

const NODE_LABEL: Record<MapNode['type'], string> = { combat: 'Combat', elite: 'Élite', zaap: 'Zaap', boss: 'Boss' };
const NODE_ICON: Record<MapNode['type'], string> = {
  combat: '<svg viewBox="0 0 24 24"><path d="M4 4l9 9m-2 2l-1.5 1.5L7 19l-2-2 2.5-2.5L9 13M20 4l-9 9m2 2l1.5 1.5L17 19l2-2-2.5-2.5L15 13"/></svg>',
  elite: '<svg viewBox="0 0 24 24"><path d="M5 3l3 5h8l3-5M6 9a6 6 0 0012 0M9 13h.01M15 13h.01M10 17h4M8 9v9h8V9"/></svg>',
  zaap: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  boss: '',
};

function viewMap(run: Run): string {
  const m = run.map;
  const W = 96, H = 64, PAD = 48;
  const pos = (n: MapNode) => ({ x: PAD + n.col * W, y: PAD + (m.floors - n.floor) * H });
  const width = PAD * 2 + (m.cols - 1) * W;
  const height = PAD * 2 + (m.floors - 1) * H;
  const avail = new Set(run.availableNodes());
  const visited = new Set(run.path);
  const lines = Object.values(m.nodes).flatMap((n) => n.next.map((id) => {
    const a = pos(n), b = pos(m.nodes[id]);
    const walked = visited.has(n.id) && visited.has(id) && run.path.indexOf(id) === run.path.indexOf(n.id) + 1;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? 'walked' : ''}"/>`;
  })).join('');
  const nodes = Object.values(m.nodes).map((n) => {
    const p = pos(n);
    const state = avail.has(n.id) ? 'avail' : n.id === run.position ? 'here' : visited.has(n.id) ? 'done' : 'locked';
    const icon = n.type === 'boss' ? `<img src="${asset('ui/boss.png')}" alt="">` : NODE_ICON[n.type];
    const label = `${NODE_LABEL[n.type]}, étage ${n.floor}`;
    return `<button class="node t-${n.type} s-${state}" style="left:${p.x}px;top:${p.y}px" ${state === 'avail' ? `data-act="go" data-id="${n.id}"` : 'disabled'} aria-label="${label}" title="${label}">${icon}</button>`;
  }).join('');
  return `<main class="mapview">
    <section class="map-wrap">
      <header class="map-head"><h2>Amakna</h2><p class="muted">Choisis ta route. Le Bouftou Royal attend au sommet.</p></header>
      <div class="map-scroll"><div class="map" style="width:${width}px;height:${height}px">
        <svg width="${width}" height="${height}" aria-hidden="true">${lines}</svg>${nodes}
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
  return `<button class="enemy${e.dead ? ' dead' : ''}${targeting && !e.dead ? ' targetable' : ''}${ui.hit.has(e.uid) ? ' hit' : ''}" ${targeting && !e.dead ? `data-act="target" data-uid="${e.uid}"` : 'disabled'} aria-label="${esc(e.def.name)}">
    ${e.dead ? '' : `<span class="intent i-${it.kind}" title="${esc(`${e.def.moves[e.moveId].name} : ${moveDetail(e)}`)}">${it.kind === 'attack' ? `<svg viewBox="0 0 24 24"><path d="M5 19L19 5m-4 0h4v4"/></svg>` : ''}${esc(it.label)}</span>`}
    ${pic(e.def.image, e.def.name, 'enemy-pic')}
    <span class="enemy-name">${esc(e.def.name)}</span>
    ${bar(e.hp, e.maxHp, 'hp', e.block ? ` <span class="shield">${e.block}</span>` : '')}
    <span class="chips">${statusChips(e.status)}</span>
    <span class="affinity">${weak ? `<span title="Faible : +50 % de dégâts">Faible ${weak}</span>` : ''}${resist ? `<span title="Résiste : −50 % de dégâts">Résiste ${resist}</span>` : ''}</span>
  </button>`;
}

function viewCombat(run: Run): string {
  const c = run.combat!;
  const p = c.player;
  const enc = run.encounter ? ENCOUNTERS[run.encounter] : null;
  const targeting = ui.selecting !== null;
  const title = enc ? [...new Set(enc.monsters.map((id) => LIBRARY.monsters[id].name))].join(', ') : 'Combat';
  const hand = c.hand.map((inst, i) => {
    const def = c.cardDef(inst);
    const sel = ui.selecting?.kind === 'card' && ui.selecting.index === i;
    return cardHtml(def, { inst, act: 'play', data: `data-index="${i}"`, disabled: def.cost > p.energy, selected: sel, live: true, hint: i < 9 ? String(i + 1) : '' });
  }).join('');
  const actives = p.actives.map((a, i) => `<button class="active${a.used ? ' used' : ''}${ui.selecting?.kind === 'active' && ui.selecting.index === i ? ' sel' : ''}" data-act="active" data-index="${i}" ${a.used ? 'disabled' : ''} title="${esc(activeText(a.def))}">${esc(a.def.name)}</button>`).join('');
  const orbs = Array.from({ length: Math.max(p.energy, 3) }, (_, i) => `<span class="pa${i < p.energy ? '' : ' spent'}"></span>`).join('');
  const passives = [
    p.passives.terreArmure && PASSIVE_TEXT.terre(p.passives.terreArmure),
    p.passives.feuBrulure && PASSIVE_TEXT.feu(p.passives.feuBrulure),
    p.passives.eauSoin && PASSIVE_TEXT.eau(p.passives.eauSoin),
    p.passives.airPioche && PASSIVE_TEXT.air(p.passives.airPioche),
    p.passives.prisme && `Prisme ${p.passives.prisme}.`,
  ].filter(Boolean);
  return `<main class="combatview">
    <header class="cbar">
      <h2>${esc(title)}</h2>
      <span class="muted">${run.node ? NODE_LABEL[run.node.type] : ''}, tour ${c.turn}</span>
      <span class="piles">
        <button class="link" data-act="pile" data-pile="draw">Pioche ${c.drawPile.length}</button>
        <button class="link" data-act="pile" data-pile="discard">Défausse ${c.discardPile.length}</button>
        ${c.exhaustPile.length ? `<button class="link" data-act="pile" data-pile="exhaust">Épuisées ${c.exhaustPile.length}</button>` : ''}
        <button class="link" data-act="toggle-log">${ui.logOpen ? 'Masquer' : 'Journal'}</button>
      </span>
    </header>
    <section class="field${targeting ? ' targeting' : ''}">${c.enemies.map((e) => enemyHtml(e, targeting)).join('')}</section>
    ${targeting ? `<p class="prompt">Choisis une cible. <button class="link" data-act="cancel">Annuler</button></p>` : ''}
    <section class="player${ui.playerHit ? ' hurt' : ''}">
      <div class="pstats">
        ${bar(p.hp, p.maxHp, 'hp', p.block ? ` <span class="shield">${p.block}</span>` : '')}
        ${ui.playerHit ? `<span class="dmg-float">−${ui.playerHit}</span>` : ''}
        <span class="chips">${statusChips(p.status)}</span>
        <span class="energy" aria-label="${p.energy} PA">${orbs}<b>${p.energy} PA</b></span>
        ${actives ? `<span class="actives">${actives}</span>` : ''}
        ${passives.length ? `<span class="passives">${passives.join(' ')}</span>` : ''}
      </div>
      <div class="hand${c.hand.length > 6 ? ' crowded' : ''}">${hand || '<p class="muted">Main vide.</p>'}</div>
      <button class="end-turn" data-act="end-turn">Finir le tour</button>
    </section>
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

// ───────────── rendu ─────────────

/** En-tête gravé, comme sur Dofusle : nom au centre, lieu et étage en dessous. */
function brandBar(run: Run): string {
  const where = run.stats.floor ? `Amakna, étage ${run.stats.floor} sur ${run.map.floors}` : 'Amakna, au départ';
  return `<header class="brandbar"><p class="brand-name">Dofus Slay</p><p class="brand-sub">${where}</p></header>`;
}

function render(): void {
  const run = ui.run;
  let html = '';
  if (!run) html = viewTitle();
  else if (run.phase === 'map') html = viewMap(run);
  else if (run.phase === 'combat') html = viewCombat(run);
  else if (run.phase === 'reward') html = viewReward(run);
  else if (run.phase === 'zaap') html = viewZaap(run);
  else html = viewEnd(run);
  document.body.dataset.screen = run ? run.phase : 'title';
  root.innerHTML = (run ? brandBar(run) : '') + html + (run ? viewModal(run) : '');
  if (run?.phase === 'map') {
    const here = root.querySelector('.node.s-avail') as HTMLElement | null;
    here?.scrollIntoView({ block: 'center' });
  }
  ui.hit.clear();
  ui.playerHit = 0;
}

// ───────────── actions ─────────────

function afterCombatAction(before: Map<number, number>, hpBefore: number): void {
  const run = ui.run!;
  const c = run.combat!;
  for (const e of c.enemies) if ((before.get(e.uid) ?? e.hp) > e.hp) ui.hit.add(e.uid);
  if (c.player.hp < hpBefore) ui.playerHit = hpBefore - c.player.hp;
  ui.selecting = null;
  run.checkCombatEnd();
}

function snapshot(): [Map<number, number>, number] {
  const c = ui.run!.combat!;
  return [new Map(c.enemies.map((e) => [e.uid, e.hp])), c.player.hp];
}

function playCard(index: number, target?: number): void {
  const [before, hp] = snapshot();
  ui.run!.combat!.playCard(index, target);
  afterCombatAction(before, hp);
}

function useActive(index: number, target?: number): void {
  const [before, hp] = snapshot();
  ui.run!.combat!.useActive(index, target);
  afterCombatAction(before, hp);
}

function select(kind: 'card' | 'active', index: number): void {
  const c = ui.run!.combat!;
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
    case 'new-run':
      ui.run = new Run(d.classe as ClassId, (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0);
      ui.modal = null;
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
    case 'end-turn': {
      const [before, hp] = snapshot();
      run!.combat!.endTurn();
      afterCombatAction(before, hp);
      break;
    }
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

document.addEventListener('click', (ev) => {
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
  newRun(classe: ClassId, seed: number) { ui.run = new Run(classe, seed); ui.modal = null; ui.selecting = null; render(); },
  render,
};

render();
