/**
 * Réévaluation des besoins à partir de l'évolution RÉELLE (à la demande, jamais automatique).
 *
 * Dépense observée ≈ apport moyen − variation de poids × 7700 kcal/kg.
 * Hypothèses fortes, affichées à l'utilisateur : les jours notés sont complets, la tendance
 * de poids sur plusieurs semaines reflète surtout la masse grasse (l'eau, le glycogène et le
 * contenu digestif brouillent les pesées isolées, d'où une régression sur toute la période).
 */
import type { MealEntry, WeightEntry } from './types';
import { totalsByDate } from './stats';
import { addDays, daysBetween } from './dates';
import { KCAL_PER_KG } from './energy';

export interface ObservedExpenditure {
  ok: boolean;
  /** Raison si le calcul n'est pas possible. */
  reason?: string;
  days: number;
  loggedDays: number;
  weighIns: number;
  avgIntake: number | null;
  /** Tendance de poids (kg par semaine, régression linéaire). */
  weeklyTrendKg: number | null;
  /** Dépense quotidienne observée (kcal). */
  observed: number | null;
  confidence: 'faible' | 'moyenne' | null;
}

export const MIN_DAYS = 14;
export const MIN_LOGGED = 10;
export const MIN_WEIGHINS = 4;

export function observedExpenditure(meals: MealEntry[], weights: WeightEntry[], to: string, windowDays = 28): ObservedExpenditure {
  const from = addDays(to, -(windowDays - 1));
  const byDate = totalsByDate(meals.filter((m) => m.date >= from && m.date <= to));
  const logged = [...byDate.values()].filter((t) => t.kcal > 0);
  const w = weights.filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const span = w.length >= 2 ? daysBetween(w[0].date, w[w.length - 1].date) : 0;
  const base = { days: windowDays, loggedDays: logged.length, weighIns: w.length, avgIntake: null, weeklyTrendKg: null, observed: null, confidence: null };
  if (logged.length < MIN_LOGGED) return { ...base, ok: false, reason: `Il faut au moins ${MIN_LOGGED} jours notés sur les ${windowDays} derniers jours (actuellement ${logged.length}).` };
  if (w.length < MIN_WEIGHINS || span < MIN_DAYS) return { ...base, ok: false, reason: `Il faut au moins ${MIN_WEIGHINS} pesées réparties sur ${MIN_DAYS} jours (actuellement ${w.length} pesée(s) sur ${span} jour(s)).` };
  const avgIntake = logged.reduce((s, t) => s + t.kcal, 0) / logged.length;
  // Régression linéaire du poids en fonction du jour.
  const xs = w.map((x) => daysBetween(w[0].date, x.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = w.reduce((a, b) => a + b.kg, 0) / w.length;
  let num = 0; let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (w[i].kg - my); den += (x - mx) ** 2; });
  const slopePerDay = den ? num / den : 0;
  const observed = Math.round(avgIntake - slopePerDay * KCAL_PER_KG);
  return {
    ...base,
    ok: true,
    avgIntake: Math.round(avgIntake),
    weeklyTrendKg: Math.round(slopePerDay * 7 * 100) / 100,
    observed,
    confidence: logged.length >= 20 && w.length >= 8 ? 'moyenne' : 'faible',
  };
}

/** Écart d'un objectif à la dépense estimée, en clair. */
export function describeGoalGap(goalKcal: number, maintenance: number): { diff: number; pct: number; weeklyKg: number; text: string } {
  const diff = Math.round(goalKcal - maintenance);
  const pct = maintenance > 0 ? Math.round((diff / maintenance) * 100) : 0;
  const weeklyKg = Math.round(((diff * 7) / KCAL_PER_KG) * 100) / 100;
  const text = Math.abs(diff) < 50
    ? 'proche de ta dépense estimée (maintien)'
    : diff > 0
      ? `surplus d’environ ${diff.toLocaleString('fr-FR')} kcal/jour (+${pct} %), soit environ +${weeklyKg.toLocaleString('fr-FR')} kg/semaine en théorie`
      : `déficit d’environ ${Math.abs(diff).toLocaleString('fr-FR')} kcal/jour (${pct} %), soit environ ${weeklyKg.toLocaleString('fr-FR')} kg/semaine en théorie`;
  return { diff, pct, weeklyKg, text };
}
