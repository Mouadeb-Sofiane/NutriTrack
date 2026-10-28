/**
 * Stockage local (IndexedDB via Dexie). Rien n'est envoyé à un serveur.
 * Versionnement : chaque évolution du schéma ajoute un `this.version(n)` avec
 * éventuellement une fonction `.upgrade()` de migration.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { ExerciseEntry, Food, MealEntry, PersonalPortion, PhotoRecord, Recipe, WeightEntry } from '../domain/types';

export interface KV {
  key: string;
  value: unknown;
}

export class NutriDB extends Dexie {
  foods!: EntityTable<Food, 'id'>;
  meals!: EntityTable<MealEntry, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  weights!: EntityTable<WeightEntry, 'id'>;
  exercises!: EntityTable<ExerciseEntry, 'id'>;
  photos!: EntityTable<PhotoRecord, 'id'>;
  portions!: EntityTable<PersonalPortion, 'id'>;
  kv!: EntityTable<KV, 'key'>;

  constructor(name = 'nutritrack') {
    super(name);
    this.version(1).stores({
      foods: 'id, name, barcode, favorite, updatedAt',
      meals: 'id, date, mealType, createdAt, *recipeIds',
      recipes: 'id, name, cuisine, favorite, parentId, updatedAt',
      weights: 'id, date',
      exercises: 'id, date',
      photos: 'id',
      portions: 'id, recipeId, foodId',
      kv: 'key',
    });
  }
}

export const db = new NutriDB();
