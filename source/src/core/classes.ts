// Passifs de classe : l'équivalent de la relique de départ de Slay the Spire, propre à chaque classe.
// Toujours actif, ne se remplace pas. Chiffré par simulation (docs/BALANCE.md).
import type { ClassId } from './types.ts';

/** Iop : nombre d'attaques à jouer dans un tour pour gagner 1 puissance. */
export const COURROUX = 3;
/** Crâ : toutes les VISEE attaques, l'attaque inflige le double de dégâts. */
export const VISEE = 5;

export interface ClassPassive { id: string; name: string; text: string }

export const PASSIVES: Partial<Record<ClassId, ClassPassive>> = {
  iop: {
    id: 'courroux',
    name: 'Courroux',
    text: `À la fin de ton tour, si tu as joué au moins ${COURROUX} attaques, gagne 1 puissance pour le reste du combat.`,
  },
  cra: {
    id: 'visee',
    name: 'Visée',
    text: `Toutes les ${VISEE} attaques, ton attaque inflige le double de dégâts. Certaines cartes rapprochent la Visée.`,
  },
};
