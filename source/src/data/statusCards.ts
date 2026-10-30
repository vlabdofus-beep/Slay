// Cartes de statut glissées dans le deck par certains monstres (repères : Hébété, Gluant, Brûlure, Blessure de StS).
// Elles ne vont jamais dans les récompenses et disparaissent à la fin du combat (le deck de la run n'est pas touché).
import type { CardDef } from '../core/types.ts';

const base = { classe: 'neutre' as const, type: 'competence' as const, element: 'neutre' as const, target: 'self' as const, rarity: 'base' as const, effects: [], status: true };

export const STATUS_CARDS: CardDef[] = [
  { ...base, id: 'statut_toile', name: 'Toile collante', cost: 0, unplayable: true, ethereal: true, icon: 'assets/fx/regle.webp',
    lore: 'Une toile d\'Arakne qui encombre la main.' },
  { ...base, id: 'statut_bave', name: 'Bave gluante', cost: 1, exhaust: true, icon: 'assets/fx/poison.webp',
    lore: 'Il faut dépenser 1 PA pour s\'en débarrasser.' },
  { ...base, id: 'statut_braise', name: 'Braise', cost: 0, unplayable: true, endTurnDamage: 2, icon: 'assets/elements/feu.png',
    lore: 'Elle brûle les doigts tant qu\'on la garde.' },
  { ...base, id: 'statut_blessure', name: 'Blessure', cost: 0, unplayable: true, icon: 'assets/fx/degats.webp',
    lore: 'Une plaie qui encombre le deck jusqu\'à la fin du combat.' },
];
