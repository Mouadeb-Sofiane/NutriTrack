import { describe, expect, it } from 'vitest';
import { consumptionFactor, lineFromRecipe, makeVariant, parseIngredientLine, parseRecipeText, recipeNutrition } from './recipes';
import { lineFromFood, manualLine, sumItems } from './nutrition';
import { REFERENCE_FOODS, refFood } from './referenceFoods';
import { lineFromParsed } from './matching';
import { buildTemplateItems, DISH_TEMPLATES } from './templates';
import type { Recipe } from './types';

function recipe(p: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1', name: 'Salade', categories: [], ingredients: [], servings: 3, assumptions: [], favorite: false, version: 1,
    createdAt: 'x', updatedAt: 'x', ...p,
  };
}

describe('nutrition des recettes', () => {
  it('somme les ingrédients et divise par portion', () => {
    const r = recipe({
      ingredients: [
        manualLine('a', 'A', { kcal: 500, protein: 20, carbs: 50, fat: 20 }, { precision: 'exact', quantity: 100, unit: 'g' }),
        manualLine('b', 'B', { kcal: 220, protein: 10, carbs: 10, fat: 15 }, { precision: 'exact', quantity: 100, unit: 'g' }),
      ],
    });
    const n = recipeNutrition(r);
    expect(n.total.kcal).toBe(720);
    expect(n.perServing.kcal).toBe(240);
    expect(n.basis).toBe('ingredients');
    expect(n.precision).toBe('exact');
  });
  it('total saisi manuellement (plat familial sans pesée)', () => {
    const r = recipe({ servings: 6, manualTotal: { kcal: 2400, protein: null, carbs: null, fat: null }, manualPrecision: 'rough' });
    const n = recipeNutrition(r);
    expect(n.basis).toBe('manual');
    expect(n.perServing.kcal).toBe(400);
    expect(n.perServing.kcalRange.min).toBeCloseTo(240);
  });
  it('recette sans aucune donnée', () => {
    expect(recipeNutrition(recipe()).basis).toBe('none');
  });
  it('portions : 1,5 portion habituelle d’un plat de 6', () => {
    const r = recipe({ servings: 6, manualTotal: { kcal: 2400, protein: 120, carbs: 240, fat: 100 }, manualPrecision: 'approx' });
    const line = lineFromRecipe(r, { kind: 'servings', servings: 1.5, size: 'usual' }, 'l')!;
    expect(line.nutrients.kcal).toBe(600);
    expect(line.nutrients.protein).toBe(30);
    expect(line.recipeVersion).toBe(1);
    // fourchette élargie (portions non équivalentes)
    expect(line.kcalRange!.min).toBeLessThan(600 * 0.8);
  });
  it('fraction et grammes', () => {
    const r = recipe({ servings: 4, totalWeightG: 2000 });
    expect(consumptionFactor(r, { kind: 'fraction', fraction: 0.25 })).toBe(0.25);
    expect(consumptionFactor(r, { kind: 'grams', grams: 500 })).toBe(0.25);
    expect(consumptionFactor(recipe({ totalWeightG: null }), { kind: 'grams', grams: 500 })).toBeNull();
    expect(consumptionFactor(r, { kind: 'servings', servings: -1, size: 'usual' })).toBeNull();
    expect(consumptionFactor(r, { kind: 'servings', servings: 1, size: 'large' })).toBeCloseTo(1.3 / 4);
  });
  it('variante : nouvel objet, original intact', () => {
    const r = recipe({ ingredients: [manualLine('a', 'A', { kcal: 100 })] });
    const v = makeVariant(r, 'r2', 'moins d’huile', 'now');
    v.ingredients[0].nutrients.kcal = 50;
    expect(r.ingredients[0].nutrients.kcal).toBe(100);
    expect(v.parentId).toBe('r1');
    expect(v.version).toBe(1);
  });
});

describe('import texte', () => {
  it('analyse des lignes variées', () => {
    expect(parseIngredientLine('200 g de riz')).toMatchObject({ quantity: 200, unit: 'g', name: 'riz' });
    expect(parseIngredientLine("2 c. à soupe d'huile d'olive")).toMatchObject({ quantity: 2, unit: 'c. à soupe', name: "huile d'olive" });
    expect(parseIngredientLine('1 kg de poulet')).toMatchObject({ quantity: 1000, unit: 'g' });
    expect(parseIngredientLine('25 cl de lait')).toMatchObject({ quantity: 250, unit: 'ml' });
    expect(parseIngredientLine('3 oignons')).toMatchObject({ quantity: 3, unit: 'pièce', name: 'oignons' });
    expect(parseIngredientLine('- sel, poivre')).toMatchObject({ quantity: null, unit: null });
    expect(parseIngredientLine('1/2 citron')).toMatchObject({ quantity: 0.5 });
  });
  it('titre + ingrédients', () => {
    const r = parseRecipeText('Riz au poulet\nIngrédients :\n300 g riz cru\n2 oignons\n');
    expect(r.title).toBe('Riz au poulet');
    expect(r.lines).toHaveLength(2);
  });
  it('associe aux aliments de référence', () => {
    const res = lineFromParsed(REFERENCE_FOODS, parseIngredientLine('2 c. à soupe huile d’olive')!, 'x');
    expect(res.converted).toBe(true);
    expect(res.item.nutrients.kcal).toBeCloseTo(243);
    const onions = lineFromParsed(REFERENCE_FOODS, parseIngredientLine('2 oignons')!, 'y');
    expect(onions.item.baseAmount).toBe(200);
    const unknown = lineFromParsed(REFERENCE_FOODS, parseIngredientLine('3 g de zaatar mystère')!, 'z');
    expect(unknown.converted).toBe(false);
    expect(unknown.item.nutrients.kcal).toBeNull();
  });
});

describe('modèles de plats (estimation guidée)', () => {
  it('tous les modèles référencent des aliments existants', () => {
    for (const t of DISH_TEMPLATES) {
      const { items } = buildTemplateItems(t, 'medium', 'medium');
      expect(items.length, t.id).toBeGreaterThan(0);
      expect(items.every((i) => i.precision === 'rough')).toBe(true);
    }
  });
  it('la portion et la matière grasse changent le résultat', () => {
    const t = DISH_TEMPLATES.find((x) => x.id === 'rice-meat')!;
    const k = (s: 'small' | 'large', f: 'low' | 'high') => sumItems(buildTemplateItems(t, s, f).items).kcal;
    expect(k('large', 'high')).toBeGreaterThan(k('small', 'low'));
    const medium = sumItems(buildTemplateItems(t, 'medium', 'medium').items);
    const expected = sumItems([
      lineFromFood(refFood('rice-cooked'), { unit: 'g', count: 200 }, 'a')!,
      lineFromFood(refFood('chicken-breast-cooked'), { unit: 'g', count: 120 }, 'b')!,
      lineFromFood(refFood('mixed-veg'), { unit: 'g', count: 80 }, 'c')!,
      lineFromFood(refFood('sunflower-oil'), { unit: 'g', count: 10 }, 'd')!,
    ]).kcal;
    expect(medium.kcal).toBeCloseTo(expected);
    expect(medium.kcalRange.max).toBeGreaterThan(medium.kcal * 1.3);
  });
});
