/** Accès aux données : toutes les écritures passent par ici (validation + horodatage). */
import type { NutriDB } from './db';
import type { ExerciseEntry, Food, Goals, LineItem, MealEntry, PersonalPortion, Preferences, Profile, Recipe, WeightEntry } from '../domain/types';
import { nowISO, isISODate } from '../domain/dates';
import { cleanNutrients, isValidNumber } from '../domain/nutrition';
import { newId } from './ids';

export class ValidationError extends Error {}

export const DEFAULT_PREFS: Preferences = { onboarded: false, customCuisines: [] };

export function createRepo(db: NutriDB) {
  async function getKV<T>(key: string): Promise<T | undefined> {
    return (await db.kv.get(key))?.value as T | undefined;
  }
  async function setKV(key: string, value: unknown) {
    await db.kv.put({ key, value });
  }

  function sanitizeItems(items: LineItem[]): LineItem[] {
    return items.map((it) => {
      if (it.quantity != null && (!isValidNumber(it.quantity) || it.quantity <= 0)) {
        throw new ValidationError(`Quantité invalide pour « ${it.name} » : elle doit être positive.`);
      }
      const n = cleanNutrients(it.nutrients);
      return { ...it, name: it.name.trim() || 'Aliment', nutrients: n };
    });
  }

  return {
    getKV,
    setKV,

    async getProfile() { return getKV<Profile>('profile'); },
    async saveProfile(p: Profile) { await setKV('profile', { ...p, updatedAt: nowISO() }); },
    async getGoals() { return getKV<Goals>('goals'); },
    async saveGoals(g: Goals) {
      if (!isValidNumber(g.kcal) || g.kcal <= 0) throw new ValidationError("L'objectif calorique doit être un nombre positif.");
      await setKV('goals', { ...g, updatedAt: nowISO() });
    },
    async getPrefs() { return { ...DEFAULT_PREFS, ...(await getKV<Preferences>('prefs')) }; },
    async savePrefs(p: Partial<Preferences>) {
      const cur = { ...DEFAULT_PREFS, ...(await getKV<Preferences>('prefs')) };
      await setKV('prefs', { ...cur, ...p });
    },

    /* Repas */
    async saveMeal(m: Omit<MealEntry, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<MealEntry, 'id' | 'createdAt'>>): Promise<MealEntry> {
      if (!isISODate(m.date)) throw new ValidationError('Date de repas invalide.');
      if (!m.items.length) throw new ValidationError('Ajoute au moins un aliment au repas.');
      const now = nowISO();
      const entry: MealEntry = {
        ...m,
        id: m.id ?? newId('meal'),
        items: sanitizeItems(m.items),
        createdAt: m.createdAt ?? now,
        updatedAt: now,
      };
      const recipeIds = [...new Set(entry.items.map((i) => i.recipeId).filter(Boolean))] as string[];
      await db.meals.put({ ...entry, recipeIds } as MealEntry);
      return entry;
    },
    async deleteMeal(id: string) { await db.meals.delete(id); },
    async mealsOn(date: string) { return db.meals.where('date').equals(date).sortBy('createdAt'); },
    async mealsBetween(from: string, to: string) { return db.meals.where('date').between(from, to, true, true).toArray(); },
    async allMeals() { return db.meals.toArray(); },
    async mealsUsingRecipe(recipeId: string) { return db.meals.where('recipeIds').equals(recipeId).toArray(); },
    async recentMeals(limit = 20) { return db.meals.orderBy('createdAt').reverse().limit(limit).toArray(); },

    /* Aliments personnels */
    async saveFood(f: Omit<Food, 'createdAt' | 'updatedAt'> & Partial<Pick<Food, 'createdAt'>>): Promise<Food> {
      if (!f.name.trim()) throw new ValidationError("Donne un nom à l'aliment.");
      const now = nowISO();
      const food: Food = { ...f, name: f.name.trim(), per100: cleanNutrients(f.per100), createdAt: f.createdAt ?? now, updatedAt: now };
      await db.foods.put(food);
      return food;
    },
    async deleteFood(id: string) { await db.foods.delete(id); },
    async allFoods() { return db.foods.toArray(); },
    async foodByBarcode(code: string) { return db.foods.where('barcode').equals(code).first(); },

    /* Recettes */
    async saveRecipe(r: Recipe, opts: { bumpVersion?: boolean } = {}): Promise<Recipe> {
      if (!r.name.trim()) throw new ValidationError('Donne un nom à la recette.');
      if (!isValidNumber(r.servings) || r.servings <= 0) throw new ValidationError('Le nombre de portions doit être positif.');
      if (r.totalWeightG != null && (!isValidNumber(r.totalWeightG) || r.totalWeightG <= 0)) throw new ValidationError('Le poids total doit être positif.');
      const existing = await db.recipes.get(r.id);
      const recipe: Recipe = {
        ...r,
        name: r.name.trim(),
        ingredients: sanitizeItems(r.ingredients),
        manualTotal: r.manualTotal ? cleanNutrients(r.manualTotal) : null,
        version: existing ? (opts.bumpVersion === false ? existing.version : existing.version + 1) : 1,
        createdAt: existing?.createdAt ?? r.createdAt ?? nowISO(),
        updatedAt: nowISO(),
      };
      await db.recipes.put(recipe);
      return recipe;
    },
    async getRecipe(id: string) { return db.recipes.get(id); },
    async allRecipes() { return db.recipes.toArray(); },
    async deleteRecipe(id: string) {
      await db.transaction('rw', db.recipes, db.portions, async () => {
        await db.recipes.delete(id);
        await db.portions.where('recipeId').equals(id).delete();
      });
    },

    /* Poids */
    async addWeight(date: string, kg: number, note?: string): Promise<WeightEntry> {
      if (!isISODate(date)) throw new ValidationError('Date invalide.');
      if (!isValidNumber(kg) || kg < 20 || kg > 400) throw new ValidationError('Poids invalide (entre 20 et 400 kg).');
      const w: WeightEntry = { id: newId('w'), date, kg: Math.round(kg * 100) / 100, note: note?.trim() || undefined, createdAt: nowISO() };
      await db.weights.put(w);
      return w;
    },
    async deleteWeight(id: string) { await db.weights.delete(id); },
    async allWeights() { return db.weights.orderBy('date').toArray(); },

    /* Exercices (mode « séparé ») */
    async addExercise(e: Omit<ExerciseEntry, 'id' | 'createdAt'>): Promise<ExerciseEntry> {
      if (!isISODate(e.date)) throw new ValidationError('Date invalide.');
      if (!isValidNumber(e.kcal) || e.kcal < 0 || e.kcal > 5000) throw new ValidationError('Dépense invalide.');
      const x: ExerciseEntry = { ...e, id: newId('ex'), label: e.label.trim() || 'Activité', createdAt: nowISO() };
      await db.exercises.put(x);
      return x;
    },
    async deleteExercise(id: string) { await db.exercises.delete(id); },
    async exercisesOn(date: string) { return db.exercises.where('date').equals(date).toArray(); },

    /* Photos (restent sur l'appareil) */
    async savePhoto(blob: Blob): Promise<string> {
      const id = newId('ph');
      await db.photos.put({ id, blob, mime: blob.type || 'image/jpeg', createdAt: nowISO() });
      return id;
    },
    async getPhoto(id: string) { return db.photos.get(id); },
    async deletePhoto(id: string) { await db.photos.delete(id); },

    /* Portions personnelles */
    async savePortion(p: Omit<PersonalPortion, 'id' | 'createdAt'> & Partial<Pick<PersonalPortion, 'id'>>) {
      if (!p.name.trim()) throw new ValidationError('Donne un nom à la portion.');
      const x: PersonalPortion = { ...p, id: p.id ?? newId('pp'), name: p.name.trim(), createdAt: nowISO() };
      await db.portions.put(x);
      return x;
    },
    async deletePortion(id: string) { await db.portions.delete(id); },
    async allPortions() { return db.portions.toArray(); },
  };
}

export type Repo = ReturnType<typeof createRepo>;
