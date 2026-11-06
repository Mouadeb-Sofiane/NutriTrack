/**
 * Plats déjà photographiés ou déjà enregistrés : rapprochement d'une nouvelle photo.
 *
 * La ressemblance visuelle seule ne suffit pas (deux quiches se ressemblent) : une
 * correspondance avec une recette exige une image très proche ET un nom compatible avec
 * ce que le modèle reconnaît, sauf ressemblance quasi parfaite. Quand plusieurs plats
 * enregistrés correspondent, l'utilisateur choisit ; rien n'est réutilisé automatiquement.
 */
import type { PhotoSignature, Recipe } from './types';
import { normalize } from './referenceFoods';
import { tokens } from './search';

export const SIMILAR = 0.86;
export const VERY_SIMILAR = 0.93;
/** Nombre de photos proches du même plat avant de proposer de l'enregistrer. */
export const REPEAT_BEFORE_SUGGEST = 2;

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function sharesWord(a: string, names: string[]): boolean {
  const ta = new Set(tokens(a).filter((t) => t.length > 2));
  return names.some((n) => tokens(n).some((t) => ta.has(t)));
}

export interface RecipeMatch { recipe: Recipe; similarity: number }

/** Recettes enregistrées qui ressemblent à la photo ; `names` = libellés/plats proposés par le modèle. */
export function matchRecipes(signature: number[], recipes: Recipe[], names: string[]): RecipeMatch[] {
  const out: RecipeMatch[] = [];
  for (const r of recipes) {
    const best = Math.max(0, ...(r.photoSignatures ?? []).map((s) => cosine(signature, s)));
    if (best >= VERY_SIMILAR || (best >= SIMILAR && sharesWord(r.name, names))) out.push({ recipe: r, similarity: best });
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, 4);
}

/** Combien de fois un plat de ce nom a déjà été photographié avec une image proche. */
export function repeatCount(name: string, signature: number[] | undefined, history: PhotoSignature[]): number {
  const n = normalize(name);
  return history.filter((h) => h.normName === n && !h.recipeId && (!signature || cosine(signature, h.signature) >= SIMILAR - 0.06)).length;
}
