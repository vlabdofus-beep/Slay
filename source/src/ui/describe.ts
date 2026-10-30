// Texte lisible des cartes, effets, intentions et stats. Une seule source pour toute l'interface.
import type { Combat, Enemy } from '../core/combat.ts';
import type { CardDef, CardTarget, Effect, Element, ScaleId, StatusId, Stats } from '../core/types.ts';
import { effectText as itemEffectText, ruleText, type ItemEffect, type RuleId } from '../core/effects.ts';

/** Ce qui fait grossir une carte (« +3 par attaque déjà jouée ce tour »). */
export const SCALE_TEXT: Record<ScaleId, string> = {
  attaques: 'par attaque déjà jouée ce tour',
  puissance: 'par point de puissance',
  armure: "par point d'armure",
  ennemis: 'par ennemi en vie',
  statuts: 'par altération sur la cible',
  main: 'par carte en main',
  lancers: 'par lancer précédent de cette carte ce combat',
};

export const ELEMENT_NAMES: Record<Element, string> = {
  terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air', neutre: 'Neutre',
};

export const STATUS_INFO: Record<StatusId, { name: string; help: string }> = {
  puissance: { name: 'Puissance', help: 'Ajoute ses points à chaque coup.' },
  faiblesse: { name: 'Faiblesse', help: 'Inflige 25 % de dégâts en moins. Diminue de 1 chaque tour.' },
  vulnerabilite: { name: 'Vulnérabilité', help: 'Subit 50 % de dégâts en plus. Diminue de 1 chaque tour.' },
  brulure: { name: 'Brûlure', help: 'Perd ses points en fin de tour (l\'armure et le bouclier absorbent), puis diminue de 1.' },
  poison: { name: 'Poison', help: 'Perd ses points en PV en fin de tour, sans que l\'armure ni le bouclier ne protègent, puis est divisé par 2.' },
  bouclier: { name: 'Bouclier', help: 'Absorbe les dégâts après l\'armure. Ne disparaît pas en fin de tour.' },
  renvoi: { name: 'Renvoi', help: 'Chaque coup reçu renvoie ses points en dégâts à l\'attaquant. Diminue de 1 chaque tour.' },
  erosion: { name: 'Érosion', help: 'L\'armure et les soins reçus sont divisés par 2. Diminue de 1 chaque tour.' },
  esquive: { name: 'Esquive', help: 'Chaque point annule entièrement un coup reçu.' },
  etourdi: { name: 'Étourdi', help: 'Saute sa prochaine action. Un boss doit en cumuler 2.' },
};

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Valeur d'un effet de dégâts avec les bonus actuels du joueur (sans les résistances de la cible). */
export function liveAmount(c: Combat | null, fx: Effect, _cardElement: Element | null, def?: CardDef): number | null {
  if (!c || (fx.type !== 'damage' && fx.type !== 'drain')) return null;
  let d = c.baseAmount(fx, undefined, def?.id) + (c.player.status.puissance ?? 0) + c.player.dom[fx.element];
  if (c.player.status.faiblesse) d *= 0.75;
  d = Math.max(0, Math.floor(d));
  return def?.type === 'attaque' && c.aimReady() ? d * 2 : d;
}

function amountHtml(base: number, live: number | null): string {
  if (live === null || live === base) return `<b>${base}</b>`;
  return `<b class="${live > base ? 'up' : 'down'}">${live}</b>`;
}

export function effectText(fx: Effect, target: CardTarget, c: Combat | null = null, cardElement: Element | null = null, def?: CardDef): string {
  const zone = target === 'all_enemies' ? ' à tous les ennemis' : '';
  switch (fx.type) {
    case 'damage': {
      const n = amountHtml(fx.amount, liveAmount(c, fx, cardElement, def));
      const hits = fx.hits && fx.hits > 1 ? ` ×${fx.hits}` : '';
      const more = fx.bonus ? `, <b>+${fx.bonus.n}</b> ${SCALE_TEXT[fx.bonus.per]}` : '';
      return `Inflige ${n}${hits} ${fx.element === 'neutre' ? 'dégâts neutres' : `dégâts ${ELEMENT_NAMES[fx.element]}`}${zone}${more}.`;
    }
    case 'drain':
      return `Vole ${amountHtml(fx.amount, liveAmount(c, fx, cardElement, def))} PV ${fx.element === 'neutre' ? '' : `(${ELEMENT_NAMES[fx.element]})`}${zone}.`.replace(' .', '.');
    case 'block': {
      const base = c ? c.baseAmount(fx, undefined, def?.id) : fx.amount;
      const live = c ? base + c.player.blockBonus : null;
      const more = fx.bonus ? `, <b>+${fx.bonus.n}</b> ${SCALE_TEXT[fx.bonus.per]}` : '';
      return `Gagne ${amountHtml(fx.amount, live)} armure${more}.`;
    }
    case 'loseHp':
      return `Perds <b>${fx.amount}</b> PV.`;
    case 'charge':
      return `Visée <b>+${fx.amount}</b>.`;
    case 'multiply':
      return `${fx.factor === 2 ? 'Double' : fx.factor === 3 ? 'Triple' : `Multiplie par ${fx.factor}`} le ${STATUS_INFO[fx.status].name.toLowerCase()} de la cible.`;
    case 'grant':
      return fx.fx.map((g) => (g.kind === 'rule' ? ruleText(g.rule as RuleId) : itemEffectText(g as ItemEffect))).join(' ');
    case 'heal':
      return `Soigne <b>${fx.amount}</b> PV.`;
    case 'draw':
      return `Pioche <b>${fx.amount}</b> ${plural(fx.amount, 'carte', 'cartes')}.`;
    case 'energy':
      return `Gagne <b>${fx.amount}</b> PA.`;
    case 'status': {
      const s = STATUS_INFO[fx.status].name;
      if (fx.on === 'self') return `Gagne <b>${fx.amount}</b> ${s}.`;
      if (fx.on === 'all_enemies') return `Applique <b>${fx.amount}</b> ${s} à tous les ennemis.`;
      return `Applique <b>${fx.amount}</b> ${s}${zone}.`;
    }
    default:
      return '';
  }
}

export function cardText(def: CardDef, c: Combat | null = null): string {
  const lines = def.effects.map((fx) => effectText(fx, def.target, c, def.element, def));
  if (def.type === 'pouvoir') lines.unshift('<i>Pouvoir, actif tout le combat :</i>');
  if (def.unplayable) lines.push('Injouable.');
  if (def.endTurnDamage) lines.push(`Si elle est encore en main en fin de tour, tu subis <b>${def.endTurnDamage}</b> dégâts.`);
  if (def.ethereal) lines.push('Éphémère : épuisée si elle reste en main en fin de tour.');
  if (def.exhaust) lines.push('Épuisée après usage.');
  return lines.join(' ');
}

export function statsText(s: Stats): string[] {
  const out: string[] = [];
  if (s.pv) out.push(`+${s.pv} PV max`);
  if (s.armure) out.push(`+${s.armure} armure à chaque gain d'armure`);
  for (const [el, v] of Object.entries(s.dom ?? {})) if (v) out.push(`+${v} dégâts ${ELEMENT_NAMES[el as Element]}`);
  if (s.prospection) out.push(`+${s.prospection} prospection`);
  return out;
}

/** Résumé court de l'intention d'un monstre. */
export function intentSummary(c: Combat, e: Enemy): { kind: 'attack' | 'defend' | 'buff' | 'debuff' | 'other'; label: string } {
  const it = c.intent(e);
  const move = e.def.moves[e.moveId];
  if (it.stunned) return { kind: 'other', label: 'Étourdi' };
  if (it.note) return { kind: it.damage > 0 ? 'attack' : 'other', label: it.damage > 0 ? `${it.note} ${it.damage}` : it.note };
  if (it.damage > 0) {
    const perHit = Math.round(it.damage / Math.max(1, it.hits));
    return { kind: 'attack', label: it.hits > 1 ? `${perHit}×${it.hits}` : String(it.damage) };
  }
  if (move.effects.some((fx) => fx.type === 'summon')) return { kind: 'buff', label: move.name };
  if (move.effects.some((fx) => (fx.type === 'status' && fx.on === 'target') || fx.type === 'addCard')) return { kind: 'debuff', label: move.name };
  if (move.effects.some((fx) => fx.type === 'block' || fx.type === 'heal')) return { kind: 'defend', label: move.name };
  if (move.effects.some((fx) => fx.type === 'status' && fx.on === 'self')) return { kind: 'buff', label: move.name };
  return { kind: 'other', label: move.name };
}

export function moveDetail(e: Enemy, c?: Combat): string {
  if (c?.intent(e).stunned) return 'saute son action';
  const note = c?.intent(e).note;
  if (note === 'Endormi') return 'dort et se protège';
  if (note === 'Explose !') return 'explose et meurt';
  if (note === 'S\'enfuit') return 's\'enfuit avec les kamas volés';
  const move = e.def.moves[e.moveId];
  return move.effects
    .map((fx) => {
      if (fx.type === 'damage') return `${fx.amount}${fx.hits && fx.hits > 1 ? `×${fx.hits}` : ''} dégâts`;
      if (fx.type === 'drain') return `vole ${fx.amount} PV`;
      if (fx.type === 'block') return `+${fx.amount} armure`;
      if (fx.type === 'heal') return `se soigne de ${fx.amount}`;
      if (fx.type === 'status') return `${fx.on === 'self' ? 'gagne' : 'applique'} ${fx.amount} ${STATUS_INFO[fx.status].name}`;
      if (fx.type === 'summon') return `invoque ${fx.count && fx.count > 1 ? `${fx.count} alliés` : 'un allié'}`;
      if (fx.type === 'addCard') return `glisse ${fx.count} carte${fx.count > 1 ? 's' : ''} de statut dans ton deck`;
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Mécaniques de monstres : nom et explication (une seule source pour l'interface). */
export function powerInfo(p: import('../core/types.ts').MonsterPower): { name: string; help: string; n?: number } {
  switch (p.kind) {
    case 'carapace': return { name: 'Carapace', n: p.n, help: `Gagne ${p.n} armure à la fin de chacun de ses tours.` };
    case 'epines': return { name: 'Épines', n: p.n, help: `Chaque coup qu'il reçoit te renvoie ${p.n} dégâts.` };
    case 'colere': return { name: 'Colère', n: p.n, help: `Gagne ${p.n} puissance chaque fois qu'il perd des PV.` };
    case 'enroulement': return { name: 'Enroulement', n: p.n, help: `La première fois qu'il perd des PV, il gagne ${p.n} armure.` };
    case 'rituel': return { name: 'Rituel', n: p.n, help: `Gagne ${p.n} puissance à la fin de chacun de ses tours, à partir du deuxième.` };
    case 'spores': return { name: 'Spores', n: p.n, help: `En mourant, t'applique ${p.n} vulnérabilité.` };
    case 'explosion': return { name: 'Explosion', n: p.dmg, help: `Explose au bout de ${p.turns} tours : ${p.dmg} dégâts, puis meurt. Tue-le avant.` };
    case 'division': return { name: 'Division', help: 'À la moitié de ses PV, il se divise en deux monstres plus petits qui gardent ses PV restants.' };
    case 'voleur': return { name: 'Voleur', n: p.n, help: p.turns >= 99 ? `Vole ${p.n} kamas à chaque coup qui te blesse. Tu les récupères en le battant.`
      : `Vole ${p.n} kamas à chaque coup qui te blesse et s'enfuit au bout de ${p.turns} tours avec son butin. Tu les récupères en le battant avant.` };
    case 'gardien': return { name: 'Garde', help: 'Subit moitié moins de dégâts tant qu\'un autre monstre est en vie.' };
    case 'regeneration': return { name: 'Régénération', n: p.n, help: `Se soigne de ${p.n} PV à la fin de chacun de ses tours.` };
    case 'esquive': return { name: 'Agilité', n: p.n, help: `Commence le combat avec ${p.n} esquive : ses premiers coups reçus sont annulés.` };
    case 'cameleon': return { name: 'Peau de roche', help: 'Résiste à l\'élément du dernier coup qu\'il a reçu : varie les éléments.' };
    case 'rage': return { name: 'Rage', n: p.n, help: `Gagne ${p.n} puissance chaque fois que tu joues une compétence.` };
    case 'sommeil': return { name: 'Sommeil', n: p.turns, help: `Dort ${p.turns} tours en gagnant ${p.block} armure par tour. Se réveille plus tôt s'il perd des PV.` };
    case 'plafond': return { name: 'Invulnérable', n: p.n, help: `Ne perd jamais plus de ${p.n} PV par tour.` };
    case 'artefact': return { name: 'Artefact', n: p.n, help: `Annule les ${p.n} prochains malus qu'on lui applique.` };
  }
}
