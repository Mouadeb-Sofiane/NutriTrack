/**
 * Estimations incertaines : estimation MOYENNE et estimation HAUTE.
 *
 * - La moyenne repose sur les hypothèses les plus plausibles.
 * - La haute repose sur des hypothèses explicites (portion plus grande, plus de sauce,
 *   friture plus grasse…), jamais sur un pourcentage choisi au hasard ni sur le pire cas.
 * - L'utilisateur choisit la valeur retenue (moyenne par défaut) ; les deux restent stockées.
 * Ce ne sont pas des statistiques : aucune distribution ne justifie de probabilité.
 */
import type { EstimateChoice, EstimateInfo, LineItem, Nutrients } from './types';
import { NUTRIENT_KEYS } from './types';
import { cleanNutrients, isValidNumber, multiplyNutrients } from './nutrition';

/** En dessous de cet écart, montrer deux valeurs n'apporte rien. */
export const MEANINGFUL_HIGH_GAP = 0.08;

export function hasMeaningfulGap(e: Pick<EstimateInfo, 'mean' | 'high'>): boolean {
  const m = e.mean.kcal ?? 0;
  const h = e.high.kcal ?? 0;
  return h - m > Math.max(15, m * MEANINGFUL_HIGH_GAP);
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out = { ...a };
  for (const k of NUTRIENT_KEYS) {
    const x = a[k];
    const y = b[k];
    out[k] = x == null || y == null ? (x ?? y ?? null) : x + y;
  }
  return out;
}

/** Valeurs retenues selon le choix de l'utilisateur. */
export function retainedNutrients(e: EstimateInfo): Nutrients {
  if (e.chosen === 'custom' && e.custom && e.custom.kcal != null) return e.custom;
  return e.chosen === 'high' ? e.high : e.mean;
}

export function rangeOf(e: EstimateInfo): { min: number; max: number } | null {
  if (e.chosen === 'custom' && e.custom?.kcal != null) return { min: e.custom.kcal, max: e.custom.kcal };
  const mean = e.mean.kcal;
  const high = e.high.kcal;
  if (mean == null || high == null) return null;
  return { min: Math.min(e.low?.kcal ?? mean, mean), max: Math.max(high, mean) };
}

/** Attache une estimation à une ligne et synchronise les valeurs retenues. */
export function withEstimate(item: LineItem, e: EstimateInfo): LineItem {
  const estimate: EstimateInfo = { ...e, mean: cleanNutrients(e.mean), high: cleanNutrients(e.high), low: e.low ? cleanNutrients(e.low) : null };
  return { ...item, estimate, nutrients: retainedNutrients(estimate), kcalRange: rangeOf(estimate) };
}

/**
 * Change la valeur retenue. Pour une valeur personnalisée, seules les calories sont
 * connues : les macros sont ajustées proportionnellement à l'estimation moyenne
 * (et signalées comme telles), ou laissées inconnues si la moyenne n'en a pas.
 */
export function chooseEstimate(item: LineItem, chosen: EstimateChoice, customKcal?: number | null): LineItem {
  if (!item.estimate) return item;
  let custom: Nutrients | null = null;
  if (chosen === 'custom') {
    if (!isValidNumber(customKcal) || customKcal < 0) return item;
    const base = item.estimate.mean;
    const f = base.kcal && base.kcal > 0 ? customKcal / base.kcal : null;
    custom = f == null ? { kcal: customKcal, protein: null, carbs: null, fat: null } : { ...multiplyNutrients(base, f), kcal: customKcal };
  }
  return withEstimate(item, { ...item.estimate, chosen, custom });
}

/** Met à l'échelle une estimation (changement de quantité). */
export function scaleEstimate(e: EstimateInfo, f: number): EstimateInfo {
  return {
    ...e,
    mean: multiplyNutrients(e.mean, f),
    high: multiplyNutrients(e.high, f),
    low: e.low ? multiplyNutrients(e.low, f) : null,
    custom: e.custom ? multiplyNutrients(e.custom, f) : null,
  };
}

export interface ItemScenario {
  retained: number | null;
  mean: number | null;
  high: number | null;
}

/**
 * Valeurs d'une ligne dans chaque scénario :
 * - ligne avec estimation : moyenne / haute enregistrées ; si l'utilisateur a saisi sa
 *   propre valeur, elle s'applique aux deux scénarios (il en sait plus que l'estimation) ;
 * - ligne estimée à l'œil sans estimation détaillée : haute = haut de sa fourchette ;
 * - autre ligne (pesée, étiquette, mesure ménagère) : même valeur dans les deux scénarios.
 */
export function itemScenario(it: LineItem): ItemScenario {
  const retained = it.nutrients.kcal;
  if (it.estimate) {
    if (it.estimate.chosen === 'custom' && it.estimate.custom?.kcal != null) {
      return { retained, mean: it.estimate.custom.kcal, high: it.estimate.custom.kcal };
    }
    return { retained, mean: it.estimate.mean.kcal, high: it.estimate.high.kcal };
  }
  if (retained == null) return { retained: null, mean: null, high: null };
  if (it.precision === 'rough' && it.kcalRange) return { retained, mean: retained, high: Math.max(retained, it.kcalRange.max) };
  return { retained, mean: retained, high: retained };
}

export interface ScenarioTotals {
  retained: number;
  mean: number;
  high: number;
  /** Lignes dont l'estimation haute diffère vraiment de la moyenne. */
  uncertainCount: number;
  /** Lignes pour lesquelles l'utilisateur a retenu l'estimation haute. */
  highChosenCount: number;
  customCount: number;
}

export function scenarioTotals(items: LineItem[]): ScenarioTotals {
  const t: ScenarioTotals = { retained: 0, mean: 0, high: 0, uncertainCount: 0, highChosenCount: 0, customCount: 0 };
  for (const it of items) {
    const s = itemScenario(it);
    t.retained += s.retained ?? 0;
    t.mean += s.mean ?? 0;
    t.high += s.high ?? 0;
    if (s.high != null && s.mean != null && s.high - s.mean > Math.max(15, s.mean * MEANINGFUL_HIGH_GAP)) t.uncertainCount++;
    if (it.estimate?.chosen === 'high') t.highChosenCount++;
    if (it.estimate?.chosen === 'custom') t.customCount++;
  }
  return t;
}

/* ---------- Doublons ---------- */

/** Signature d'une ligne (même aliment, même portion, même valeur). */
export function itemSignature(it: LineItem): string {
  const id = it.estimate?.catalogId ?? it.recipeId ?? it.foodId ?? it.name.trim().toLowerCase();
  const portion = it.estimate?.portionId ?? it.unitLabel ?? it.unit;
  return `${id}|${portion}|${it.quantity ?? ''}|${Math.round(it.nutrients.kcal ?? -1)}`;
}

/** Ligne déjà présente dans le repas en cours (même aliment, même portion) ? */
export function findDuplicateItem(items: LineItem[], candidate: LineItem): LineItem | null {
  const sig = itemSignature(candidate);
  return items.find((i) => i.id === candidate.id || itemSignature(i) === sig) ?? null;
}

/**
 * Un repas identique (même jour, même type, mêmes lignes) a-t-il été enregistré il y a
 * peu ? Sert à éviter un double enregistrement (double appui, retour arrière…).
 */
export function findRecentDuplicateMeal<T extends { id: string; date: string; mealType: string; items: LineItem[]; createdAt: string }>(
  existing: T[],
  draft: { id?: string; date: string; mealType: string; items: LineItem[] },
  now: Date,
  windowMinutes = 30,
): T | null {
  const sig = draft.items.map(itemSignature).sort().join(';');
  return (
    existing.find(
      (m) =>
        m.id !== draft.id &&
        m.date === draft.date &&
        m.mealType === draft.mealType &&
        now.getTime() - new Date(m.createdAt).getTime() < windowMinutes * 60000 &&
        m.items.map(itemSignature).sort().join(';') === sig,
    ) ?? null
  );
}
