// Texte lisible des cartes, effets, intentions et stats. Une seule source pour toute l'interface.
import type { Combat, Enemy } from '../core/combat.ts';
import { RALENTI_CAP, type CardDef, type CardTarget, type CondId, type Effect, type Element, type ScaleId, type StatusId, type Stats } from '../core/types.ts';
import { LIBRARY } from '../data/library.ts';
import { PASSIVE_VALUES } from '../core/classes.ts';
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
  visee: 'par cran de Visée',
  epuisees: 'par carte épuisée ce combat',
  telefrag: 'par ennemi Téléfrag',
  telefrag_tour: 'par Téléfrag consommé ce tour',
};

export const COND_TEXT: Record<CondId, string> = {
  cible_morte: 'Si la cible meurt',
  cible_blessee: 'Si la cible a moins de la moitié de ses PV',
  cible_vulnerable: 'Si la cible est vulnérable',
  cible_empoisonnee: 'Si la cible est empoisonnée',
  cible_brule: 'Si la cible brûle',
  pv_bas: 'Si tu as moins de la moitié de tes PV',
  apres_attaque: 'Si ta carte précédente ce tour est une attaque',
  apres_competence: 'Si ta carte précédente ce tour est une compétence',
  premiere_carte: "Si c'est ta première carte du tour",
  main_vide: 'Si ta main est vide',
  cible_telefrag: 'Si la cible est Téléfrag',
  cible_ralentie: 'Si la cible est ralentie',
};

export const ELEMENT_NAMES: Record<Element, string> = {
  terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air', neutre: 'Neutre',
};

export const STATUS_INFO: Record<StatusId, { name: string; help: string }> = {
  puissance: { name: 'Puissance', help: 'Ajoute ses points à chaque coup.' },
  faiblesse: { name: 'Faiblesse', help: 'Inflige 25 % de dégâts en moins. Diminue de 1 chaque tour.' },
  vulnerabilite: { name: 'Vulnérabilité', help: 'Subit 50 % de dégâts en plus. Diminue de 1 chaque tour.' },
  brulure: { name: 'Brûlure', help: 'À la fin de son tour, perd autant de PV (l\'armure et le bouclier absorbent), puis diminue de 1.' },
  poison: { name: 'Poison', help: 'Au début de son tour, perd autant de PV, sans que l\'armure ni le bouclier ne protègent, puis est divisé par 2. Un monstre peut en mourir avant d\'agir.' },
  bouclier: { name: 'Bouclier', help: 'Absorbe les dégâts après l\'armure. Ne disparaît pas en fin de tour.' },
  renvoi: { name: 'Renvoi', help: 'Chaque coup reçu renvoie ses points en dégâts à l\'attaquant. Diminue de 1 chaque tour.' },
  erosion: { name: 'Érosion', help: 'L\'armure et les soins reçus sont divisés par 2. Diminue de 1 chaque tour.' },
  esquive: { name: 'Esquive', help: 'Chaque point annule entièrement un coup reçu.' },
  etourdi: { name: 'Étourdi', help: 'Saute sa prochaine action. Un boss doit en cumuler 2.' },
  telefrag: { name: 'Téléfrag', help: 'Marqué par le Xélor. La prochaine attaque qui le touche consomme la marque et déclenche les effets de Téléfrag.' },
  ralenti: { name: 'Ralenti', help: `Sa prochaine action inflige autant de dégâts en moins au total, puis le ralenti disparaît à la fin de son tour. ${RALENTI_CAP} au plus.` },
  echeance: { name: 'Échéance', help: 'À la fin de son prochain tour, perd autant de PV (l\'armure absorbe), puis l\'échéance disparaît.' },
};

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Valeur d'un effet de dégâts avec les bonus actuels du joueur (sans les résistances de la cible). */
export function liveAmount(c: Combat | null, fx: Effect, _cardElement: Element | null, def?: CardDef): number | null {
  if (!c || (fx.type !== 'damage' && fx.type !== 'drain')) return null;
  let d = c.baseAmount(fx, undefined, def?.id) + (c.player.status.puissance ?? 0) + c.player.dom[fx.element];
  if (c.player.status.faiblesse) d *= 0.75;
  d = Math.max(0, Math.floor(d));
  return def?.type === 'attaque' && c.aimReady() ? d * PASSIVE_VALUES.visee.multiplicateur : d;
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
      const pierce = fx.pierce ? " qui ignorent l'armure et le bouclier" : '';
      return `Inflige ${n}${hits} ${fx.element === 'neutre' ? 'dégâts neutres' : `dégâts ${ELEMENT_NAMES[fx.element]}`}${pierce}${zone}${more}.`;
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
    case 'if': {
      const inner = fx.then.map((t) => effectText(t, target, c, cardElement, def).replace(/\.$/, '')).filter(Boolean);
      const body = inner.map((t, i) => (i === 0 ? t.charAt(0).toLowerCase() + t.slice(1) : t.charAt(0).toLowerCase() + t.slice(1))).join(', ');
      return `<i>${COND_TEXT[fx.cond]}</i> : ${body}.`;
    }
    case 'spend':
      return fx.what === 'puissance' ? 'Puis perds toute ta puissance.' : 'Puis remet la Visée à zéro (cette carte ne la fait pas avancer).';
    case 'echo':
      return fx.count > 1 ? `Tes <b>${fx.count}</b> prochaines attaques sont lancées deux fois.` : 'Ta prochaine attaque est lancée deux fois.';
    case 'spread':
      return `Copie le ${STATUS_INFO[fx.status].name.toLowerCase()} de la cible sur tous les autres ennemis.`;
    case 'detonate':
      return `La cible perd tout de suite autant de PV que son ${STATUS_INFO[fx.status].name.toLowerCase()}, sans qu'il diminue.`;
    case 'exhaustHand':
      return 'Épuise les autres cartes de ta main.';
    case 'addCard': {
      const card = LIBRARY.cards[fx.card];
      const where = fx.pile === 'hand' ? 'ta main' : fx.pile === 'draw' ? 'ta pioche' : 'ta défausse';
      return `Ajoute <b>${fx.count}</b> ${esc(card?.name ?? fx.card)} dans ${where}.`;
    }
    case 'grant':
      return fx.fx.map((g) => (g.kind === 'rule' ? ruleText(g.rule as RuleId) : itemEffectText(g as ItemEffect))).join(' ');
    case 'heal':
      return `Soigne <b>${fx.amount}</b> PV.`;
    case 'draw':
      return `Pioche <b>${fx.amount}</b> ${plural(fx.amount, 'carte', 'cartes')}.`;
    case 'energy':
      return `Gagne <b>${fx.amount}</b> PA.`;
    case 'consume': {
      const inner = fx.then.map((t) => effectText(t, 'enemy', c, cardElement, def).replace(/\.$/, '')).filter(Boolean);
      const who = target === 'all_enemies' ? 'chaque ennemi Téléfrag' : 'la cible, si elle est Téléfrag';
      const body = inner.map((t) => t.charAt(0).toLowerCase() + t.slice(1)).join(', ');
      return `Consomme le Téléfrag de ${who}${body ? ` : ${body}` : ''}.`;
    }
    case 'status': {
      if (fx.status === 'telefrag') return fx.on === 'all_enemies' || target === 'all_enemies' ? 'Pose un <b>Téléfrag</b> sur tous les ennemis.' : 'Pose un <b>Téléfrag</b> sur la cible.';
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
  if (def.innate) lines.unshift('<i>Innée.</i>');
  if (def.retain) lines.push('<i>Conservée</i> : reste en main en fin de tour.');
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
    // Ralenti : le total baisse coup après coup, on affiche donc le total.
    const slowed = (e.status.ralenti ?? 0) > 0;
    return { kind: 'attack', label: it.hits > 1 && !slowed ? `${perHit}×${it.hits}` : String(it.damage) };
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
    case 'colere': return { name: 'Colère', n: p.n, help: `Toutes les ${p.every} attaques que tu joues, il gagne ${p.n} puissance.` };
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
    case 'rage': return { name: 'Rage', n: p.n, help: `Toutes les ${p.every} cartes que tu joues, il gagne ${p.n} puissance.` };
    case 'sommeil': return { name: 'Sommeil', n: p.turns, help: `Dort ${p.turns} tours en gagnant ${p.block} armure par tour. Se réveille plus tôt s'il perd des PV.` };
    case 'plafond': return { name: 'Invulnérable', n: p.n, help: `Ne perd jamais plus de ${p.n} PV par tour.` };
    case 'artefact': return { name: 'Artefact', n: p.n, help: `Annule les ${p.n} prochains malus qu'on lui applique.` };
  }
}
