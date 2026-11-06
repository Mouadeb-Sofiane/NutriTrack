/**
 * Plats composés (compositions types) et compositions modifiables.
 *
 * Une composition = une liste d'ingrédients avec leurs grammes pour UNE portion et leurs
 * valeurs pour 100 g. Le calcul est toujours refait à partir des ingrédients : modifier
 * une quantité, retirer, ajouter ou remplacer un ingrédient recalcule immédiatement le plat.
 *
 * Les valeurs d'un plat composé sont des ESTIMATIONS (recette type) : elles sont présentées
 * avec une estimation moyenne et une estimation haute (portion plus copieuse, plus de
 * matière grasse de cuisson), comme le reste de l'application.
 */
import type { EstimateInfo, Food, LineItem, Nutrients } from './types';
import { cleanNutrients, rangeFor } from './nutrition';
import { withEstimate } from './estimates';

export interface CompositionIngredient {
  /** Identifiant local de la ligne (stable pendant l'édition). */
  key: string;
  label: string;
  foodId?: string;
  basis: 'g' | 'ml';
  grams: number;
  /** [kcal, protéines, glucides, lipides, fibres, sucres] pour 100 g/ml (null = inconnu). */
  per100: (number | null)[];
  enabled: boolean;
  /** 'fat' = matière grasse de cuisson ; 'parts' = parties au choix ; 'side' = accompagnement. */
  group?: 'fat' | 'parts' | 'side' | null;
  /** Mesures ménagères propres à l'aliment ([libellé, grammes]) : jamais une conversion universelle. */
  servings?: [string, number][];
  /** Unité choisie pour la saisie (libellé d'une mesure ménagère) et nombre ; les grammes restent la référence. */
  unit?: { label: string; count: number } | null;
}

export interface Dish {
  id: string;
  name: string;
  region: string;
  group: string;
  synonyms: string;
  notes: string[];
  ingredients: CompositionIngredient[];
}

interface RawDish {
  id: string; name: string; region: string; group: string; synonyms: string; notes: string[];
  ingredients: { label: string; foodId: string; food: string; basis: 'g' | 'ml'; g: number; per100: (number | null)[]; optional: boolean; group: string | null; portions?: [string, number][] }[];
}

export function dishFromRaw(r: RawDish): Dish {
  return {
    id: `dish:${r.id}`,
    name: r.name,
    region: r.region,
    group: r.group,
    synonyms: `${r.synonyms}, ${r.region}`,
    notes: r.notes,
    ingredients: r.ingredients.map((i, n) => ({
      key: `i${n}`,
      label: i.label,
      foodId: i.foodId,
      basis: i.basis,
      grams: i.g,
      per100: i.per100,
      enabled: !i.optional,
      group: (i.group as CompositionIngredient['group']) ?? null,
      servings: i.portions,
    })),
  };
}

let cache: Promise<Dish[]> | null = null;
export function loadDishes(): Promise<Dish[]> {
  if (!cache) {
    cache = import('../data/fooddb/dishes.json')
      .then((m) => (m.default as unknown as { dishes: RawDish[] }).dishes.map(dishFromRaw))
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}

export function ingredientFromFood(food: Food, grams: number, key: string): CompositionIngredient {
  const p = food.per100;
  return {
    key,
    label: food.brand ? `${food.name} (${food.brand})` : food.name,
    foodId: food.id,
    basis: food.basis,
    grams,
    per100: [p.kcal, p.protein, p.carbs, p.fat, food.extra?.fiber ?? null, food.extra?.sugars ?? null],
    enabled: true,
    group: food.category === 'Matières grasses' ? 'fat' : null,
    servings: food.servings.map((x) => [x.label, x.amount] as [string, number]),
  };
}

export interface CompositionTotals {
  grams: number;
  nutrients: Nutrients;
  fiber: number | null;
  /** Ingrédients actifs dont une valeur est inconnue (signalés, jamais remplacés par 0). */
  missing: number;
}

export function compositionTotals(list: CompositionIngredient[], opts: { fatFactor?: number; factor?: number } = {}): CompositionTotals {
  const f = opts.factor ?? 1;
  let grams = 0;
  let missing = 0;
  const sum = [0, 0, 0, 0];
  let fiber = 0;
  let fiberKnown = false;
  for (const it of list) {
    if (!it.enabled || !(it.grams > 0)) continue;
    const g = it.grams * f * (it.group === 'fat' ? opts.fatFactor ?? 1 : 1);
    grams += g;
    for (let k = 0; k < 4; k++) {
      const v = it.per100[k];
      if (v == null) missing++;
      else sum[k] += (v * g) / 100;
    }
    if (it.per100[4] != null) { fiber += (it.per100[4]! * g) / 100; fiberKnown = true; }
  }
  return {
    grams,
    nutrients: cleanNutrients({ kcal: sum[0], protein: sum[1], carbs: sum[2], fat: sum[3] }),
    fiber: fiberKnown ? fiber : null,
    missing,
  };
}

/** Ajustements simples de portion, sans saisir de grammes. */
export const PORTION_PRESETS: { id: string; label: string; factor: number }[] = [
  { id: 'half', label: 'Je n’ai pas terminé (½)', factor: 0.5 },
  { id: 'less', label: 'Portion plus petite', factor: 0.75 },
  { id: 'usual', label: 'Portion estimée', factor: 1 },
  { id: 'more', label: 'Un peu plus', factor: 1.25 },
  { id: 'much', label: 'Beaucoup plus', factor: 1.5 },
  { id: 'second', label: 'J’ai repris une 2e portion', factor: 2 },
];

/** Hypothèses du scénario haut : portion copieuse et cuisson plus grasse. */
export const HIGH_PORTION = 1.25;
export const HIGH_FAT = 1.75;

/**
 * Ligne de repas à partir d'une composition. La composition est COPIÉE dans la ligne
 * (historique figé) ; le scénario moyen = composition × facteur, le haut = portion et
 * matière grasse plus généreuses quand la composition est estimée.
 */
export function lineFromComposition(
  name: string,
  list: CompositionIngredient[],
  factor: number,
  id: string,
  opts: { estimated: boolean; dishId?: string; notes?: string[]; recipeId?: string } ,
): LineItem | null {
  const mean = compositionTotals(list, { factor });
  if (!(mean.grams > 0) || mean.nutrients.kcal == null) return null;
  const precision = opts.estimated ? 'rough' : 'approx';
  const base: LineItem = {
    id,
    name,
    foodId: opts.dishId,
    recipeId: opts.recipeId,
    quantity: Math.round(mean.grams),
    unit: 'g',
    baseAmount: mean.grams,
    baseUnit: 'g',
    nutrients: mean.nutrients,
    kcalRange: rangeFor(mean.nutrients.kcal, precision),
    precision,
    source: opts.estimated
      ? { kind: 'estimate', label: 'Composition type estimée (ingrédients USDA)', status: 'estimated' }
      : { kind: 'recipe', label: 'Composition saisie', status: 'user' },
    composition: list.map((i) => ({ ...i })),
    compositionFactor: factor,
  };
  if (!opts.estimated) return base;
  const hasFat = list.some((i) => i.enabled && i.group === 'fat');
  const high = compositionTotals(list, { factor: factor * HIGH_PORTION, fatFactor: HIGH_FAT });
  const low = compositionTotals(list, { factor: factor * 0.8, fatFactor: 0.6 });
  const e: EstimateInfo = {
    mean: mean.nutrients,
    high: high.nutrients,
    low: low.nutrients,
    chosen: 'mean',
    highReasons: [
      `Portion plus copieuse (+${Math.round((HIGH_PORTION - 1) * 100)} %)`,
      ...(hasFat ? [`Matière grasse de cuisson plus généreuse (×${HIGH_FAT.toLocaleString('fr-FR')})`] : []),
    ],
    assumptions: [
      `Composition type : ${list.filter((i) => i.enabled).map((i) => `${i.label} ${Math.round(i.grams * factor)} g`).join(', ')}`,
      ...(opts.notes ?? []),
    ],
    highlightHigh: hasFat ? 'La quantité de matière grasse utilisée à la cuisson est inconnue.' : null,
    method: 'template',
    fraction: factor,
  };
  return withEstimate(base, e);
}
