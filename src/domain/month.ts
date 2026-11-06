/**
 * Vue mensuelle : apports par jour comparés à l'objectif EN VIGUEUR ce jour-là.
 *
 * Les couleurs sont des indicateurs d'écart, jamais un jugement : leur lecture
 * dépend de l'objectif (en prise de masse, dépasser un peu l'objectif est attendu ;
 * en perte de poids, un apport très bas est aussi signalé comme un écart).
 */
import type { ExerciseEntry, GoalMode, MealEntry } from './types';
import type { Totals } from './nutrition';
import { totalsByDate } from './stats';
import { addDays, parseISODate, toISODate } from './dates';
import { dailyBudget } from './energy';
import type { EnergyMethod } from './types';

/** Objectif enregistré à une date (historique : un repas passé garde l'objectif de son époque). */
export interface GoalHistoryEntry {
  from: string; // 'YYYY-MM-DD' : premier jour où cet objectif s'applique
  kcal: number;
  goal: GoalMode;
  manual: boolean;
}

export type DayTone = 'near' | 'moderate' | 'marked' | 'large';

export const TONE_LABEL: Record<DayTone, string> = {
  near: 'Proche de l’objectif',
  moderate: 'Écart modéré',
  marked: 'Écart marqué',
  large: 'Écart important',
};

/**
 * Bornes d'écart relatif (apport / objectif − 1) considérées « proches » puis
 * modérées puis marquées, de chaque côté. Au-delà : écart important.
 * [bas, haut] : bas est négatif (sous l'objectif), haut positif (au-dessus).
 */
const BANDS: Record<GoalMode, { near: [number, number]; moderate: [number, number]; marked: [number, number] }> = {
  // Maintien : symétrique.
  maintain: { near: [-0.1, 0.1], moderate: [-0.2, 0.2], marked: [-0.3, 0.3] },
  custom: { near: [-0.1, 0.1], moderate: [-0.2, 0.2], marked: [-0.3, 0.3] },
  // Perte : un peu en dessous est conforme ; un apport très bas reste signalé.
  lose: { near: [-0.15, 0.05], moderate: [-0.25, 0.15], marked: [-0.35, 0.3] },
  // Prise de masse : un peu au-dessus est conforme ; rester en dessous est l'écart principal.
  gain: { near: [-0.05, 0.15], moderate: [-0.15, 0.25], marked: [-0.3, 0.4] },
};

export function dayTone(consumed: number, target: number, goal: GoalMode): DayTone | null {
  if (!(target > 0) || !Number.isFinite(consumed)) return null;
  const dev = consumed / target - 1;
  const b = BANDS[goal] ?? BANDS.maintain;
  const within = ([lo, hi]: [number, number]) => dev >= lo && dev <= hi;
  if (within(b.near)) return 'near';
  if (within(b.moderate)) return 'moderate';
  if (within(b.marked)) return 'marked';
  return 'large';
}

/** Phrase neutre décrivant l'écart, adaptée à l'objectif. */
export function deviationText(consumed: number, target: number, goal: GoalMode): string {
  const diff = Math.round(consumed - target);
  if (Math.abs(diff) < 1) return 'Pile sur l’objectif';
  const abs = Math.abs(diff).toLocaleString('fr-FR');
  if (diff > 0) return goal === 'gain' ? `${abs} kcal au-delà de l’objectif (surplus)` : `${abs} kcal au-dessus de l’objectif`;
  return `${abs} kcal sous l’objectif`;
}

/** Objectif applicable à une date ; si l'historique est vide, l'objectif actuel. */
export function goalOn(date: string, history: GoalHistoryEntry[], current: { kcal: number; goal: GoalMode } | null): { kcal: number; goal: GoalMode } | null {
  const sorted = [...history].sort((a, b) => a.from.localeCompare(b.from));
  let found: GoalHistoryEntry | null = null;
  for (const h of sorted) if (h.from <= date) found = h;
  if (found) return { kcal: found.kcal, goal: found.goal };
  // Jours antérieurs au premier enregistrement : premier objectif connu, sinon l'actuel.
  if (sorted.length) return { kcal: sorted[0].kcal, goal: sorted[0].goal };
  return current;
}

export interface MonthDay {
  date: string;
  inMonth: boolean;
  totals: Totals | null;
  target: number | null;
  goal: GoalMode | null;
  diff: number | null;
  tone: DayTone | null;
}

export interface MonthStats {
  loggedDays: number;
  daysInMonth: number;
  totalKcal: number;
  avgKcal: number | null;
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  nearDays: number;
  /** Moyenne des écarts (apport − objectif) sur les jours notés. */
  avgDiff: number | null;
  /** Évolution : moyenne par semaine du mois (jours notés uniquement). */
  weeks: { label: string; avgKcal: number | null; days: number }[];
}

export interface MonthView {
  month: string; // 'YYYY-MM'
  label: string;
  /** Grille du lundi précédant le 1er au dimanche suivant le dernier jour. */
  grid: MonthDay[];
  stats: MonthStats;
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  return { first: toISODate(new Date(y, m - 1, 1)), last: toISODate(new Date(y, m, 0)) };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function buildMonthView(
  month: string,
  meals: MealEntry[],
  ctx: {
    history: GoalHistoryEntry[];
    current: { kcal: number; goal: GoalMode } | null;
    exercises?: ExerciseEntry[];
    energyMethod?: EnergyMethod;
    exerciseCredit?: 0 | 0.5 | 1;
  },
): MonthView {
  const { first, last } = monthBounds(month);
  const dow = (parseISODate(first).getDay() + 6) % 7;
  const gridStart = addDays(first, -dow);
  const lastDow = (parseISODate(last).getDay() + 6) % 7;
  const gridEnd = addDays(last, 6 - lastDow);
  const byDate = totalsByDate(meals.filter((m) => m.date >= first && m.date <= last));
  const exByDate = new Map<string, number>();
  for (const e of ctx.exercises ?? []) exByDate.set(e.date, (exByDate.get(e.date) ?? 0) + e.kcal);

  const grid: MonthDay[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const inMonth = d >= first && d <= last;
    const totals = inMonth ? byDate.get(d) ?? null : null;
    const g = inMonth ? goalOn(d, ctx.history, ctx.current) : null;
    const target = g ? dailyBudget(g.kcal, exByDate.get(d) ?? 0, ctx.energyMethod ?? 'included', ctx.exerciseCredit ?? 0) : null;
    const diff = totals && target ? Math.round(totals.kcal - target) : null;
    grid.push({ date: d, inMonth, totals, target, goal: g?.goal ?? null, diff, tone: totals && target && g ? dayTone(totals.kcal, target, g.goal) : null });
  }

  const logged = grid.filter((d) => d.inMonth && d.totals);
  const n = logged.length;
  const sum = (f: (d: MonthDay) => number) => logged.reduce((s, d) => s + f(d), 0);
  const withDiff = logged.filter((d) => d.diff != null);

  const weeks: MonthStats['weeks'] = [];
  for (let i = 0; i < grid.length; i += 7) {
    const w = grid.slice(i, i + 7).filter((d) => d.inMonth);
    if (!w.length) continue;
    const l = w.filter((d) => d.totals);
    weeks.push({
      label: `${parseISODate(w[0].date).getDate()}–${parseISODate(w[w.length - 1].date).getDate()}`,
      avgKcal: l.length ? l.reduce((s, d) => s + d.totals!.kcal, 0) / l.length : null,
      days: l.length,
    });
  }

  const [y, m] = month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return {
    month,
    label,
    grid,
    stats: {
      loggedDays: n,
      daysInMonth: parseISODate(last).getDate(),
      totalKcal: Math.round(sum((d) => d.totals!.kcal)),
      avgKcal: n ? sum((d) => d.totals!.kcal) / n : null,
      avgProtein: n ? sum((d) => d.totals!.protein) / n : null,
      avgCarbs: n ? sum((d) => d.totals!.carbs) / n : null,
      avgFat: n ? sum((d) => d.totals!.fat) / n : null,
      nearDays: logged.filter((d) => d.tone === 'near').length,
      avgDiff: withDiff.length ? withDiff.reduce((s, d) => s + d.diff!, 0) / withDiff.length : null,
      weeks,
    },
  };
}
