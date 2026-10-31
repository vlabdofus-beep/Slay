// Points de vie et deck de départ de chaque classe (valeurs par défaut ; equilibrage.json les remplace).
import type { ClassId } from '../core/types.ts';

// Crâ : 70 → 75 quand il était derrière le Iop, puis retour à 70 avec les vrais sorts. Voir docs/BALANCE.md.
export const CLASS_START_HP: Partial<Record<ClassId, number>> = { iop: 80, cra: 70, xelor: 75 };

export const STARTERS: Partial<Record<ClassId, Record<string, number>>> = {
  iop: { iop_coup_epee: 5, iop_vitalite: 4, iop_pression: 1 },
  cra: { cra_coup_arc: 5, cra_tir_repli: 4, cra_fleche_glacee: 1 },
  xelor: { xelor_coup_baguette: 5, xelor_conservation: 4, xelor_frappe: 1 },
};
