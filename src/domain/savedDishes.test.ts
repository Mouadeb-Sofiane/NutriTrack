import { describe, expect, it } from 'vitest';
import { filterRecipes, groupByFamily, recipeFamily, recipeUsage } from './savedDishes';
import { manualLine } from './nutrition';
import type { Recipe } from './types';

const r = (id: string, name: string, ingredients: string[] = []): Recipe => ({
  id, name, categories: [], ingredients: ingredients.map((n, i) => manualLine(`${id}${i}`, n, { kcal: 10 })), servings: 1, assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '',
});
const all = [
  r('q1', 'Quiche au thon', ['thon', 'œufs']), r('q2', 'Quiche aux poireaux', ['poireaux']), r('q3', 'Quiche lorraine', ['lardons']),
  r('p1', 'Pâtes à la bolognaise'), r('p2', 'Pâtes aux champignons'), r('p3', 'Pâtes au saumon', ['saumon']), r('p4', 'Pâtes à la crème'),
  r('h', 'Hachis parmentier'), r('g', 'Gratin de pommes de terre'), r('c', 'Couscous maison'), r('l', 'Lasagnes maison', ['pâtes à lasagnes']),
];
const names = (q: string) => filterRecipes(all, q).map((x) => x.id).sort();

describe('recherche dans mes plats', () => {
  it('« quiche » : uniquement les trois quiches', () => expect(names('quiche')).toEqual(['q1', 'q2', 'q3']));
  it('« pâtes » : uniquement les pâtes (pas les lasagnes qui en contiennent)', () => expect(names('pâtes')).toEqual(['p1', 'p2', 'p3', 'p4']));
  it('partie du nom, faute de frappe, accent oublié', () => {
    expect(names('quic')).toEqual(['q1', 'q2', 'q3']);
    expect(names('quiche tohn')).toEqual(['q1']);
    expect(names('pates champignon')).toEqual(['p2']);
    expect(names('hachi')).toEqual(['h']);
  });
  it('ingrédient si aucun nom ne correspond', () => expect(names('saumon')).toEqual(['p3']));
  it('requête vide : tout', () => expect(filterRecipes(all, '').length).toBe(all.length));
});

describe('familles et usage', () => {
  it('familles', () => {
    expect(recipeFamily('Ma quiche au thon')).toBe('Quiche');
    const g = groupByFamily(all);
    expect(g.find((x) => x.family === 'Quiche')!.recipes.length).toBe(3);
    expect(g.find((x) => x.family === 'Pâtes')!.recipes.length).toBe(4);
    expect(g.at(-1)!.family).toBe('Autres plats');
  });
  it('compte une utilisation par repas', () => {
    const line = { ...manualLine('x', 'Quiche', { kcal: 1 }), recipeId: 'q1' };
    const u = recipeUsage([{ items: [line, { ...line, id: 'y' }] }, { items: [line] }]);
    expect(u.get('q1')).toBe(2);
  });
});
