/**
 * « Mes plats enregistrés » : recherche dans les recettes personnelles, familles de plats,
 * fréquence d'utilisation.
 *
 * La recherche porte d'abord sur le NOM (« quiche » n'affiche que les quiches) ; les
 * ingrédients ne servent que si aucun nom ne correspond (« thon » → quiche au thon…).
 */
import type { MealEntry, Recipe } from './types';
import { buildIndex, search, tokens } from './search';

export function filterRecipes(recipes: Recipe[], query: string): Recipe[] {
  if (!query.trim()) return recipes;
  const byName = buildIndex(recipes.map((r) => ({ id: r.id, kind: 'recipe' as const, name: r.name, synonyms: r.variantLabel, boost: r.favorite ? 0.3 : 0, ref: r })));
  const hits = search(byName, query, { limit: 200 });
  if (hits.length) return hits.map((h) => h.doc.ref);
  const byContent = buildIndex(recipes.map((r) => ({
    id: r.id, kind: 'recipe' as const, name: r.name,
    synonyms: [r.description, r.cuisine, ...r.categories, ...r.ingredients.map((i) => i.name)].filter(Boolean).join(', '),
    ref: r,
  })));
  return search(byContent, query, { limit: 200 }).map((h) => h.doc.ref);
}

/** Famille d'un plat : premier mot significatif du nom (« Quiche au thon » → « Quiche »). */
export function recipeFamily(name: string): string {
  const skip = new Set(['mon', 'ma', 'mes', 'le', 'la', 'les', 'un', 'une']);
  const word = name.trim().split(/\s+/).find((w) => !skip.has(w.toLowerCase())) ?? name;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase().replace(/[,.:;]$/, '');
}

/** Regroupe par famille ; les familles d'un seul plat sont réunies sous « Autres plats ». */
export function groupByFamily(recipes: Recipe[]): { family: string; recipes: Recipe[] }[] {
  const map = new Map<string, { label: string; recipes: Recipe[] }>();
  for (const r of recipes) {
    const fam = recipeFamily(r.name);
    const key = tokens(fam).join(' ') || fam;
    const cur = map.get(key) ?? { label: fam, recipes: [] };
    cur.recipes.push(r);
    map.set(key, cur);
  }
  const groups = [...map.values()].filter((g) => g.recipes.length >= 2).map((g) => ({ family: g.label, recipes: g.recipes }));
  const rest = [...map.values()].filter((g) => g.recipes.length < 2).flatMap((g) => g.recipes);
  groups.sort((a, b) => a.family.localeCompare(b.family, 'fr'));
  if (rest.length) groups.push({ family: groups.length ? 'Autres plats' : 'Mes plats', recipes: rest });
  return groups;
}

/** Nombre d'utilisations de chaque recette dans le journal. */
export function recipeUsage(meals: Pick<MealEntry, 'items'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const meal of meals) for (const id of new Set(meal.items.map((i) => i.recipeId).filter(Boolean) as string[])) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Utilisations à partir desquelles on suggère (une fois) d'ajouter la recette aux favoris. */
export const FAVORITE_AFTER_USES = 3;
