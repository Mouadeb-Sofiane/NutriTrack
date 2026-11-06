import { describe, expect, it } from 'vitest';
import { buildMonthView, dayTone, goalOn, monthBounds, shiftMonth, type GoalHistoryEntry } from './month';
import { manualLine } from './nutrition';
import type { MealEntry } from './types';

function meal(date: string, kcal: number, protein = 100): MealEntry {
  return {
    id: `${date}-${kcal}`, date, mealType: 'lunch', items: [manualLine('i', 'X', { kcal, protein, carbs: 200, fat: 60 }, { precision: 'exact' })],
    place: 'home', method: 'manual', assumptions: [], userCorrected: false, createdAt: 'x', updatedAt: 'x',
  };
}

describe('couleurs selon l’objectif', () => {
  it('maintien : symétrique', () => {
    expect(dayTone(2000, 2000, 'maintain')).toBe('near');
    expect(dayTone(2300, 2000, 'maintain')).toBe('moderate');
    expect(dayTone(1700, 2000, 'maintain')).toBe('moderate');
    expect(dayTone(2700, 2000, 'maintain')).toBe('large');
  });
  it('prise de masse : un dépassement modéré est proche de l’objectif, pas un échec', () => {
    expect(dayTone(3500, 3200, 'gain')).toBe('near');
    expect(dayTone(3500, 3200, 'maintain')).toBe('near'); // +9 %
    expect(dayTone(3800, 3200, 'gain')).toBe('moderate'); // +19 %
    expect(dayTone(3800, 3200, 'maintain')).toBe('moderate');
    expect(dayTone(2600, 3200, 'gain')).toBe('marked'); // −19 % : sous le surplus visé
  });
  it('perte : manger un peu moins est proche, beaucoup moins reste un écart signalé', () => {
    expect(dayTone(1750, 2000, 'lose')).toBe('near'); // −12,5 %
    expect(dayTone(2200, 2000, 'lose')).toBe('moderate'); // +10 %
    expect(dayTone(1100, 2000, 'lose')).toBe('large'); // −45 %
  });
  it('sans objectif : pas de couleur', () => {
    expect(dayTone(2000, 0, 'maintain')).toBeNull();
  });
});

describe('objectif historique', () => {
  const h: GoalHistoryEntry[] = [
    { from: '2026-09-01', kcal: 2000, goal: 'maintain', manual: false },
    { from: '2026-10-15', kcal: 3200, goal: 'gain', manual: true },
  ];
  it('chaque jour garde l’objectif de son époque', () => {
    expect(goalOn('2026-10-10', h, null)?.kcal).toBe(2000);
    expect(goalOn('2026-10-15', h, null)?.kcal).toBe(3200);
    expect(goalOn('2026-08-01', h, null)?.kcal).toBe(2000);
    expect(goalOn('2026-10-01', [], { kcal: 1800, goal: 'lose' })?.kcal).toBe(1800);
  });
});

describe('vue mensuelle', () => {
  it('bornes et navigation de mois', () => {
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('grille du lundi au dimanche, statistiques exactes sur les jours notés', () => {
    const meals = [meal('2026-10-01', 1000), meal('2026-10-01', 1000), meal('2026-10-02', 2600), meal('2026-10-20', 1400), meal('2026-11-01', 9999)];
    const v = buildMonthView('2026-10', meals, { history: [], current: { kcal: 2000, goal: 'maintain' } });
    expect(v.grid.length % 7).toBe(0);
    expect(v.grid[0].date).toBe('2026-09-28'); // lundi
    expect(v.grid.at(-1)!.date).toBe('2026-11-01'); // dimanche
    expect(v.grid.at(-1)!.totals).toBeNull(); // hors mois : non compté
    const d1 = v.grid.find((d) => d.date === '2026-10-01')!;
    expect(d1.totals!.kcal).toBe(2000);
    expect(d1.diff).toBe(0);
    expect(d1.tone).toBe('near');
    expect(v.stats.loggedDays).toBe(3);
    expect(v.stats.daysInMonth).toBe(31);
    expect(v.stats.totalKcal).toBe(6000);
    expect(v.stats.avgKcal).toBe(2000);
    expect(v.stats.avgProtein).toBeCloseTo(400 / 3);
    expect(v.stats.nearDays).toBe(1);
    expect(v.stats.avgDiff).toBe(0);
    expect(v.grid.find((d) => d.date === '2026-10-05')!.totals).toBeNull(); // jour vide : pas de 0 inventé
  });
  it('crédit d’exercice en mode séparé', () => {
    const v = buildMonthView('2026-10', [meal('2026-10-01', 2400)], {
      history: [], current: { kcal: 2000, goal: 'maintain' },
      exercises: [{ id: 'e', date: '2026-10-01', label: 'Course', kcal: 400, createdAt: 'x' }], energyMethod: 'separate', exerciseCredit: 1,
    });
    expect(v.grid.find((d) => d.date === '2026-10-01')!.target).toBe(2400);
  });
});
