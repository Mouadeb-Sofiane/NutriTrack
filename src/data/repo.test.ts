import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NutriDB } from './db';
import { createRepo, ValidationError } from './repo';
import { exportAll, importBackup, parseBackup } from './backup';
import { manualLine } from '../domain/nutrition';
import { lineFromRecipe } from '../domain/recipes';
import type { Recipe } from '../domain/types';
import { mapOffProduct } from './openFoodFacts';

let db: NutriDB;
let repo: ReturnType<typeof createRepo>;
let n = 0;

beforeEach(async () => {
  db = new NutriDB(`test-${n++}`);
  repo = createRepo(db);
});

const baseMeal = (date = '2026-10-28') => ({
  date, mealType: 'lunch' as const, items: [manualLine('a', 'Riz', { kcal: 260, protein: 5, carbs: 56, fat: 1 })],
  place: 'home' as const, method: 'manual' as const, assumptions: [], userCorrected: false,
});

describe('repas', () => {
  it('enregistre, récupère, modifie et supprime', async () => {
    const m = await repo.saveMeal(baseMeal());
    expect((await repo.mealsOn('2026-10-28')).map((x) => x.id)).toEqual([m.id]);
    await repo.saveMeal({ ...m, notes: 'modifié' });
    const after = await repo.mealsOn('2026-10-28');
    expect(after).toHaveLength(1);
    expect(after[0].notes).toBe('modifié');
    expect(after[0].createdAt).toBe(m.createdAt);
    await repo.deleteMeal(m.id);
    expect(await repo.mealsOn('2026-10-28')).toHaveLength(0);
  });
  it('les jours restent distincts', async () => {
    await repo.saveMeal(baseMeal('2026-10-27'));
    await repo.saveMeal(baseMeal('2026-10-28'));
    expect(await repo.mealsOn('2026-10-27')).toHaveLength(1);
    expect(await repo.mealsBetween('2026-10-27', '2026-10-28')).toHaveLength(2);
  });
  it('refuse les entrées invalides', async () => {
    await expect(repo.saveMeal({ ...baseMeal(), items: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.saveMeal({ ...baseMeal(), date: '2026-13-01' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.saveMeal({ ...baseMeal(), items: [{ ...manualLine('a', 'X', { kcal: 1 }), quantity: -2 }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.addWeight('2026-10-28', -5)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('recettes et historique', () => {
  it('modifier une recette ne change pas les repas passés', async () => {
    const r: Recipe = await repo.saveRecipe({
      id: 'r1', name: 'Soupe', categories: [], servings: 4, assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '',
      ingredients: [manualLine('i', 'Lentilles', { kcal: 800, protein: 60, carbs: 120, fat: 4 }, { precision: 'exact' })],
    });
    const line = lineFromRecipe(r, { kind: 'servings', servings: 1, size: 'usual' }, 'l')!;
    const meal = await repo.saveMeal({ ...baseMeal(), items: [line], method: 'recipe' });
    const r2 = await repo.saveRecipe({ ...r, ingredients: [manualLine('i', 'Lentilles', { kcal: 1200 }, { precision: 'exact' })] });
    expect(r2.version).toBe(2);
    const stored = (await repo.mealsOn('2026-10-28'))[0];
    expect(stored.items[0].nutrients.kcal).toBe(200);
    expect(stored.items[0].recipeVersion).toBe(1);
    expect((await repo.mealsUsingRecipe('r1')).map((m) => m.id)).toEqual([meal.id]);
  });
});

describe('sauvegarde', () => {
  it('export → import (fusion sans doublons, remplacement)', async () => {
    await repo.saveProfile({ age: 30 } as never);
    await repo.saveGoals({ kcal: 2000, protein: 100, carbs: 200, fat: 60, trackMacros: true, manual: false, updatedAt: '' });
    await repo.saveMeal(baseMeal());
    await repo.addWeight('2026-10-28', 85.4);
    await repo.savePhoto(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const backup = await exportAll(db, { includePhotos: true });
    const text = JSON.stringify(backup);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.counts).toMatchObject({ repas: 1, pesées: 1, photos: 1 });

    const merged = await importBackup(db, parsed.backup!, 'merge');
    expect(merged.added.repas).toBe(0);
    expect(merged.skipped.repas).toBe(1);
    expect(await db.meals.count()).toBe(1);

    const other = new NutriDB(`test-restore-${n++}`);
    await importBackup(other, parsed.backup!, 'replace');
    expect(await other.meals.count()).toBe(1);
    expect((await other.kv.get('goals'))?.value).toMatchObject({ kcal: 2000 });
    const photo = (await other.photos.toArray())[0];
    expect(new Uint8Array(await photo.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await other.meals.where('recipeIds').equals('x').count())).toBe(0);
  });
  it('rejette un fichier invalide', () => {
    expect(parseBackup('pas du json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'autre' })).ok).toBe(false);
    const bad = { app: 'nutritrack', schemaVersion: 1, exportedAt: '', data: { profile: null, goals: null, prefs: null, foods: [], recipes: [], weights: [{ id: 'w', date: '2026-10-01', kg: -3, createdAt: '' }], meals: [] } };
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...bad, schemaVersion: 99, data: { ...bad.data, weights: [] } })).ok).toBe(false);
  });
});

describe('Open Food Facts (format de réponse)', () => {
  it('convertit une fiche', () => {
    const f = mapOffProduct({ code: '123456789', product_name_fr: 'Yaourt', brands: 'Marque, Autre', nutriments: { 'energy-kcal_100g': 60, proteins_100g: 4, carbohydrates_100g: 5, fat_100g: '2,5' }, serving_quantity: 125, serving_size: '125 g' }, 'now')!;
    expect(f).toMatchObject({ id: 'off:123456789', brand: 'Marque', basis: 'g', per100: { kcal: 60, protein: 4, carbs: 5, fat: 2.5 } });
    expect(f.servings[0].amount).toBe(125);
  });
  it('kJ seulement → conversion, valeurs absentes → null', () => {
    const f = mapOffProduct({ code: '1', product_name: 'Jus', quantity: '1 L', nutriments: { 'energy-kj_100g': 184 } }, 'now')!;
    expect(f.per100.kcal).toBeCloseTo(44, 0);
    expect(f.per100.protein).toBeNull();
    expect(f.basis).toBe('ml');
  });
  it('fiche sans nutriments → ignorée', () => {
    expect(mapOffProduct({ code: '1', product_name: 'X', nutriments: {} }, 'now')).toBeNull();
  });
});
