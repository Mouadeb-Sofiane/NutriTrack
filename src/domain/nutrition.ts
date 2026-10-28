/**
 * Calculs nutritionnels purs (aucune dépendance à l'interface ou au stockage).
 */
import type { BaseUnit, Food, LineItem, Nutrients, NutrientKey, Precision, ServingSize, SourceInfo } from './types';
import { NUTRIENT_KEYS } from './types';

export const EMPTY_NUTRIENTS: Nutrients = { kcal: null, protein: null, carbs: null, fat: null };
export const ZERO_NUTRIENTS: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/**
 * Marge d'incertitude appliquée à la QUANTITÉ selon sa précision.
 * Heuristique documentée (et non une probabilité statistique) :
 * - exact : pesé ou lu sur l'emballage → pas de marge sur la quantité ;
 * - approx : mesure ménagère (cuillère, verre, pièce) → ±20 % ;
 * - rough : estimation visuelle (photo, « portion moyenne ») → ±40 %.
 */
export const PRECISION_MARGIN: Record<Precision, number> = { exact: 0, approx: 0.2, rough: 0.4 };

export const PRECISION_LABEL: Record<Precision, string> = {
  exact: 'Quantité pesée ou lue',
  approx: 'Quantité approximative',
  rough: 'Estimation visuelle',
};

export function isValidNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Nettoie une valeur nutritionnelle : négatif / NaN → null (invalide, donc inconnue). */
export function cleanNutrient(n: unknown): number | null {
  if (!isValidNumber(n) || n < 0) return null;
  return n;
}

export function cleanNutrients(n: Partial<Nutrients> | null | undefined): Nutrients {
  return {
    kcal: cleanNutrient(n?.kcal),
    protein: cleanNutrient(n?.protein),
    carbs: cleanNutrient(n?.carbs),
    fat: cleanNutrient(n?.fat),
  };
}

/** Met à l'échelle des valeurs « pour 100 » vers une quantité donnée. */
export function scalePer100(per100: Nutrients, amount: number): Nutrients {
  if (!isValidNumber(amount) || amount < 0) return { ...EMPTY_NUTRIENTS };
  const f = amount / 100;
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of NUTRIENT_KEYS) {
    const v = cleanNutrient(per100[k]);
    out[k] = v == null ? null : v * f;
  }
  return out;
}

export function multiplyNutrients(n: Nutrients, factor: number): Nutrients {
  const out = { ...EMPTY_NUTRIENTS };
  if (!isValidNumber(factor) || factor < 0) return out;
  for (const k of NUTRIENT_KEYS) {
    const v = cleanNutrient(n[k]);
    out[k] = v == null ? null : v * factor;
  }
  return out;
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Nombre de lignes pour lesquelles la valeur est inconnue. */
  missing: Record<NutrientKey, number>;
  itemCount: number;
  kcalRange: { min: number; max: number };
}

export function emptyTotals(): Totals {
  return {
    kcal: 0, protein: 0, carbs: 0, fat: 0,
    missing: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    itemCount: 0,
    kcalRange: { min: 0, max: 0 },
  };
}

/** Somme des lignes : les valeurs inconnues sont comptées comme manquantes, pas comme des zéros cachés. */
export function sumItems(items: Pick<LineItem, 'nutrients' | 'kcalRange'>[]): Totals {
  const t = emptyTotals();
  for (const it of items) {
    t.itemCount++;
    for (const k of NUTRIENT_KEYS) {
      const v = cleanNutrient(it.nutrients[k]);
      if (v == null) t.missing[k]++;
      else t[k] += v;
    }
    const kcal = cleanNutrient(it.nutrients.kcal);
    if (kcal != null) {
      const r = it.kcalRange && isValidNumber(it.kcalRange.min) && isValidNumber(it.kcalRange.max) ? it.kcalRange : { min: kcal, max: kcal };
      t.kcalRange.min += Math.max(0, r.min);
      t.kcalRange.max += Math.max(0, r.max);
    }
  }
  return t;
}

export function mergeTotals(list: Totals[]): Totals {
  const t = emptyTotals();
  for (const x of list) {
    for (const k of NUTRIENT_KEYS) {
      t[k] += x[k];
      t.missing[k] += x.missing[k];
    }
    t.itemCount += x.itemCount;
    t.kcalRange.min += x.kcalRange.min;
    t.kcalRange.max += x.kcalRange.max;
  }
  return t;
}

export function rangeFor(kcal: number | null, precision: Precision, extraMargin = 0): { min: number; max: number } | null {
  if (kcal == null) return null;
  const m = Math.min(0.9, PRECISION_MARGIN[precision] + extraMargin);
  return { min: kcal * (1 - m), max: kcal * (1 + m) };
}

/** Une fourchette n'est utile que si elle est significativement plus large que l'estimation centrale. */
export function hasMeaningfulRange(t: Pick<Totals, 'kcal' | 'kcalRange'>): boolean {
  return t.kcal > 0 && t.kcalRange.max - t.kcalRange.min > Math.max(20, t.kcal * 0.05);
}

/** Convertit une quantité vers l'unité de base de l'aliment. null si la conversion n'est pas fiable. */
export function toBaseAmount(food: Pick<Food, 'basis' | 'density'>, amount: number, unit: BaseUnit): number | null {
  if (!isValidNumber(amount) || amount < 0) return null;
  if (unit === food.basis) return amount;
  if (!food.density || food.density <= 0) return null; // pas de 1 ml = 1 g implicite
  return unit === 'ml' ? amount * food.density : amount / food.density;
}

export interface QuantityChoice {
  /** 'g' | 'ml' | id d'une ServingSize */
  unit: string;
  count: number;
}

/** Construit une ligne figée à partir d'un aliment et d'une quantité choisie. */
export function lineFromFood(food: Food, choice: QuantityChoice, id: string, precisionOverride?: Precision): LineItem | null {
  if (!isValidNumber(choice.count) || choice.count <= 0) return null;
  let base: number | null;
  let precision: Precision;
  let unitLabel: string | undefined;
  let unit: LineItem['unit'];
  if (choice.unit === 'g' || choice.unit === 'ml') {
    base = toBaseAmount(food, choice.count, choice.unit);
    precision = 'exact';
    unit = choice.unit;
  } else {
    const s: ServingSize | undefined = food.servings.find((x) => x.id === choice.unit);
    if (!s) return null;
    base = s.amount * choice.count;
    precision = s.precision;
    unit = 'serving';
    unitLabel = s.label;
  }
  if (base == null) return null;
  precision = precisionOverride ?? precision;
  const nutrients = scalePer100(food.per100, base);
  return {
    id,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    foodId: food.id,
    quantity: choice.count,
    unit,
    unitLabel,
    baseAmount: base,
    baseUnit: food.basis,
    nutrients,
    kcalRange: rangeFor(nutrients.kcal, precision),
    precision,
    source: food.source,
  };
}

/** Ligne saisie à la main (valeurs pour la quantité consommée). */
export function manualLine(id: string, name: string, nutrients: Partial<Nutrients>, opts: { quantity?: number | null; unit?: LineItem['unit']; unitLabel?: string; precision?: Precision; source?: SourceInfo; note?: string } = {}): LineItem {
  const n = cleanNutrients(nutrients);
  const precision = opts.precision ?? 'approx';
  return {
    id,
    name: name.trim() || 'Aliment',
    quantity: opts.quantity ?? null,
    unit: opts.unit ?? 'none',
    unitLabel: opts.unitLabel,
    nutrients: n,
    kcalRange: rangeFor(n.kcal, precision),
    precision,
    source: opts.source ?? { kind: 'manual' },
    note: opts.note,
  };
}

/** Recalcule une ligne issue d'un aliment après changement de quantité (si possible). */
export function rescaleLine(item: LineItem, newQuantity: number): LineItem {
  if (!isValidNumber(newQuantity) || newQuantity <= 0 || !item.quantity || item.quantity <= 0) return item;
  const f = newQuantity / item.quantity;
  const nutrients = multiplyNutrients(item.nutrients, f);
  const e = item.estimate;
  return {
    ...item,
    estimate: e
      ? { ...e, mean: multiplyNutrients(e.mean, f), high: multiplyNutrients(e.high, f), low: e.low ? multiplyNutrients(e.low, f) : null, custom: e.custom ? multiplyNutrients(e.custom, f) : null }
      : undefined,
    quantity: newQuantity,
    baseAmount: item.baseAmount != null ? item.baseAmount * f : item.baseAmount,
    nutrients,
    kcalRange: item.kcalRange ? { min: item.kcalRange.min * f, max: item.kcalRange.max * f } : rangeFor(nutrients.kcal, item.precision),
  };
}

export function withPrecision(item: LineItem, precision: Precision): LineItem {
  // Une ligne avec estimation moyenne/haute garde la fourchette issue de ses hypothèses.
  if (item.estimate) return { ...item, precision };
  return { ...item, precision, kcalRange: rangeFor(item.nutrients.kcal, precision) };
}

export interface NutrientCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Contrôle de cohérence de valeurs « pour 100 g/ml ». */
export function checkPer100(n: Nutrients, basis: BaseUnit): NutrientCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    if (v != null && (!isValidNumber(v) || v < 0)) errors.push('Les valeurs ne peuvent pas être négatives.');
  }
  if (n.kcal != null && n.kcal > 950) errors.push('Plus de 900 kcal pour 100 g est impossible (l’huile pure en contient ~900).');
  const macroSum = (n.protein ?? 0) + (n.carbs ?? 0) + (n.fat ?? 0);
  if (basis === 'g' && macroSum > 101) errors.push('Protéines + glucides + lipides dépassent 100 g pour 100 g.');
  if (n.kcal != null && n.protein != null && n.carbs != null && n.fat != null) {
    const est = n.protein * 4 + n.carbs * 4 + n.fat * 9;
    if (est > 0 && Math.abs(est - n.kcal) > Math.max(40, n.kcal * 0.25)) {
      warnings.push(`Les macronutriments correspondent à ~${Math.round(est)} kcal, différent des ${Math.round(n.kcal)} kcal indiquées (fibres, alcool ou erreur de saisie ?).`);
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings };
}

/** Estime les kcal à partir des macros (4/4/9) quand elles sont toutes connues. */
export function kcalFromMacros(n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number | null {
  if (n.protein == null || n.carbs == null || n.fat == null) return null;
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

export function fmtKcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('fr-FR');
}

export function fmtG(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
