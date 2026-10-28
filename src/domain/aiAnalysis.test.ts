import { describe, expect, it } from 'vitest';
import { hiddenFatLine, linesFromAnalysis, mapAiItem, parseAnalysis, strictFoodMatch, suggestRecipes } from './aiAnalysis';
import { REFERENCE_FOODS } from './referenceFoods';
import { estimateEntry, getEntry } from './catalog';
import { scenarioTotals } from './estimates';
import { sumItems } from './nutrition';
import { refFood } from './referenceFoods';
import { COUSCOUS_ANALYSIS, KEBAB_ANALYSIS } from '../test/aiFixtures';
import type { Recipe } from './types';

let n = 0;
const id = () => `a${n++}`;

describe('validation de la réponse IA', () => {
  it('accepte une analyse conforme', () => {
    expect(parseAnalysis(KEBAB_ANALYSIS).ok).toBe(true);
  });
  it('refuse un format inattendu', () => {
    expect(parseAnalysis({ items: 'kebab' }).ok).toBe(false);
    expect(parseAnalysis(null).ok).toBe(false);
    expect(parseAnalysis({ ...KEBAB_ANALYSIS, items: [{ ...KEBAB_ANALYSIS.items[0], grams_mean: 'beaucoup' }] }).ok).toBe(false);
    expect(parseAnalysis({ ...KEBAB_ANALYSIS, items: [{ ...KEBAB_ANALYSIS.items[0], kcal_per_100g: 5000 }] }).ok).toBe(false);
  });
  it('valeurs d’énumération inconnues ramenées à des valeurs prudentes', () => {
    const r = parseAnalysis({ ...KEBAB_ANALYSIS, confidence: 'certain', items: [{ ...KEBAB_ANALYSIS.items[0], visibility: 'obvious' }] });
    expect(r.ok && r.analysis.confidence).toBe('low');
    expect(r.ok && r.analysis.items[0].visibility).toBe('assumed');
  });
});

describe('conversion en lignes : valeurs calculées par l’application', () => {
  it('plat connu du catalogue : composition du catalogue, portions de l’IA', () => {
    const m = mapAiItem(KEBAB_ANALYSIS.items[0], 'k');
    const kebab = getEntry('kebab')!;
    expect(m.nutritionSource).toBe('catalog');
    expect(m.line.estimate!.mean.kcal).toBeCloseTo(330 * kebab.per100.kcal! / 100);
    // haute : portion haute de l'IA × composition plus riche du catalogue
    expect(m.line.estimate!.high.kcal).toBeCloseTo(400 * kebab.rich!.per100.kcal! / 100);
    expect(m.line.estimate!.low!.kcal).toBeCloseTo(280 * kebab.per100.kcal! / 100);
    expect(m.line.nutrients.kcal).toBe(m.line.estimate!.mean.kcal); // moyenne retenue par défaut
    expect(m.line.source.kind).toBe('ai');
    expect(m.line.estimate!.highReasons.join(' ')).toMatch(/400 g/);
  });
  it('les valeurs proposées par l’IA ne remplacent pas celles des tables', () => {
    const m = mapAiItem(KEBAB_ANALYSIS.items[1], 'f');
    expect(m.nutritionSource).toBe('catalog');
    expect(m.line.estimate!.mean.kcal).toBeCloseTo(130 * estimateEntry(getEntry('fries')!, { customAmount: 100 })!.mean.kcal! / 100);
  });
  it('sauce : quantité difficile à juger, estimation haute mise en avant', () => {
    const m = mapAiItem(KEBAB_ANALYSIS.items[2], 's');
    expect(m.nutritionSource).toBe('catalog');
    expect(m.line.estimate!.highlightHigh).toMatch(/sauce/);
  });
  it('aliment de la table de référence', () => {
    const m = mapAiItem(COUSCOUS_ANALYSIS.items[1], 'p');
    expect(m.nutritionSource).toBe('reference');
    expect(m.line.estimate!.mean.kcal).toBeCloseTo(40 * refFood('chickpeas-cooked').per100.kcal! / 100);
  });
  it('aliment inconnu des tables : valeurs de l’IA marquées « non vérifiées »', () => {
    const m = mapAiItem(COUSCOUS_ANALYSIS.items[2], 'm');
    expect(m.nutritionSource).toBe('ai');
    expect(m.line.source.label).toMatch(/non vérifiées/);
    expect(m.line.estimate!.mean.kcal).toBeCloseTo(210);
  });
  it('aucune valeur fiable : calories inconnues, pas inventées', () => {
    const m = mapAiItem(COUSCOUS_ANALYSIS.items[3], 'x');
    expect(m.nutritionSource).toBe('none');
    expect(m.line.nutrients.kcal).toBeNull();
    expect(sumItems([m.line]).missing.kcal).toBe(1);
  });
  it('portion nulle ou fourchette désordonnée', () => {
    expect(mapAiItem({ ...KEBAB_ANALYSIS.items[1], grams_mean: 0 }, 'z').line.quantity).toBeNull();
    const m = mapAiItem({ ...KEBAB_ANALYSIS.items[1], grams_low: 200, grams_high: 50 }, 'y');
    expect(m.line.estimate!.low!.kcal!).toBeLessThanOrEqual(m.line.estimate!.mean.kcal!);
    expect(m.line.estimate!.high.kcal!).toBeGreaterThanOrEqual(m.line.estimate!.mean.kcal!);
  });
});

describe('correspondance stricte avec les tables', () => {
  const m = (n: string) => strictFoodMatch(REFERENCE_FOODS, n)?.name ?? null;
  it('retrouve l’aliment, version cuite de préférence', () => {
    expect(m('Semoule de couscous')).toBe('Semoule de couscous cuite');
    expect(m('Riz blanc')).toBe('Riz blanc cuit');
    expect(m('Poulet grillé')).toMatch(/poulet cuit/i);
    expect(m('Pois chiches')).toBe('Pois chiches cuits');
    expect(m('Riz cru')).toBe('Riz blanc cru');
  });
  it('n’associe pas un aliment approchant à tort', () => {
    expect(m('Plat mystère')).toBeNull();
    expect(m('Viande hachée de dinde')).toBeNull();
    expect(m('Salade de quinoa et feta')).toBeNull();
  });
});

describe('analyse complète', () => {
  it('repas fast-food : moyenne et haute cohérentes', () => {
    const r = linesFromAnalysis(KEBAB_ANALYSIS, id);
    const lines = r.mapped.map((m) => m.line);
    const s = scenarioTotals(lines);
    expect(lines).toHaveLength(4);
    expect(s.high).toBeGreaterThan(s.mean);
    expect(s.retained).toBeCloseTo(s.mean);
    expect(r.hiddenFat).toBeNull(); // aucune matière grasse de cuisson signalée
    expect(r.assumptions.join(' ')).toMatch(/sauce à l’intérieur/);
  });
  it('plat maison : huile invisible ajoutée comme hypothèse explicite', () => {
    const r = linesFromAnalysis(COUSCOUS_ANALYSIS, id);
    expect(r.hiddenFat).not.toBeNull();
    expect(r.hiddenFat!.estimate!.mean.kcal).toBeCloseTo(45);
    expect(r.hiddenFat!.estimate!.high.kcal).toBeCloseTo(135);
    expect(r.warnings.join(' ')).toMatch(/très incertaine/);
    expect(r.warnings.join(' ')).toMatch(/sans valeurs nutritionnelles/);
  });
  it('pas d’huile ajoutée pour un simple snack', () => {
    const snack = { ...COUSCOUS_ANALYSIS, items: [{ ...COUSCOUS_ANALYSIS.items[0], name: 'Chips', category: 'snack' as const }] };
    expect(hiddenFatLine(snack, 'h')).toBeNull();
  });
  it('photo sans nourriture', () => {
    const r = linesFromAnalysis({ ...KEBAB_ANALYSIS, is_food: false, items: [] }, id);
    expect(r.mapped).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/pas d’aliment/);
  });
  it('suggère les recettes personnelles correspondantes', () => {
    const r = (name: string): Recipe => ({ id: name, name, categories: [], ingredients: [], servings: 6, assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '' });
    const recipes = [r('Couscous familial'), r('Soupe de lentilles'), r('Tajine de poulet')];
    expect(suggestRecipes(COUSCOUS_ANALYSIS, recipes).map((x) => x.name)).toEqual(['Couscous familial']);
    expect(suggestRecipes(KEBAB_ANALYSIS, recipes)).toEqual([]);
  });
});
