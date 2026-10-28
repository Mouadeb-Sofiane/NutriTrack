/** Statistiques calculées UNIQUEMENT à partir des données réellement enregistrées. */
import type { MealEntry, WeightEntry } from './types';
import { emptyTotals, mergeTotals, sumItems, type Totals } from './nutrition';
import { addDays, daysBetween, weekStart } from './dates';
import { normalize } from './referenceFoods';
import { itemSignature } from './estimates';
import type { LineItem } from './types';

export function mealTotals(m: Pick<MealEntry, 'items'>): Totals {
  return sumItems(m.items);
}

export function dayTotals(meals: MealEntry[], date: string): Totals {
  return mergeTotals(meals.filter((m) => m.date === date).map(mealTotals));
}

export function totalsByDate(meals: MealEntry[]): Map<string, Totals> {
  const map = new Map<string, Totals>();
  for (const m of meals) {
    const t = mealTotals(m);
    map.set(m.date, map.has(m.date) ? mergeTotals([map.get(m.date)!, t]) : t);
  }
  return map;
}

export interface PeriodSummary {
  /** Jours avec au moins un repas : les jours vides ne sont PAS comptés comme 0 kcal. */
  loggedDays: number;
  totalDays: number;
  avg: { kcal: number; protein: number; carbs: number; fat: number } | null;
  days: { date: string; totals: Totals | null }[];
}

export function periodSummary(meals: MealEntry[], from: string, to: string): PeriodSummary {
  const byDate = totalsByDate(meals.filter((m) => m.date >= from && m.date <= to));
  const days: PeriodSummary['days'] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, totals: byDate.get(d) ?? null });
  const logged = days.filter((d) => d.totals);
  const avg = logged.length
    ? {
        kcal: logged.reduce((s, d) => s + d.totals!.kcal, 0) / logged.length,
        protein: logged.reduce((s, d) => s + d.totals!.protein, 0) / logged.length,
        carbs: logged.reduce((s, d) => s + d.totals!.carbs, 0) / logged.length,
        fat: logged.reduce((s, d) => s + d.totals!.fat, 0) / logged.length,
      }
    : null;
  return { loggedDays: logged.length, totalDays: daysBetween(from, to) + 1, avg, days };
}

export function weeklyAverages(meals: MealEntry[], from: string, to: string): { week: string; avgKcal: number; days: number }[] {
  const byDate = totalsByDate(meals.filter((m) => m.date >= from && m.date <= to));
  const weeks = new Map<string, { sum: number; days: number }>();
  for (const [date, t] of byDate) {
    const w = weekStart(date);
    const cur = weeks.get(w) ?? { sum: 0, days: 0 };
    cur.sum += t.kcal;
    cur.days++;
    weeks.set(w, cur);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, avgKcal: v.sum / v.days, days: v.days }));
}

export function frequentFoods(meals: MealEntry[], limit = 10): { name: string; count: number; kcal: number }[] {
  const map = new Map<string, { name: string; count: number; kcal: number }>();
  for (const m of meals) {
    for (const it of m.items) {
      const key = it.recipeId ?? it.foodId ?? normalize(it.name);
      const cur = map.get(key) ?? { name: it.name, count: 0, kcal: 0 };
      cur.count++;
      cur.kcal += it.nutrients.kcal ?? 0;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, limit);
}

export function sortWeights(w: WeightEntry[]): WeightEntry[] {
  return [...w].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Moyenne mobile sur N jours calendaires (par défaut 7) : lisse les variations
 * d'eau, de glycogène et de contenu digestif. Une pesée isolée n'est pas une tendance.
 */
export function movingAverage(weights: WeightEntry[], windowDays = 7): { date: string; kg: number; avg: number }[] {
  const sorted = sortWeights(weights);
  return sorted.map((w) => {
    const from = addDays(w.date, -(windowDays - 1));
    const win = sorted.filter((x) => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: w.kg, avg: win.reduce((s, x) => s + x.kg, 0) / win.length };
  });
}

export interface WeightProgress {
  start: WeightEntry | null;
  latest: WeightEntry | null;
  change: number | null;
  /** Avancement vers l'objectif (0..1), null si non calculable. */
  progress: number | null;
  /** Tendance (kg/semaine) estimée par régression linéaire sur les 28 derniers jours, si ≥ 4 pesées sur ≥ 14 jours. */
  weeklyTrend: number | null;
}

export function weightProgress(weights: WeightEntry[], targetKg: number | null): WeightProgress {
  const sorted = sortWeights(weights);
  if (!sorted.length) return { start: null, latest: null, change: null, progress: null, weeklyTrend: null };
  const start = sorted[0];
  const latest = sorted[sorted.length - 1];
  const change = latest.kg - start.kg;
  let progress: number | null = null;
  if (targetKg != null && targetKg > 0 && Math.abs(targetKg - start.kg) > 0.05) {
    progress = Math.max(0, Math.min(1, (start.kg - latest.kg) / (start.kg - targetKg)));
  }
  const recent = sorted.filter((w) => w.date >= addDays(latest.date, -27));
  let weeklyTrend: number | null = null;
  if (recent.length >= 4 && daysBetween(recent[0].date, latest.date) >= 14) {
    const xs = recent.map((w) => daysBetween(recent[0].date, w.date));
    const ys = recent.map((w) => w.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    if (den > 0) weeklyTrend = (num / den) * 7;
  }
  return { start, latest, change, progress, weeklyTrend };
}

export { emptyTotals };

/** Aliments récemment consommés (un exemplaire par aliment et portion), du plus récent au plus ancien. */
export function recentDistinctItems(meals: MealEntry[], limit = 30): { item: LineItem; date: string }[] {
  const sorted = [...meals].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const out: { item: LineItem; date: string }[] = [];
  for (const m of sorted) {
    for (const it of m.items) {
      const sig = itemSignature(it);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ item: it, date: m.date });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
