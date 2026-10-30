// Texte lisible des cartes, effets, intentions et stats. Une seule source pour toute l'interface.
import type { Combat, Enemy } from '../core/combat.ts';
import type { CardDef, CardTarget, Effect, Element, StatusId, Stats } from '../core/types.ts';

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
export function liveAmount(c: Combat | null, fx: Effect, _cardElement: Element | null): number | null {
  if (!c || (fx.type !== 'damage' && fx.type !== 'drain')) return null;
  let d = fx.amount + (c.player.status.puissance ?? 0) + c.player.dom[fx.element];
  if (c.player.status.faiblesse) d *= 0.75;
  return Math.max(0, Math.floor(d));
}

function amountHtml(base: number, live: number | null): string {
  if (live === null || live === base) return `<b>${base}</b>`;
  return `<b class="${live > base ? 'up' : 'down'}">${live}</b>`;
}

export function effectText(fx: Effect, target: CardTarget, c: Combat | null = null, cardElement: Element | null = null): string {
  const zone = target === 'all_enemies' ? ' à tous les ennemis' : '';
  switch (fx.type) {
    case 'damage': {
      const n = amountHtml(fx.amount, liveAmount(c, fx, cardElement));
      const hits = fx.hits && fx.hits > 1 ? ` ×${fx.hits}` : '';
      return `Inflige ${n}${hits} ${fx.element === 'neutre' ? 'dégâts neutres' : `dégâts ${ELEMENT_NAMES[fx.element]}`}${zone}.`;
    }
    case 'drain':
      return `Vole ${amountHtml(fx.amount, liveAmount(c, fx, cardElement))} PV ${fx.element === 'neutre' ? '' : `(${ELEMENT_NAMES[fx.element]})`}${zone}.`.replace(' .', '.');
    case 'block': {
      const live = c ? fx.amount + c.player.blockBonus : null;
      return `Gagne ${amountHtml(fx.amount, live)} armure.`;
    }
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
  }
}

export function cardText(def: CardDef, c: Combat | null = null): string {
  const lines = def.effects.map((fx) => effectText(fx, def.target, c, def.element));
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
  if (it.damage > 0) {
    const perHit = Math.round(it.damage / Math.max(1, it.hits));
    return { kind: 'attack', label: it.hits > 1 ? `${perHit}×${it.hits}` : String(it.damage) };
  }
  if (move.effects.some((fx) => fx.type === 'status' && fx.on === 'target')) return { kind: 'debuff', label: move.name };
  if (move.effects.some((fx) => fx.type === 'block' || fx.type === 'heal')) return { kind: 'defend', label: move.name };
  if (move.effects.some((fx) => fx.type === 'status' && fx.on === 'self')) return { kind: 'buff', label: move.name };
  return { kind: 'other', label: move.name };
}

export function moveDetail(e: Enemy, c?: Combat): string {
  if (c?.intent(e).stunned) return 'saute son action';
  const move = e.def.moves[e.moveId];
  return move.effects
    .map((fx) => {
      if (fx.type === 'damage') return `${fx.amount}${fx.hits && fx.hits > 1 ? `×${fx.hits}` : ''} dégâts`;
      if (fx.type === 'drain') return `vole ${fx.amount} PV`;
      if (fx.type === 'block') return `+${fx.amount} armure`;
      if (fx.type === 'heal') return `se soigne de ${fx.amount}`;
      if (fx.type === 'status') return `${fx.on === 'self' ? 'gagne' : 'applique'} ${fx.amount} ${STATUS_INFO[fx.status].name}`;
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
