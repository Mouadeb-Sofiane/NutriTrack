import { describe, expect, it } from 'vitest';
import { dayTotals, frequentFoods, movingAverage, periodSummary, weeklyAverages, weightProgress } from './stats';
import { manualLine } from './nutrition';
import type { MealEntry, WeightEntry } from './types';
import { addDays, isISODate } from './dates';
import { buildInsights, optionTotals, SWAPS } from './advice';

function meal(date: string, kcal: number, name = 'X', foodId?: string): MealEntry {
  return {
    id: `${date}-${kcal}-${name}`, date, mealType: 'lunch', items: [{ ...manualLine('i', name, { kcal, protein: 10, carbs: 10, fat: 5 }, { precision: 'exact' }), foodId }],
    place: 'home', method: 'manual', assumptions: [], userCorrected: false, createdAt: 'x', updatedAt: 'x',
  };
}

describe('totaux et périodes', () => {
  const meals = [meal('2026-10-01', 500), meal('2026-10-01', 700), meal('2026-10-03', 1800)];
  it('total journalier distinct par jour', () => {
    expect(dayTotals(meals, '2026-10-01').kcal).toBe(1200);
    expect(dayTotals(meals, '2026-10-02').kcal).toBe(0);
  });
  it('moyenne sur les jours notés uniquement', () => {
    const s = periodSummary(meals, '2026-10-01', '2026-10-07');
    expect(s.loggedDays).toBe(2);
    expect(s.totalDays).toBe(7);
    expect(s.avg!.kcal).toBe(1500);
    expect(s.days[1].totals).toBeNull();
  });
  it('période vide → pas de moyenne inventée', () => {
    expect(periodSummary([], '2026-10-01', '2026-10-07').avg).toBeNull();
  });
  it('moyennes hebdomadaires', () => {
    const w = weeklyAverages(meals, '2026-09-01', '2026-10-31');
    expect(w).toHaveLength(1);
    expect(w[0].week).toBe('2026-09-28');
  });
  it('aliments fréquents', () => {
    const f = frequentFoods([meal('2026-10-01', 100, 'Pomme'), meal('2026-10-02', 100, 'Pomme'), meal('2026-10-02', 300, 'Pain')]);
    expect(f[0]).toMatchObject({ name: 'Pomme', count: 2 });
  });
});

describe('poids', () => {
  const w = (date: string, kg: number): WeightEntry => ({ id: date, date, kg, createdAt: date });
  it('moyenne mobile 7 jours', () => {
    const ma = movingAverage([w('2026-10-01', 90), w('2026-10-02', 89), w('2026-10-10', 88)]);
    expect(ma[1].avg).toBe(89.5);
    expect(ma[2].avg).toBe(88);
  });
  it('progression vers la cible', () => {
    const p = weightProgress([w('2026-10-01', 90), w('2026-10-20', 85)], 80);
    expect(p.change).toBe(-5);
    expect(p.progress).toBe(0.5);
  });
  it('tendance seulement avec assez de données', () => {
    expect(weightProgress([w('2026-10-01', 90), w('2026-10-02', 89)], 80).weeklyTrend).toBeNull();
    const many = Array.from({ length: 5 }, (_, i) => w(addDays('2026-10-01', i * 5), 90 - i * 0.5));
    expect(weightProgress(many, 80).weeklyTrend).toBeCloseTo(-0.7);
  });
});

describe('dates', () => {
  it('valide les dates', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('conseiller', () => {
  it('chaque alternative maison est chiffrée', () => {
    for (const s of SWAPS) {
      expect(optionTotals(s.original).kcal, s.id).toBeGreaterThan(0);
      expect(optionTotals(s.homemade).itemCount, s.id).toBeGreaterThan(0);
    }
  });
  it('les alternatives réduisent l’énergie ou augmentent les protéines', () => {
    for (const s of SWAPS) {
      const a = optionTotals(s.original);
      const b = optionTotals(s.homemade);
      expect(b.kcal < a.kcal || b.protein > a.protein, s.id).toBe(true);
    }
  });
  it('observations calculées à partir des données réelles', () => {
    expect(buildInsights([], null, '2026-10-01', '2026-10-07')).toEqual([]);
    const meals = [meal('2026-10-01', 300, 'Mayonnaise', 'ref:mayonnaise'), meal('2026-10-01', 400)];
    const ins = buildInsights(meals, { kcal: 2000, protein: 120, carbs: 200, fat: 60, trackMacros: true, manual: false, updatedAt: 'x' }, '2026-10-01', '2026-10-07');
    expect(ins.find((i) => i.id === 'protein-low')).toBeTruthy();
    expect(ins.find((i) => i.swapId === 'mayo-yogurt')).toBeTruthy();
  });
});
