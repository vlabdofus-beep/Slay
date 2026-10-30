// Bot qui joue une run complète avec le vrai déroulé (src/game/run.ts) : chemin, combats, cartes, objets, Zaap.
import type { ItemEffect } from '../core/effects.ts';
import { Rng } from '../core/rng.ts';
import type { ClassId, Element } from '../core/types.ts';
import { ITEMS } from '../data/items.ts';
import { LIBRARY } from '../data/library.ts';
import { Run } from '../game/run.ts';
import { chooseItem } from './itemPolicy.ts';
import { playGreedy } from './policy.ts';

export interface BotOptions {
  /** Effets ajoutés hors équipement (chiffrage). */
  extra?: ItemEffect[];
  extraProspection?: number;
  /** Élément que le bot privilégie dans les cartes (pour chiffrer les déclencheurs élémentaires). */
  favor?: Exclude<Element, 'neutre'>;
  /** Le bot ne prend jamais d'objet (comparaison). */
  noItems?: boolean;
}

export interface BotResult {
  won: boolean;
  /** Étages franchis sur l'ensemble des actes (0 à 39) : mesure plus fine que la victoire. */
  floor: number;
  /** Acte atteint et boss battus. */
  act: number;
  bosses: number;
  items: number;
  hpBeforeBoss: number | null;
  prospection: number;
  rarities: Record<string, number>;
}

export function botRun(classe: ClassId, seed: number, o: BotOptions = {}): BotResult {
  const run = new Run(classe, seed);
  run.extraEffects = o.extra ?? [];
  run.extraProspection = o.extraProspection ?? 0;
  const rng = new Rng(seed * 2654435761);
  const rarities: Record<string, number> = {};
  let hpBeforeBoss: number | null = null;
  for (let guard = 0; guard < 160; guard++) {
    if (run.phase === 'victory' || run.phase === 'defeat') break;
    if (run.phase === 'map') {
      const next = run.availableNodes().map((id) => run.map.nodes[id]);
      // Chemin : zaap si les PV sont bas, élite si les PV sont hauts, sinon au hasard.
      const low = run.hp < run.maxHp * 0.5;
      const pref = next.find((n) => (low ? n.type === 'zaap' : n.type === 'elite' && run.hp > run.maxHp * 0.8));
      const node = pref ?? rng.pick(next);
      if (node.type === 'boss' && run.act === 1) hpBeforeBoss = run.hp;
      run.enterNode(node.id);
      continue;
    }
    if (run.phase === 'combat') {
      playGreedy(run.combat!);
      run.checkCombatEnd();
      continue;
    }
    if (run.phase === 'reward') {
      const r = run.reward!;
      const fav = o.favor ? r.cards.filter((id) => LIBRARY.cards[id].element === o.favor) : [];
      run.takeCard(fav.length ? rng.pick(fav) : rng.pick(r.cards));
      if (r.items.length && !o.noItems) {
        const pick = chooseItem(LIBRARY, ITEMS, run.itemEffects, run.deck, run.equipment, r.items);
        if (pick) {
          run.takeItem(pick);
          const rar = ITEMS.items[pick].rarity;
          rarities[rar] = (rarities[rar] ?? 0) + 1;
        }
      }
      run.leaveReward();
      continue;
    }
    if (run.phase === 'dofus') {
      run.takeDofus(rng.pick(run.dofusOffer));
      continue;
    }
    if (run.phase === 'marchand') {
      const shop = run.shop!;
      // Retirer une carte de base, puis un objet qui améliore l'équipement, puis une carte rare.
      const basic = run.deck.find((c) => c.id.endsWith('coup_epee') || c.id.endsWith('coup_arc'));
      if (basic && !shop.removed && run.kamas >= shop.removePrice) run.removeCard(basic.uid);
      if (!o.noItems) {
        const affordable = shop.items.filter((x) => !x.sold && x.price <= run.kamas).map((x) => x.id);
        const pick = affordable.length ? chooseItem(LIBRARY, ITEMS, run.itemEffects, run.deck, run.equipment, affordable) : null;
        if (pick) { run.buyItem(pick); rarities[ITEMS.items[pick].rarity] = (rarities[ITEMS.items[pick].rarity] ?? 0) + 1; }
      }
      const card = shop.cards.find((x) => !x.sold && x.price <= run.kamas && LIBRARY.cards[x.id].rarity === 'rare');
      if (card) run.buyCard(card.id);
      run.leaveShop();
      continue;
    }
    if (run.phase === 'zaap') {
      if (run.hp < run.maxHp * 0.6 && run.zaapHealAmount() > 0) run.zaapRest();
      else {
        const c = run.deck.filter((x) => !x.upgraded);
        if (c.length) run.zaapUpgrade(rng.pick(c).uid);
      }
      run.leaveZaap();
    }
  }
  return {
    won: run.phase === 'victory',
    floor: (run.act - 1) * run.map.floors + (run.phase === 'victory' ? run.map.floors : run.stats.floor - (run.phase === 'defeat' ? 1 : 0)),
    act: run.act,
    bosses: run.act - 1 + (run.phase === 'victory' ? 1 : 0),
    items: Object.keys(run.equipment).length,
    hpBeforeBoss,
    prospection: run.prospection(),
    rarities,
  };
}
