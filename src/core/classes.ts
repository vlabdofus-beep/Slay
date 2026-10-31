// Passifs de classe : l'équivalent de la relique de départ de Slay the Spire, propre à chaque classe.
// Toujours actif, ne se remplace pas. Valeurs réglables dans equilibrage.json (section « passifs »).
import type { ClassId } from './types.ts';

/** Valeurs des passifs (modifiables par le fichier d'équilibrage). */
export const PASSIVE_VALUES = {
  /** Iop : attaques à jouer dans un tour pour gagner de la puissance, et puissance gagnée. */
  courroux: { attaques: 3, puissance: 1 },
  /** Crâ : toutes les « attaques » attaques, l'attaque est multipliée par « multiplicateur ». */
  visee: { attaques: 5, multiplicateur: 2 },
};

export interface ClassPassive { id: string; name: string; readonly text: string }

export const PASSIVES: Partial<Record<ClassId, ClassPassive>> = {
  iop: {
    id: 'courroux',
    name: 'Courroux',
    get text() {
      const v = PASSIVE_VALUES.courroux;
      return `À la fin de ton tour, si tu as joué au moins ${v.attaques} attaques, gagne ${v.puissance} puissance pour le reste du combat.`;
    },
  },
  cra: {
    id: 'visee',
    name: 'Visée',
    get text() {
      const v = PASSIVE_VALUES.visee;
      return `Toutes les ${v.attaques} attaques, ton attaque inflige ${v.multiplicateur === 2 ? 'le double de' : `×${v.multiplicateur}`} dégâts. Certaines cartes rapprochent la Visée.`;
    },
  },
};
