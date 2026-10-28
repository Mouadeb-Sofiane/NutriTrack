import { describe, expect, it } from 'vitest';
import { checkPer100, lineFromFood, manualLine, rescaleLine, scalePer100, sumItems, toBaseAmount } from './nutrition';
import { REFERENCE_FOODS, refFood } from './referenceFoods';
import type { Food } from './types';

describe('mise à l’échelle', () => {
  it('pour 100 g → quantité', () => {
    expect(scalePer100({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, 200)).toEqual({ kcal: 260, protein: 5.4, carbs: 56, fat: 0.6 });
  });
  it('conserve les valeurs inconnues', () => {
    expect(scalePer100({ kcal: 100, protein: null, carbs: 10, fat: null }, 50)).toEqual({ kcal: 50, protein: null, carbs: 5, fat: null });
  });
  it('quantité négative → valeurs inconnues (pas de total absurde)', () => {
    expect(scalePer100({ kcal: 100, protein: 1, carbs: 1, fat: 1 }, -50).kcal).toBeNull();
  });
});

describe('somme des lignes', () => {
  it('additionne et compte les valeurs manquantes', () => {
    const t = sumItems([
      manualLine('a', 'A', { kcal: 100, protein: 5, carbs: 10, fat: 2 }, { precision: 'exact' }),
      manualLine('b', 'B', { kcal: 50 }, { precision: 'exact' }),
      manualLine('c', 'C', {}),
    ]);
    expect(t.kcal).toBe(150);
    expect(t.protein).toBe(5);
    expect(t.missing.kcal).toBe(1);
    expect(t.missing.protein).toBe(2);
    expect(t.kcalRange).toEqual({ min: 150, max: 150 });
  });
  it('ignore les valeurs négatives saisies', () => {
    const t = sumItems([manualLine('a', 'A', { kcal: -300, protein: 5 })]);
    expect(t.kcal).toBe(0);
    expect(t.missing.kcal).toBe(1);
  });
  it('fourchette selon la précision', () => {
    const t = sumItems([manualLine('a', 'A', { kcal: 100 }, { precision: 'rough' })]);
    expect(t.kcalRange.min).toBeCloseTo(60);
    expect(t.kcalRange.max).toBeCloseTo(140);
  });
});

describe('conversions', () => {
  const oil = refFood('olive-oil');
  it('n’applique jamais 1 ml = 1 g implicitement', () => {
    const noDensity: Food = { ...refFood('rice-cooked'), density: undefined };
    expect(toBaseAmount(noDensity, 100, 'ml')).toBeNull();
    expect(toBaseAmount(oil, 100, 'ml')).toBeCloseTo(91);
  });
  it('ligne depuis une mesure ménagère', () => {
    const tbsp = oil.servings.find((s) => s.label === '1 c. à soupe')!;
    const l = lineFromFood(oil, { unit: tbsp.id, count: 2 }, 'x')!;
    expect(l.baseAmount).toBe(27);
    expect(l.nutrients.kcal).toBeCloseTo(243);
    expect(l.precision).toBe('approx');
  });
  it('refuse une quantité nulle ou négative', () => {
    expect(lineFromFood(oil, { unit: 'g', count: 0 }, 'x')).toBeNull();
    expect(lineFromFood(oil, { unit: 'g', count: -5 }, 'x')).toBeNull();
  });
  it('rescale proportionnel', () => {
    const l = lineFromFood(refFood('rice-cooked'), { unit: 'g', count: 100 }, 'x')!;
    expect(rescaleLine(l, 250).nutrients.kcal).toBeCloseTo(325);
  });
});

describe('contrôle de cohérence', () => {
  it('détecte les incohérences', () => {
    expect(checkPer100({ kcal: 1200, protein: 0, carbs: 0, fat: 0 }, 'g').ok).toBe(false);
    expect(checkPer100({ kcal: 300, protein: 60, carbs: 50, fat: 10 }, 'g').ok).toBe(false);
    expect(checkPer100({ kcal: 100, protein: 10, carbs: 50, fat: 10 }, 'g').warnings.length).toBe(1);
    expect(checkPer100({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, 'g')).toEqual({ ok: true, errors: [], warnings: [] });
  });
  it('les aliments de référence sont cohérents', () => {
    // Garde-fou sur la table intégrée : macros ≤ 100 g et kcal proches de 4/4/9 (hors boissons alcoolisées).
    for (const f of REFERENCE_FOODS) {
      if (['ref:beer', 'ref:wine-red'].includes(f.id)) continue;
      const c = checkPer100(f.per100, f.basis);
      expect(c.ok, f.name).toBe(true);
      expect(c.warnings, f.name).toEqual([]);
    }
  });
});
