import { describe, expect, it } from 'vitest';
import { cosine, matchRecipes, repeatCount } from './photoMatch';
import type { PhotoSignature, Recipe } from './types';

const v = (...x: number[]) => x;
const recipe = (id: string, name: string, sigs: number[][]): Recipe => ({ id, name, categories: [], ingredients: [], servings: 1, assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '', photoSignatures: sigs });
const quicheThon = v(1, 0.1, 0);
const quicheLook = v(0.97, 0.2, 0.05); // photo proche
const autre = v(0, 1, 0);

describe('plats déjà enregistrés', () => {
  it('similarité cosinus', () => {
    expect(cosine(quicheThon, quicheThon)).toBeCloseTo(1);
    expect(cosine(quicheThon, autre)).toBeLessThan(0.2);
  });
  it('propose la recette quand l’image est proche ET le nom compatible', () => {
    const recipes = [recipe('a', 'Ma quiche au thon', [quicheThon]), recipe('b', 'Pâtes aux champignons', [autre])];
    const m = matchRecipes(quicheLook, recipes, ['Quiche', 'Quiche lorraine']);
    expect(m.map((x) => x.recipe.id)).toEqual(['a']);
  });
  it('plusieurs quiches enregistrées : toutes proposées, l’utilisateur choisit', () => {
    const recipes = [recipe('a', 'Quiche au thon', [quicheThon]), recipe('b', 'Quiche aux poireaux', [v(0.95, 0.25, 0.1)]), recipe('c', 'Quiche lorraine', [v(0.96, 0.15, 0.2)])];
    expect(matchRecipes(quicheLook, recipes, ['Quiche']).length).toBe(3);
  });
  it('image proche mais nom sans rapport : pas de réutilisation automatique', () => {
    const recipes = [recipe('a', 'Gratin dauphinois', [v(0.75, 0.62, 0.15)])];
    expect(matchRecipes(quicheLook, recipes, ['Quiche'])).toEqual([]);
  });
  it('photo différente : rien n’est proposé', () => {
    expect(matchRecipes(autre, [recipe('a', 'Quiche au thon', [quicheThon])], ['Quiche'])).toEqual([]);
  });
});

describe('plat photographié plusieurs fois', () => {
  const sig = (name: string, s: number[], recipeId?: string): PhotoSignature => ({ id: Math.random().toString(), date: '2026-11-01', name, normName: name.toLowerCase(), signature: s, recipeId, createdAt: '' });
  it('compte les photos proches portant le même nom', () => {
    const h = [sig('quiche au thon', quicheThon), sig('quiche au thon', v(0.98, 0.1, 0.1)), sig('quiche au thon', autre), sig('pates', quicheThon)];
    expect(repeatCount('Quiche au thon', quicheLook, h)).toBe(2);
  });
  it('les plats déjà enregistrés ne déclenchent plus de suggestion', () => {
    expect(repeatCount('Quiche au thon', quicheLook, [sig('quiche au thon', quicheThon, 'rec1')])).toBe(0);
  });
});
