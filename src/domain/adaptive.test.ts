import { describe, expect, it } from 'vitest';
import { describeGoalGap, observedExpenditure } from './adaptive';
import { computeEnergyPlan } from './energy';
import { manualLine } from './nutrition';
import { addDays } from './dates';
import type { MealEntry, Profile, WeightEntry } from './types';

const meal = (date: string, kcal: number): MealEntry => ({ id: date, date, mealType: 'lunch', items: [manualLine('i', 'X', { kcal, protein: 0, carbs: 0, fat: 0 })], place: 'home', method: 'manual', assumptions: [], userCorrected: false, createdAt: '', updatedAt: '' });
const end = '2026-10-28';
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(end, -i));
const weights = (start: number, perWeek: number, n = 8): WeightEntry[] => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, date: addDays(end, -27 + i * 4), kg: start + (perWeek / 7) * i * 4, createdAt: '' }));

describe('réévaluation à partir de l’évolution réelle', () => {
  it('poids stable : la dépense observée égale l’apport moyen', () => {
    const r = observedExpenditure(days(28).map((d) => meal(d, 2600)), weights(80, 0), end);
    expect(r.ok).toBe(true);
    expect(r.observed).toBe(2600);
  });
  it('prise de poids de 0,25 kg/semaine avec 3 200 kcal : dépense ≈ 2 925 kcal', () => {
    const r = observedExpenditure(days(28).map((d) => meal(d, 3200)), weights(75, 0.25), end);
    expect(r.weeklyTrendKg).toBeCloseTo(0.25, 2);
    expect(r.observed!).toBeGreaterThan(2900);
    expect(r.observed!).toBeLessThan(2950);
  });
  it('données insuffisantes : pas de chiffre inventé', () => {
    const r = observedExpenditure(days(5).map((d) => meal(d, 2000)), weights(80, 0), end);
    expect(r.ok).toBe(false);
    expect(r.observed).toBeNull();
    expect(r.reason).toMatch(/au moins 10 jours/);
  });
});

describe('profils et objectifs', () => {
  const base: Omit<Profile, 'goal' | 'activityLevel' | 'pace'> = { age: 28, heightCm: 180, weightKg: 75, targetWeightKg: null, sex: 'male', jobType: null, trainingPerWeek: 4, energyMethod: 'included', exerciseCredit: 0, caution: { pregnant: false, breastfeeding: false, edHistory: false }, createdAt: '', updatedAt: '' };
  const plan = (goal: Profile['goal'], activityLevel: Profile['activityLevel'], pace: Profile['pace'] = 'moderate') => computeEnergyPlan({ ...base, goal, activityLevel, pace });
  it('prise de masse : surplus modéré au-dessus du maintien', () => {
    const m = plan('maintain', 'active').suggestedKcal!;
    const g = plan('gain', 'active').suggestedKcal!;
    expect(g).toBeGreaterThan(m);
    expect((g - m) / m).toBeLessThanOrEqual(0.15);
  });
  it('perte de graisse : déficit raisonnable, jamais sous le métabolisme de base pour un rythme modéré', () => {
    const p = plan('lose', 'light');
    expect(p.suggestedKcal!).toBeLessThan(p.tdee!);
    expect(p.suggestedKcal!).toBeGreaterThanOrEqual(p.bmr!.value);
  });
  it('activité forte > activité faible', () => {
    expect(plan('maintain', 'very_active').suggestedKcal!).toBeGreaterThan(plan('maintain', 'sedentary').suggestedKcal! + 800);
  });
  it('objectif personnalisé 3 200 kcal : écart expliqué, pas remplacé', () => {
    const p = plan('gain', 'moderate');
    const gap = describeGoalGap(3200, p.tdee!);
    expect(gap.diff).toBeGreaterThan(0);
    expect(gap.text).toMatch(/surplus/);
    expect(gap.text).toMatch(/kg\/semaine/);
  });
  it('calculs reproductibles', () => {
    expect(plan('gain', 'active')).toEqual(plan('gain', 'active'));
  });
});
