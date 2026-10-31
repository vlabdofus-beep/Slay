// Bénédictions des dieux et reliques d'événement : ce qu'elles donnent, et les opérations qu'elles font sur la run.
//
// Une bénédiction (ou une relique) peut combiner :
//  - des effets de combat (déclencheur × récompense, ou une règle) : le même moteur que les objets ;
//  - des stats fixes (PV max, dégâts d'un élément, armure, prospection) ;
//  - des avantages de run (kamas, remises, récompenses plus larges, résurrection) ;
//  - des opérations immédiates sur la run (soin, cartes retirées ou améliorées, objet, relique…).
// Les reliques ne prennent pas d'emplacement d'équipement : elles s'ajoutent à côté.
import { effectText, type ItemEffect } from '../core/effects.ts';
import type { CardType, ItemRarity, Stats } from '../core/types.ts';

export interface RunPerks {
  /** Kamas gagnés en combat : +x (0,25 = +25 %). */
  kamasMul: number;
  /** Remise chez le marchand (0,2 = −20 %). */
  shopDiscount: number;
  /** Cartes supplémentaires proposées après un combat. */
  cardChoices: number;
  /** Résurrections (une par source, comme le Dokoko). */
  revive: number;
  /** Soin du Zaap : +x de tes PV max. */
  zaapHeal: number;
}
export const NO_PERKS = (): RunPerks => ({ kamasMul: 0, shopDiscount: 0, cardChoices: 0, revive: 0, zaapHeal: 0 });

export type PickWhat = 'remove' | 'upgrade' | 'transform' | 'duplicate';

/** Opération immédiate sur la run. */
export type RunOp =
  | { op: 'heal'; n: number }
  | { op: 'healPct'; pct: number }
  | { op: 'maxHp'; n: number }
  | { op: 'loseHp'; n: number }
  | { op: 'kamas'; n: number }
  | { op: 'prosp'; n: number }
  | { op: 'upgrade'; n: number }
  | { op: 'upgradeAll'; type: CardType; protection?: boolean }
  | { op: 'pick'; what: PickWhat; n: number }
  | { op: 'cardChoice'; rarity: 'rare' | 'commune' | 'toute'; neutral?: boolean }
  | { op: 'curse'; id: string }
  | { op: 'itemChoice'; rarity: ItemRarity }
  | { op: 'relic'; id?: string }
  | { op: 'fight'; tier: 'normal' | 'elite'; then?: RunOp[] }
  | { op: 'chance'; p: number; win: RunOp[]; lose: RunOp[]; winText: string; loseText: string };

export interface Boon {
  id: string;
  name: string;
  /** Phrase d'ambiance, en italique sous l'effet. */
  lore?: string;
  effects?: ItemEffect[];
  stats?: Stats;
  perks?: Partial<RunPerks>;
  now?: RunOp[];
}

// ───────────── textes ─────────────

const EL: Record<string, string> = { terre: 'Terre', feu: 'Feu', eau: 'Eau', air: 'Air', neutre: 'neutres' };
const TYPE_PL: Record<CardType, string> = { attaque: 'attaques', competence: 'compétences', pouvoir: 'pouvoirs' };
const PICK_TEXT: Record<PickWhat, [string, string]> = {
  remove: ['Retire une carte de ton deck', 'Retire {n} cartes de ton deck'],
  upgrade: ['Améliore une carte de ton choix', 'Améliore {n} cartes de ton choix'],
  transform: ['Transforme une carte de ton choix en une carte au hasard', 'Transforme {n} cartes de ton choix en cartes au hasard'],
  duplicate: ['Copie une carte de ton deck', 'Copie {n} cartes de ton deck'],
};
const RAR: Record<ItemRarity, string> = { commun: 'commun', rare: 'rare', mythique: 'mythique', legendaire: 'légendaire' };
const CURSE_NAME: Record<string, string> = { malediction_doute: 'Doute', malediction_honte: 'Honte', malediction_fardeau: 'Fardeau' };

/** Une opération en une phrase (les noms de reliques viennent de `relicName`, branché par les données). */
export let relicName = (id: string): string => id;
export function setRelicNamer(f: (id: string) => string): void { relicName = f; }

export function opText(o: RunOp): string {
  switch (o.op) {
    case 'heal': return `Récupère ${o.n} PV`;
    case 'healPct': return o.pct >= 1 ? 'Récupère tous tes PV' : `Récupère ${Math.round(o.pct * 100)} % de tes PV max`;
    case 'maxHp': return o.n > 0 ? `+${o.n} PV max` : `${o.n} PV max`;
    case 'loseHp': return `Perds ${o.n} PV`;
    case 'kamas': return o.n > 0 ? `Gagne ${o.n} kamas` : `Paie ${-o.n} kamas`;
    case 'prosp': return `+${o.n} prospection pour le reste de la run`;
    case 'upgrade': return o.n > 1 ? `Améliore ${o.n} cartes au hasard` : 'Améliore une carte au hasard';
    case 'upgradeAll': return `Améliore toutes tes ${TYPE_PL[o.type]}${o.protection ? ' qui donnent de l\'armure ou du bouclier' : ''}`;
    case 'pick': return PICK_TEXT[o.what][o.n > 1 ? 1 : 0].replace('{n}', String(o.n));
    case 'cardChoice': return `Choisis une carte${o.rarity === 'rare' ? ' rare' : o.rarity === 'commune' ? ' commune' : ''}${o.neutral ? ' d\'arme' : ''} parmi trois`;
    case 'curse': return `Ajoute la malédiction ${CURSE_NAME[o.id] ?? o.id} à ton deck`;
    case 'itemChoice': return `Choisis un objet ${RAR[o.rarity]} parmi trois`;
    case 'relic': return o.id ? `Obtiens la relique ${relicName(o.id)}` : 'Obtiens une relique au hasard';
    case 'fight': {
      const fight = o.tier === 'elite' ? 'Combat contre une élite' : 'Combat';
      return o.then?.length ? `${fight}. Si tu gagnes : ${o.then.map(opText).join(', ').replace(/^./, (c) => c.toLowerCase())}` : fight;
    }
    case 'chance': {
      const low = (l: RunOp[]) => l.map(opText).join(', ').replace(/^./, (c) => c.toLowerCase());
      return `${Math.round(o.p * 100)} % de chances : ${low(o.win)}${o.lose.length ? ` ; sinon : ${low(o.lose)}` : ''}`;
    }
  }
}

export function statsLines(s: Stats): string[] {
  const out: string[] = [];
  if (s.pv) out.push(`+${s.pv} PV max`);
  if (s.armure) out.push(`+${s.armure} armure à chaque gain d'armure`);
  for (const [el, v] of Object.entries(s.dom ?? {})) if (v) out.push(`+${v} dégâts ${EL[el]}`);
  if (s.prospection) out.push(`+${s.prospection} prospection`);
  return out;
}

export function perkLines(p: Partial<RunPerks>): string[] {
  const out: string[] = [];
  if (p.kamasMul) out.push(`+${Math.round(p.kamasMul * 100)} % de kamas après chaque combat`);
  if (p.shopDiscount) out.push(`Les marchands te font ${Math.round(p.shopDiscount * 100)} % de remise`);
  if (p.cardChoices) out.push(`Les récompenses de combat proposent ${3 + p.cardChoices} cartes au lieu de 3`);
  if (p.revive) out.push('Une fois par run, quand tu tombes à 0 PV, tu reviens avec la moitié de tes PV');
  if (p.zaapHeal) out.push(`Les Zaaps soignent ${Math.round(p.zaapHeal * 100)} % de PV en plus`);
  return out;
}

/** Ce que fait une bénédiction ou une relique, ligne par ligne. */
export function boonLines(b: Boon): string[] {
  const lines = [
    ...(b.now ?? []).map((o) => `${opText(o)}.`),
    ...statsLines(b.stats ?? {}).map((t) => `${t}.`),
    ...(b.effects ?? []).map(effectText),
    ...perkLines(b.perks ?? {}).map((t) => `${t}.`),
  ];
  // Deux fois la même opération : une seule ligne, « deux fois ».
  return lines.filter((l, i) => lines.indexOf(l) === i).map((l) => (lines.filter((x) => x === l).length === 2 ? l.replace(/\.$/, ', deux fois.') : l));
}
