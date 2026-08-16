// Catalogue des pass. Source unique partagée par les deux Edge Functions.
// Les prix sont en FCFA (XOF), entiers : le franc CFA n'a pas de subdivision.

export type PassType = 'day' | 'week' | 'month';

export const PASSES: Record<PassType, { amountXof: number; label: string }> = {
  day: { amountXof: 200, label: '24 heures' },
  week: { amountXof: 1000, label: '7 jours' },
  month: { amountXof: 3000, label: '30 jours' },
};

export function isPassType(value: unknown): value is PassType {
  return typeof value === 'string' && value in PASSES;
}
