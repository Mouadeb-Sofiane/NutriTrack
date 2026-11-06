/**
 * Index de recherche unifié : aliments de référence, base USDA (chargée à la demande),
 * aliments personnels, catalogue grignotages/fast-food, recettes personnelles et
 * éléments récents. Le classement favorise ce que l'utilisateur utilise déjà.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Food, LineItem, Recipe } from '../domain/types';
import { REFERENCE_FOODS } from '../domain/referenceFoods';
import { CATALOG, type CatalogEntry } from '../domain/catalog';
import { buildIndex, search, searchCombo, type SearchDoc, type SearchKind } from '../domain/search';
import { loadFoodDb } from './foodDb';
import { loadDishes, type Dish } from '../domain/dishes';

export type SearchRef =
  | { type: 'food'; food: Food }
  | { type: 'catalog'; entry: CatalogEntry }
  | { type: 'recipe'; recipe: Recipe }
  | { type: 'recent'; item: LineItem; date: string }
  | { type: 'dish'; dish: Dish };

function foodKind(f: Food): SearchKind {
  if (f.kind === 'dish') return 'dish';
  if (f.kind === 'drink' || f.category === 'Boissons' || f.basis === 'ml') return 'drink';
  if (f.brand || f.barcode || f.kind === 'product' || f.source.kind === 'openfoodfacts') return 'product';
  return 'food';
}

export function foodDocs(foods: Food[], boost = 0): SearchDoc<SearchRef>[] {
  return foods.map((f) => ({
    id: f.id,
    kind: foodKind(f),
    name: f.name,
    synonyms: [f.brand, f.aliases].filter(Boolean).join(', '),
    category: f.category,
    boost: boost + (f.favorite ? 1.5 : 0),
    ref: { type: 'food', food: f },
  }));
}

export function catalogDocs(): SearchDoc<SearchRef>[] {
  return CATALOG.map((e) => ({
    id: `cat:${e.id}`,
    kind: e.role === 'drink' ? 'drink' : 'dish',
    name: e.name,
    synonyms: e.aliases,
    boost: 0.4,
    ref: { type: 'catalog', entry: e },
  }));
}

export function recipeDocs(recipes: Recipe[]): SearchDoc<SearchRef>[] {
  return recipes.map((r) => ({
    id: `rec:${r.id}`,
    kind: 'recipe',
    name: r.name,
    synonyms: [r.variantLabel, r.description, r.ingredients.map((i) => i.name).join(', ')].filter(Boolean).join(', '),
    category: [r.cuisine, ...r.categories].filter(Boolean).join(' '),
    boost: 1.2 + (r.favorite ? 1 : 0),
    ref: { type: 'recipe', recipe: r },
  }));
}

export function recentDocs(items: { item: LineItem; date: string }[]): SearchDoc<SearchRef>[] {
  return items.map(({ item, date }, i) => ({
    id: `recent:${item.id}:${date}`,
    kind: 'recent',
    name: item.name,
    boost: 1 - i * 0.01,
    ref: { type: 'recent', item, date },
  }));
}

export function dishDocs(dishes: Dish[]): SearchDoc<SearchRef>[] {
  return dishes.map((d) => ({
    id: d.id,
    kind: 'dish',
    name: d.name,
    synonyms: d.synonyms,
    category: d.group,
    // Plats composés : priorité sur les variantes génériques de la base (« hachis » → hachis parmentier).
    boost: 1,
    ref: { type: 'dish', dish: d },
  }));
}

interface DbState { foods: Food[]; dishes: Dish[]; loading: boolean; error: boolean }
let loaded: DbState | null = null;

/** Base USDA et plats composés : chargés une fois, partagés entre les écrans. */
export function useFoodDb(): DbState {
  const [state, setState] = useState<DbState>(loaded ?? { foods: [], dishes: [], loading: true, error: false });
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    Promise.all([loadFoodDb(), loadDishes()]).then(
      ([foods, dishes]) => { loaded = { foods, dishes, loading: false, error: false }; if (alive) setState(loaded); },
      () => alive && setState({ foods: [], dishes: [], loading: false, error: true }),
    );
    return () => { alive = false; };
  }, []);
  return state;
}

const EMPTY_RECENT: { item: LineItem; date: string }[] = [];

/**
 * Index combiné. La partie lourde (référence + catalogue + USDA) n'est construite qu'une fois
 * la base chargée ; la partie personnelle (aliments, recettes, récents) est petite et
 * reconstruite à chaque changement. Les deux sont interrogées puis fusionnées par score.
 */
export function useSearch(mine: Food[], recipes: Recipe[], recent: { item: LineItem; date: string }[] = EMPTY_RECENT) {
  const db = useFoodDb();
  const mineKey = mine.map((f) => f.id).join(',');
  const baseIndex = useMemo(() => {
    const mineIds = new Set(mineKey.split(','));
    return buildIndex<SearchRef>([
      ...foodDocs(REFERENCE_FOODS.filter((f) => !mineIds.has(f.id)), 0.5),
      ...catalogDocs(),
      ...dishDocs(db.dishes),
      ...foodDocs(db.foods.filter((f) => !mineIds.has(f.id))),
    ]);
  }, [db.foods, db.dishes, mineKey]);
  const userIndex = useMemo(() => buildIndex<SearchRef>([...foodDocs(mine, 0.8), ...recipeDocs(recipes), ...recentDocs(recent)]), [mine, recipes, recent]);
  const run = useMemo(() => (query: string, opts: { limit?: number; kinds?: SearchKind[] } = {}) => {
    const limit = opts.limit ?? 40;
    const hits = [...search(userIndex, query, { ...opts, limit }), ...search(baseIndex, query, { ...opts, limit })];
    hits.sort((a, b) => b.score - a.score || a.doc.name.length - b.doc.name.length);
    // Un aliment récent identique à un aliment proposé n'apparaît qu'une fois.
    const seen = new Set<string>();
    return hits.filter((h) => {
      const key = `${h.doc.kind === 'recent' ? 'r' : 'x'}:${h.doc.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
  }, [baseIndex, userIndex]);
  const combo = useMemo(() => (query: string) => searchCombo(baseIndex, query, { kinds: ['food', 'drink', 'product'] }), [baseIndex]);
  return { search: run, combo, dbLoading: db.loading, dbError: db.error, dbSize: db.foods.length, dishes: db.dishes };
}
