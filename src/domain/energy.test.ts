import { describe, expect, it } from 'vitest';
import { computeEnergyPlan, dailyBudget, goalsFromPlan, mifflinStJeor, suggestActivityLevel, suggestMacros } from './energy';
import type { Profile } from './types';

const base: Pick<Profile, 'age' | 'heightCm' | 'weightKg' | 'targetWeightKg' | 'sex' | 'activityLevel' | 'goal' | 'pace' | 'caution'> = {
  age: 30, heightCm: 180, weightKg: 90, targetWeightKg: 80, sex: 'male', activityLevel: 'moderate', goal: 'lose', pace: 'moderate',
  caution: { pregnant: false, breastfeeding: false, edHistory: false },
};

describe('Mifflin-St Jeor', () => {
  it('homme', () => {
    // 10*90 + 6.25*180 - 5*30 + 5 = 900 + 1125 - 150 + 5
    expect(mifflinStJeor(90, 180, 30, 'male').value).toBe(1880);
  });
  it('femme', () => {
    // 10*60 + 6.25*165 - 5*40 - 161 = 600 + 1031.25 - 200 - 161
    expect(mifflinStJeor(60, 165, 40, 'female').value).toBeCloseTo(1270.25);
  });
  it('sexe non renseigné : moyenne + fourchette, marquée imprécise', () => {
    const r = mifflinStJeor(90, 180, 30, null);
    expect(r.precise).toBe(false);
    expect(r.range).toEqual({ min: 1875 - 161, max: 1880 });
    expect(r.value).toBe((1714 + 1880) / 2);
  });
});

describe('plan énergétique', () => {
  it('calcule TDEE et objectif de perte modéré (−15 %)', () => {
    const p = computeEnergyPlan(base);
    expect(p.tdee).toBeCloseTo(1880 * 1.55);
    expect(p.suggestedKcal).toBe(Math.round((1880 * 1.55 * 0.85) / 10) * 10);
    expect(p.weeklyChangeKg).toBeLessThan(0);
  });
  it('maintien = TDEE', () => {
    const p = computeEnergyPlan({ ...base, goal: 'maintain' });
    expect(p.suggestedKcal).toBe(Math.round((1880 * 1.55) / 10) * 10);
    expect(p.adjustmentPct).toBe(0);
  });
  it('prise de masse modérée (+10 %)', () => {
    const p = computeEnergyPlan({ ...base, goal: 'gain' });
    expect(p.adjustmentPct).toBe(0.1);
  });
  it('données manquantes → pas d’objectif inventé', () => {
    const p = computeEnergyPlan({ ...base, age: null });
    expect(p.suggestedKcal).toBeNull();
    expect(p.missing).toContain('âge');
  });
  it.each([
    ['mineur', { age: 16 }],
    ['grossesse', { caution: { pregnant: true, breastfeeding: false, edHistory: false } }],
    ['allaitement', { caution: { pregnant: false, breastfeeding: true, edHistory: false } }],
    ['antécédents TCA', { caution: { pregnant: false, breastfeeding: false, edHistory: true } }],
  ])('situation de prudence (%s) → aucun déficit automatique', (_l, patch) => {
    const p = computeEnergyPlan({ ...base, ...patch });
    expect(p.cautionMode).toBe(true);
    expect(p.adjustmentPct).toBe(0);
    expect(p.effectiveGoal).toBe('maintain');
    expect(p.warnings.some((w) => w.level === 'caution')).toBe(true);
  });
  it('avertit si le poids cible correspond à un IMC < 18,5', () => {
    const p = computeEnergyPlan({ ...base, targetWeightKg: 55 });
    expect(p.warnings.some((w) => w.text.includes('18,5'))).toBe(true);
  });
});

describe('macros', () => {
  it('protéines plafonnées au poids de référence IMC 25', () => {
    const m = suggestMacros(2000, 'lose', 120, 170);
    const ref = 25 * 1.7 * 1.7;
    expect(m.protein).toBe(Math.round(ref * 1.6));
    expect(m.fat).toBe(Math.round(600 / 9));
    expect(m.carbs).toBe(Math.round((2000 - m.protein! * 4 - m.fat! * 9) / 4));
  });
  it('glucides jamais négatifs', () => {
    expect(suggestMacros(800, 'lose', 100, 200).carbs).toBeGreaterThanOrEqual(0);
  });
  it('goalsFromPlan reprend la suggestion', () => {
    const plan = computeEnergyPlan(base);
    const g = goalsFromPlan(plan, base, true, 'now')!;
    expect(g.kcal).toBe(plan.suggestedKcal);
    expect(g.manual).toBe(false);
  });
});

describe('activité et budget', () => {
  it('suggère un niveau à partir du métier et du sport', () => {
    expect(suggestActivityLevel('seated', 0, 'included')).toBe('sedentary');
    expect(suggestActivityLevel('seated', 4, 'included')).toBe('moderate');
    expect(suggestActivityLevel('seated', 4, 'separate')).toBe('sedentary');
  });
  it('ne compte pas l’exercice deux fois', () => {
    expect(dailyBudget(2000, 400, 'included', 1)).toBe(2000);
    expect(dailyBudget(2000, 400, 'separate', 0)).toBe(2000);
    expect(dailyBudget(2000, 400, 'separate', 0.5)).toBe(2200);
    expect(dailyBudget(2000, -100, 'separate', 1)).toBe(2000);
  });
});
