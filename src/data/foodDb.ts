/**
 * Base alimentaire embarquée (USDA FoodData Central, noms français NutriTrack).
 *
 * Le fichier (≈ 1,2 Mo, ≈ 220 ko compressé) est chargé à la demande, une seule fois, puis
 * mis en cache par le service worker : la recherche fonctionne ensuite hors ligne.
 * Voir tools/fooddb/build.py pour la construction et docs/base-alimentaire.md pour les sources.
 */
import type { Food, FoodKind, ServingSize } from '../domain/types';

type Row = [
  fdcId: number, name: string, category: string, kind: FoodKind, basis: 'g' | 'ml', dataset: 'sr' | 'fn',
  kcal: number | null, protein: number | null, carbs: number | null, fat: number | null, fiber: number | null, sugars: number | null,
  portions: [string, number][], original: string,
];

const LABEL: Record<Row[5], string> = {
  sr: 'USDA FoodData Central — SR Legacy (2018)',
  fn: 'USDA FoodData Central — FNDDS 2021-2023 (2024)',
};

const EPOCH = '2026-01-01T00:00:00.000Z';

export function foodFromRow(r: Row): Food {
  const [id, name, category, kind, basis, ds, kcal, protein, carbs, fat, fiber, sugars, portions, original] = r;
  const servings: ServingSize[] = portions.map(([label, amount], i) => ({ id: `s${i}`, label, amount, precision: 'approx' }));
  return {
    id: `us:${id}`,
    name,
    category,
    kind,
    basis,
    per100: { kcal, protein, carbs, fat },
    extra: { fiber, sugars },
    servings,
    aliases: original,
    source: { kind: 'reference', label: LABEL[ds], url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients`, status: 'verified' },
    favorite: false,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}

let cache: Promise<Food[]> | null = null;

/** Charge la base (une seule fois). En cas d'échec, l'appel suivant réessaie. */
export function loadFoodDb(): Promise<Food[]> {
  if (!cache) {
    cache = import('./fooddb/usda.json')
      .then((m) => (m.default as unknown as { foods: Row[] }).foods.map(foodFromRow))
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}
