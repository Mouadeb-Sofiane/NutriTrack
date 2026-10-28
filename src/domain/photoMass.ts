/**
 * Poids estimé sur la photo (en grammes) : estimation normale, haute et basse.
 *
 * Régression linéaire sur les vecteurs CLIP de la photo (image entière + moyenne des
 * 4 zones), entraînée sur Nutrition5k (Google, CC BY 4.0) : 2 755 assiettes photographiées
 * du dessus et PESÉES. Sur 507 assiettes de test jamais vues :
 *   - erreur moyenne 42 g (erreur médiane 19 % du poids) ;
 *   - le poids réel est ≤ l'estimation haute dans 79 % des cas (objectif 80 %) ;
 *   - le poids réel est dans la fourchette basse–haute dans 56 % des cas.
 * Les bornes viennent des erreurs réellement observées (quantiles 20/50/80 %), pas d'un
 * pourcentage arbitraire. Valable surtout pour une ASSIETTE vue du dessus ; un sandwich
 * dans son emballage, un bol vu de côté ou une boisson sortent de ce cadre.
 */
import type { Food, LineItem } from './types';
import { lineFromFood, scalePer100 } from './nutrition';
import { withEstimate } from './estimates';

export interface MassModel {
  w: number[];
  mu: number[];
  bias: number;
  quantiles: { low: number; normal: number; high: number };
  test: { plates: number; maeGrams: number; medianRelError: number; highCoverage: number; rangeCoverage: number };
}

export interface MassRange {
  low: number;
  normal: number;
  high: number;
  /** Part de l'assiette proposée par défaut (1 pour le 1er aliment, ½ pour les suivants). */
  defaultShare?: number;
}

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

/**
 * `embeddings` : vecteurs de la photo (zone 0 = image entière, puis les zones), non
 * nécessairement normalisés. Avec une seule zone (mode rapide), la moyenne des zones
 * est remplacée par l'image entière (estimation un peu moins bonne).
 */
export function estimatePlateMass(embeddings: Float32Array, zones: number, model: MassModel): MassRange | null {
  const dim = model.w.length / 2;
  if (zones < 1 || embeddings.length < zones * dim || model.mu.length !== model.w.length) return null;
  const unit = (z: number) => {
    const v = embeddings.subarray(z * dim, (z + 1) * dim);
    let n = 0;
    for (let k = 0; k < dim; k++) n += v[k] * v[k];
    n = Math.sqrt(n) || 1;
    return Array.from(v, (x) => x / n);
  };
  const whole = unit(0);
  const mean = new Array(dim).fill(0);
  const zs = zones > 1 ? Array.from({ length: zones - 1 }, (_, i) => unit(i + 1)) : [whole];
  for (const z of zs) for (let k = 0; k < dim; k++) mean[k] += z[k] / zs.length;
  const x = [...whole, ...mean];
  let s = model.bias;
  for (let k = 0; k < x.length; k++) s += (x[k] - model.mu[k]) * model.w[k];
  if (!Number.isFinite(s)) return null;
  const q = model.quantiles;
  return { low: round5(Math.exp(s + q.low)), normal: round5(Math.exp(s + q.normal)), high: round5(Math.exp(s + q.high)) };
}

/** Part de l'assiette attribuée à un aliment (« la moitié de l'assiette, ce sont des frites »). */
export const PLATE_SHARES: [number, string][] = [[1, 'Toute l’assiette'], [0.75, '¾'], [0.5, 'La moitié'], [1 / 3, 'Un tiers'], [0.25, 'Un quart']];

export function shareOf(m: MassRange, share: number): MassRange {
  return { low: round5(m.low * share), normal: round5(m.normal * share), high: round5(m.high * share) };
}

export function photoMassReasons(m: MassRange, share: number): { assumption: string; high: string } {
  const part = share === 1 ? 'toute l’assiette' : `${Math.round(share * 100)} % de l’assiette`;
  return {
    assumption: `Poids estimé sur la photo : ~${m.normal} g (${part} ; fourchette ${m.low}–${m.high} g). Estimation statistique, pas une pesée.`,
    high: `Poids haut estimé sur la photo : ${m.high} g au lieu de ${m.normal} g (dans ~8 cas sur 10, le poids réel est inférieur).`,
  };
}

/** Ligne pour un aliment de la table (solide, en g) dont la quantité vient du poids estimé sur la photo. */
export function foodLineFromPhoto(food: Food, m: MassRange, share: number, id: string): LineItem | null {
  if (food.basis !== 'g') return null;
  const r = shareOf(m, share);
  const base = lineFromFood(food, { unit: 'g', count: r.normal }, id, 'rough');
  if (!base) return null;
  const why = photoMassReasons(r, share);
  return withEstimate({ ...base, unitLabel: `~${r.normal} g (photo)` }, {
    mean: base.nutrients,
    high: scalePer100(food.per100, r.high),
    low: scalePer100(food.per100, r.low),
    chosen: 'mean',
    highReasons: [why.high],
    assumptions: [why.assumption],
    highlightHigh: null,
    method: 'visual',
  });
}
