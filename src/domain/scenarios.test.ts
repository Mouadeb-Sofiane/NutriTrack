/** Scénarios du cahier des charges (tests 5, 6 et 8). */
import { describe, expect, it } from 'vitest';
import { lineFromFood, sumItems } from './nutrition';
import { lineFromRecipe, recipeNutrition } from './recipes';
import { refFood } from './referenceFoods';
import { filterRecipes } from './savedDishes';
import type { Recipe } from './types';
import raw from '../data/fooddb/dishes.json';
import { compositionTotals, dishFromRaw } from './dishes';

const g = (id: string, grams: number, n: string) => lineFromFood(refFood(id), { unit: refFood(id).basis, count: grams }, n)!;

describe('test 5 — pâtes aux champignons maison', () => {
  const ingredients = [g('pasta-dry', 200, 'a'), g('mushroom', 150, 'b'), g('cream-15', 100, 'c'), g('butter', 10, 'd')];
  const recipe: Recipe = { id: 'pc', name: 'Pâtes aux champignons', categories: [], ingredients, servings: 2, assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '' };
  it('total = somme des ingrédients, portion = total / 2', () => {
    const total = sumItems(ingredients).kcal;
    // 200 g pâtes sèches (360) + 150 g champignons (22) + 100 g crème 15 % (165) + 10 g beurre (745)
    expect(total).toBeCloseTo(720 + 33 + 165 + 74.5, 1);
    expect(recipeNutrition(recipe).perServing.kcal).toBeCloseTo(total / 2, 1);
  });
  it('retrouvée dans Mes plats par « pâtes » et réutilisable avec une autre portion', () => {
    expect(filterRecipes([recipe], 'pates')[0].id).toBe('pc');
    const one = lineFromRecipe(recipe, { kind: 'servings', servings: 1, size: 'usual' }, 'l1')!;
    const more = lineFromRecipe(recipe, { kind: 'servings', servings: 1.5, size: 'usual' }, 'l2')!;
    expect(more.nutrients.kcal!).toBeCloseTo(one.nutrients.kcal! * 1.5, 1);
    expect(recipe.servings).toBe(2); // la recette d'origine n'est pas modifiée
  });
});

describe('test 6 — hachis parmentier : viande 200 g → 150 g', () => {
  it('recalcul immédiat des calories et des protéines', () => {
    const d = dishFromRaw((raw as unknown as { dishes: Parameters<typeof dishFromRaw>[0][] }).dishes.find((x) => x.id === 'hachis-parmentier')!);
    const meat = d.ingredients.find((i) => /Viande/.test(i.label))!;
    meat.grams = 200;
    const a = compositionTotals(d.ingredients).nutrients;
    meat.grams = 150;
    const b = compositionTotals(d.ingredients).nutrients;
    expect(a.kcal! - b.kcal!).toBeCloseTo(meat.per100[0]! * 0.5, 5);
    expect(a.protein! - b.protein!).toBeCloseTo(meat.per100[1]! * 0.5, 5);
  });
});
