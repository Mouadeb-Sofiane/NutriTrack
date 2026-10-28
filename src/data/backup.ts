/**
 * Export / import de toutes les données en JSON.
 * Les données importées sont validées (zod) avant d'être écrites.
 * Mode « fusion » : ajoute ce qui manque, sans doublons (même identifiant = ignoré).
 * Mode « remplacement » : efface tout puis restaure (confirmation demandée dans l'interface).
 */
import { z } from 'zod';
import type { NutriDB } from './db';
import { SCHEMA_VERSION } from '../domain/types';
import { nowISO } from '../domain/dates';

const num = z.number().refine(Number.isFinite, 'nombre invalide');
const nnum = num.nullable();
const nutrients = z.object({ kcal: nnum, protein: nnum, carbs: nnum, fat: nnum });
const precision = z.enum(['exact', 'approx', 'rough']);
const source = z.looseObject({ kind: z.enum(['reference', 'openfoodfacts', 'manual', 'recipe', 'estimate', 'official', 'ai']), label: z.string().optional(), url: z.string().optional() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const estimate = z.looseObject({
  mean: nutrients,
  high: nutrients,
  low: nutrients.nullable().optional(),
  chosen: z.enum(['mean', 'high', 'custom']),
  custom: nutrients.nullable().optional(),
  highReasons: z.array(z.string()),
  assumptions: z.array(z.string()),
});

const lineItem = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  quantity: num.positive().nullable(),
  unit: z.enum(['g', 'ml', 'serving', 'portion', 'none']),
  nutrients,
  kcalRange: z.object({ min: num, max: num }).nullable().optional(),
  precision,
  source,
  estimate: estimate.optional(),
});

const food = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  basis: z.enum(['g', 'ml']),
  per100: nutrients,
  servings: z.array(z.looseObject({ id: z.string(), label: z.string(), amount: num.positive(), precision })),
  source,
  favorite: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const meal = z.looseObject({
  id: z.string().min(1),
  date,
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
  items: z.array(lineItem),
  place: z.enum(['home', 'restaurant']),
  method: z.string(),
  assumptions: z.array(z.string()),
  userCorrected: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const recipe = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  categories: z.array(z.string()),
  ingredients: z.array(lineItem),
  servings: num.positive(),
  totalWeightG: num.positive().nullable().optional(),
  manualTotal: nutrients.nullable().optional(),
  assumptions: z.array(z.string()),
  favorite: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const weight = z.looseObject({ id: z.string().min(1), date, kg: num.min(20).max(400), createdAt: z.string() });
const exercise = z.looseObject({ id: z.string().min(1), date, label: z.string(), kcal: num.min(0), createdAt: z.string() });
const portion = z.looseObject({ id: z.string().min(1), name: z.string().min(1), createdAt: z.string() });
const photo = z.object({ id: z.string().min(1), mime: z.string(), dataUrl: z.string().startsWith('data:'), createdAt: z.string() });

export const backupSchema = z.object({
  app: z.literal('nutritrack'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  data: z.object({
    profile: z.looseObject({}).nullable(),
    goals: z.looseObject({ kcal: num.positive() }).nullable(),
    prefs: z.looseObject({}).nullable(),
    foods: z.array(food),
    meals: z.array(meal),
    recipes: z.array(recipe),
    weights: z.array(weight),
    exercises: z.array(exercise).default([]),
    portions: z.array(portion).default([]),
    photos: z.array(photo).default([]),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',', 2);
  const mime = head.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportAll(db: NutriDB, opts: { includePhotos: boolean }): Promise<Backup> {
  const kv = async (k: string) => ((await db.kv.get(k))?.value as Record<string, unknown> | undefined) ?? null;
  const photos = opts.includePhotos
    ? await Promise.all((await db.photos.toArray()).map(async (p) => ({ id: p.id, mime: p.mime, createdAt: p.createdAt, dataUrl: await blobToDataUrl(p.blob) })))
    : [];
  const meals = (await db.meals.toArray()).map((m) => {
    const { recipeIds: _ignored, ...rest } = m as typeof m & { recipeIds?: string[] };
    return rest;
  });
  return {
    app: 'nutritrack',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    data: {
      profile: await kv('profile'),
      goals: (await kv('goals')) as Backup['data']['goals'],
      prefs: await kv('prefs'),
      foods: (await db.foods.toArray()) as Backup['data']['foods'],
      meals: meals as Backup['data']['meals'],
      recipes: (await db.recipes.toArray()) as Backup['data']['recipes'],
      weights: (await db.weights.toArray()) as Backup['data']['weights'],
      exercises: (await db.exercises.toArray()) as Backup['data']['exercises'],
      portions: (await db.portions.toArray()) as Backup['data']['portions'],
      photos,
    },
  };
}

export interface ParseResult {
  ok: boolean;
  backup?: Backup;
  error?: string;
  counts?: Record<string, number>;
}

export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce fichier n'est pas un JSON valide." };
  }
  const res = backupSchema.safeParse(json);
  if (!res.success) {
    const issue = res.error.issues[0];
    return { ok: false, error: `Fichier non reconnu ou abîmé (${issue.path.join('.') || 'racine'} : ${issue.message}).` };
  }
  if (res.data.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Ce fichier vient d’une version plus récente de l’application. Mets-la à jour avant de restaurer.' };
  }
  const d = res.data.data;
  return {
    ok: true,
    backup: res.data,
    counts: { repas: d.meals.length, recettes: d.recipes.length, aliments: d.foods.length, pesées: d.weights.length, photos: d.photos.length },
  };
}

export interface ImportReport {
  added: Record<string, number>;
  skipped: Record<string, number>;
}

export async function importBackup(db: NutriDB, backup: Backup, mode: 'merge' | 'replace'): Promise<ImportReport> {
  const d = backup.data;
  const added: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const tables = [db.foods, db.meals, db.recipes, db.weights, db.exercises, db.portions, db.photos, db.kv];
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') for (const t of tables) await t.clear();

    async function put<T extends { id: string }>(name: string, table: { bulkGet(keys: string[]): Promise<(unknown | undefined)[]>; bulkPut(items: T[]): Promise<unknown> }, rows: T[]) {
      const existing = mode === 'merge' ? await table.bulkGet(rows.map((r) => r.id)) : rows.map(() => undefined);
      const fresh = rows.filter((_, i) => existing[i] === undefined);
      // On évite aussi les doublons à l'intérieur du fichier.
      const unique = [...new Map(fresh.map((r) => [r.id, r])).values()];
      await table.bulkPut(unique);
      added[name] = unique.length;
      skipped[name] = rows.length - unique.length;
    }

    await put('aliments', db.foods as never, d.foods);
    await put(
      'repas',
      db.meals as never,
      d.meals.map((m) => ({ ...m, recipeIds: [...new Set(m.items.map((i) => (i as { recipeId?: string }).recipeId).filter(Boolean))] })),
    );
    await put('recettes', db.recipes as never, d.recipes);
    await put('pesées', db.weights as never, d.weights);
    await put('activités', db.exercises as never, d.exercises);
    await put('portions', db.portions as never, d.portions);
    await put('photos', db.photos as never, d.photos.map((p) => ({ id: p.id, mime: p.mime, createdAt: p.createdAt, blob: dataUrlToBlob(p.dataUrl) })));

    for (const key of ['profile', 'goals', 'prefs'] as const) {
      const value = d[key];
      if (value == null) continue;
      const cur = await db.kv.get(key);
      if (mode === 'replace' || !cur) await db.kv.put({ key, value });
    }
  });
  return { added, skipped };
}

export async function wipeAll(db: NutriDB) {
  await db.transaction('rw', [db.foods, db.meals, db.recipes, db.weights, db.exercises, db.portions, db.photos, db.kv], async () => {
    for (const t of [db.foods, db.meals, db.recipes, db.weights, db.exercises, db.portions, db.photos, db.kv]) await t.clear();
  });
}
