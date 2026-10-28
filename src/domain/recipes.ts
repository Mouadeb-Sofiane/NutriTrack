/**
 * Recettes : calcul des totaux, des portions et de la consommation.
 * Une recette est une RÉFÉRENCE réutilisable ; un repas est ce qui a été réellement mangé.
 */
import type { LineItem, Nutrients, Precision, Recipe, RecipeConsumption } from './types';
import { cleanNutrients, isValidNumber, multiplyNutrients, PRECISION_MARGIN, rangeFor, sumItems, type Totals } from './nutrition';

export interface RecipeNutrition {
  total: Totals;
  perServing: Totals;
  basis: 'ingredients' | 'manual' | 'none';
  /** Qualité de l'estimation, la plus faible des précisions utilisées. */
  precision: Precision;
  missingQuantities: number;
}

const precisionRank: Record<Precision, number> = { exact: 0, approx: 1, rough: 2 };

export function weakestPrecision(list: Precision[]): Precision {
  return list.reduce<Precision>((acc, p) => (precisionRank[p] > precisionRank[acc] ? p : acc), 'exact');
}

function scaleTotals(t: Totals, f: number): Totals {
  return {
    kcal: t.kcal * f,
    protein: t.protein * f,
    carbs: t.carbs * f,
    fat: t.fat * f,
    missing: { ...t.missing },
    itemCount: t.itemCount,
    kcalRange: { min: t.kcalRange.min * f, max: t.kcalRange.max * f },
  };
}

export function safeServings(n: unknown): number {
  return isValidNumber(n) && n > 0 ? n : 1;
}

export function recipeNutrition(r: Pick<Recipe, 'ingredients' | 'servings' | 'manualTotal' | 'manualPrecision'>): RecipeNutrition {
  const servings = safeServings(r.servings);
  const manual = r.manualTotal ? cleanNutrients(r.manualTotal) : null;
  if (manual && manual.kcal != null) {
    const precision = r.manualPrecision ?? 'rough';
    const item = { nutrients: manual, kcalRange: rangeFor(manual.kcal, precision) };
    const total = sumItems([item]);
    return { total, perServing: scaleTotals(total, 1 / servings), basis: 'manual', precision, missingQuantities: 0 };
  }
  if (!r.ingredients.length) {
    const total = sumItems([]);
    return { total, perServing: total, basis: 'none', precision: 'rough', missingQuantities: 0 };
  }
  const total = sumItems(r.ingredients);
  const missingQuantities = r.ingredients.filter((i) => i.quantity == null).length;
  // Les lignes sans calories ne sont pas comptées : elles ne doivent pas non plus dégrader la précision affichée.
  const precision = weakestPrecision(r.ingredients.filter((i) => i.nutrients.kcal != null).map((i) => i.precision));
  return { total, perServing: scaleTotals(total, 1 / servings), basis: 'ingredients', precision, missingQuantities };
}

export type PortionSize = 'small' | 'usual' | 'large';
/** Facteurs appliqués à « une portion » de la recette. Heuristique, ajustable via « portion personnalisée ». */
export const PORTION_SIZE_FACTOR: Record<PortionSize, number> = { small: 0.75, usual: 1, large: 1.3 };
export const PORTION_SIZE_LABEL: Record<PortionSize, string> = { small: 'Petite', usual: 'Habituelle', large: 'Grande' };

/**
 * Dans un plat familial, deux assiettes ne contiennent pas exactement la même chose
 * (plus de viande, de sauce…). Quand on mange « une portion » ou « une fraction du plat »,
 * on ajoute ±15 % d'incertitude à la fourchette. Si la quantité est pesée, on ne l'ajoute pas.
 */
export const UNEVEN_PORTION_MARGIN = 0.15;

/** servings : n portions ; fraction : part du plat entier (0,25) ; grams : nécessite le poids total. */
export type Consumption = RecipeConsumption;

export function consumptionFactor(r: Pick<Recipe, 'servings' | 'totalWeightG'>, c: Consumption): number | null {
  const servings = safeServings(r.servings);
  switch (c.kind) {
    case 'servings':
      if (!isValidNumber(c.servings) || c.servings <= 0) return null;
      return (c.servings * PORTION_SIZE_FACTOR[c.size]) / servings;
    case 'fraction':
      if (!isValidNumber(c.fraction) || c.fraction <= 0) return null;
      return c.fraction;
    case 'grams':
      if (!isValidNumber(c.grams) || c.grams <= 0 || !r.totalWeightG || r.totalWeightG <= 0) return null;
      return c.grams / r.totalWeightG;
  }
}

export function describeConsumption(c: Consumption): string {
  switch (c.kind) {
    case 'servings': {
      const n = c.servings.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
      const s = c.size === 'usual' ? '' : ` (${PORTION_SIZE_LABEL[c.size].toLowerCase()})`;
      return `${n} portion${c.servings > 1 ? 's' : ''}${s}`;
    }
    case 'fraction':
      return `${fractionLabel(c.fraction)} du plat`;
    case 'grams':
      return `${Math.round(c.grams)} g`;
  }
}

export function fractionLabel(f: number): string {
  const known: [number, string][] = [[1, 'la totalité'], [0.5, 'la moitié'], [1 / 3, 'un tiers'], [0.25, 'un quart'], [1 / 6, 'un sixième'], [1 / 8, 'un huitième']];
  for (const [v, l] of known) if (Math.abs(v - f) < 0.005) return l;
  return `${Math.round(f * 100)} %`;
}

/** Crée la ligne de repas (copie figée) correspondant à la part consommée d'une recette. */
export function lineFromRecipe(r: Recipe, c: Consumption, id: string): LineItem | null {
  const f = consumptionFactor(r, c);
  if (f == null) return null;
  const nut = recipeNutrition(r);
  if (nut.basis === 'none') {
    return {
      id, name: r.name, recipeId: r.id, recipeVersion: r.version,
      quantity: c.kind === 'servings' ? c.servings : c.kind === 'fraction' ? c.fraction : c.grams,
      unit: c.kind === 'grams' ? 'g' : 'portion', unitLabel: describeConsumption(c),
      nutrients: { kcal: null, protein: null, carbs: null, fat: null }, kcalRange: null,
      precision: 'rough', source: { kind: 'recipe', label: 'Recette sans valeurs nutritionnelles' }, consumption: c,
    };
  }
  const t = nut.total;
  const known = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (t.missing[k] === t.itemCount && t.itemCount > 0 ? null : t[k]);
  const totalN: Nutrients = { kcal: known('kcal'), protein: known('protein'), carbs: known('carbs'), fat: known('fat') };
  const nutrients = multiplyNutrients(totalN, f);
  const extra = c.kind === 'grams' ? 0 : UNEVEN_PORTION_MARGIN;
  // Fourchette : celle de la recette (hypothèses sur les ingrédients) élargie par l'incertitude de portion.
  const kcalRange = nutrients.kcal != null
    ? { min: t.kcalRange.min * f * (1 - extra), max: t.kcalRange.max * f * (1 + extra) }
    : null;
  const precision: Precision = c.kind === 'grams' ? nut.precision : weakestPrecision([nut.precision, 'approx']);
  return {
    id,
    name: r.name,
    recipeId: r.id,
    recipeVersion: r.version,
    quantity: c.kind === 'servings' ? c.servings : c.kind === 'fraction' ? c.fraction : c.grams,
    unit: c.kind === 'grams' ? 'g' : 'portion',
    unitLabel: describeConsumption(c),
    baseAmount: c.kind === 'grams' ? c.grams : r.totalWeightG ? r.totalWeightG * f : null,
    baseUnit: 'g',
    nutrients,
    kcalRange,
    precision,
    source: { kind: 'recipe', label: nut.basis === 'manual' ? 'Recette (total estimé)' : 'Recette (somme des ingrédients)' },
    consumption: c,
  };
}

/**
 * Recalcule, À LA DEMANDE de l'utilisateur, les lignes d'un repas issues d'une recette
 * avec sa nouvelle version. Les autres lignes ne sont pas touchées.
 */
export function refreshRecipeLines(items: LineItem[], r: Recipe): LineItem[] {
  return items.map((it) => {
    if (it.recipeId !== r.id || !it.consumption) return it;
    return lineFromRecipe(r, it.consumption, it.id) ?? it;
  });
}

/** Crée une variante (nouvel objet) sans modifier la recette d'origine. */
export function makeVariant(r: Recipe, id: string, label: string, now: string): Recipe {
  return {
    ...structuredClone(r),
    id,
    name: `${r.name} — ${label}`,
    parentId: r.parentId ?? r.id,
    variantLabel: label,
    favorite: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/* ---------- Import d'une recette depuis un texte ---------- */

export interface ParsedLine {
  raw: string;
  name: string;
  quantity: number | null;
  /** 'g' | 'ml' | libellé de mesure ménagère (« c. à soupe ») | 'pièce' | null */
  unit: string | null;
}

const UNIT_PATTERNS: [RegExp, string][] = [
  [/^(kg|kilos?|kilogrammes?)\b/, 'kg'],
  [/^(g|gr|grammes?)\b/, 'g'],
  [/^(cl|centilitres?)\b/, 'cl'],
  [/^(ml|millilitres?)\b/, 'ml'],
  [/^(l|litres?)\b/, 'l'],
  [/^(c\.? ?à ?(soupe|s\.?)|cas|cs|cuill?(e|è)res? à soupe)(?=\s|$)/, 'c. à soupe'],
  [/^(c\.? ?à ?(caf(e|é)|c\.?)|cac|cc|cuill?(e|è)res? à caf(e|é))(?=\s|$)/, 'c. à café'],
  [/^(verres?)\b/, 'verre'],
  [/^(bols?)\b/, 'bol'],
  [/^(louches?)\b/, 'louche'],
  [/^(tranches?)\b/, 'tranche'],
  [/^(pincées?)\b/, 'pincée'],
  [/^(poignées?)\b/, 'poignée'],
  [/^(boîtes?|boites?)\b/, 'boîte'],
];

/** Analyse une ligne du type « 200 g de riz », « 2 c. à soupe d'huile », « 1 oignon », « sel ». */
export function parseIngredientLine(raw: string): ParsedLine | null {
  let s = raw.replace(/^[\s\-•*·–]+/, '').trim();
  if (!s) return null;
  let quantity: number | null = null;
  const num = s.match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?/);
  if (num) {
    const a = parseFloat(num[1].replace(',', '.'));
    quantity = num[2] ? a / parseFloat(num[2]) : a;
    s = s.slice(num[0].length).trim();
  } else if (/^(un|une)\s/i.test(s)) {
    quantity = 1;
    s = s.replace(/^(un|une)\s/i, '');
  } else if (/^½/.test(s)) {
    quantity = 0.5;
    s = s.slice(1).trim();
  }
  let unit: string | null = null;
  const lower = s.toLowerCase();
  for (const [re, u] of UNIT_PATTERNS) {
    const m = lower.match(re);
    if (m) {
      unit = u;
      s = s.slice(m[0].length).trim();
      break;
    }
  }
  if (unit === 'kg' && quantity != null) { quantity *= 1000; unit = 'g'; }
  if (unit === 'cl' && quantity != null) { quantity *= 10; unit = 'ml'; }
  if (unit === 'l' && quantity != null) { quantity *= 1000; unit = 'ml'; }
  s = s.replace(/^(de |d'|d’|des |du )/i, '').trim();
  if (quantity != null && unit == null) unit = 'pièce';
  if (!s) return null;
  return { raw, name: s, quantity, unit };
}

export function parseRecipeText(text: string): { title: string | null; lines: ParsedLine[] } {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let title: string | null = null;
  const lines: ParsedLine[] = [];
  for (const row of rows) {
    if (/^(ingr[ée]dients?|pr[ée]paration|instructions?)\s*:?$/i.test(row)) continue;
    const p = parseIngredientLine(row);
    if (!p) continue;
    if (!title && p.quantity == null && lines.length === 0 && !/^[-•*]/.test(row)) {
      title = row;
      continue;
    }
    lines.push(p);
  }
  return { title, lines };
}

export const HOUSEHOLD_ML: Record<string, number> = {
  'c. à soupe': 15,
  'c. à café': 5,
  verre: 200,
  bol: 350,
  louche: 100,
};

export const PRECISION_FROM_UNIT = (unit: string | null): Precision =>
  unit === 'g' || unit === 'ml' ? 'exact' : unit && (unit in HOUSEHOLD_ML || unit === 'pièce' || unit === 'tranche') ? 'approx' : 'rough';

export { PRECISION_MARGIN };
