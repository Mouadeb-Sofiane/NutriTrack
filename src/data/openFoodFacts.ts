/**
 * Open Food Facts — base collaborative et gratuite de produits alimentaires.
 * Données sous licence ODbL (base) / DbCL (contenu) : attribution obligatoire
 * « Données issues d'Open Food Facts (openfoodfacts.org) ».
 * Limites publiées : ~100 requêtes/min pour la lecture de produit, ~10/min pour la recherche.
 * Les fiches sont saisies par des contributeurs : elles peuvent être incomplètes ou erronées.
 * Seul le texte recherché ou le code-barres est envoyé ; aucune donnée personnelle.
 */
import type { Food, ServingSize } from '../domain/types';
import { cleanNutrient } from '../domain/nutrition';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,nutriments,serving_quantity,serving_size,quantity,nutrition_data_per';

export class OffError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'network' | 'not_found' | 'rate_limited') {
    super(message);
  }
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  generic_name_fr?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_quantity?: number | string;
  serving_size?: string;
  nutrition_data_per?: string;
  quantity?: string;
}

function n(v: unknown): number | null {
  const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return cleanNutrient(x);
}

/** Convertit une fiche Open Food Facts en aliment local. Renvoie null si aucune valeur nutritionnelle exploitable. */
export function mapOffProduct(p: OffProduct, now: string): Food | null {
  const name = (p.product_name_fr || p.product_name || p.generic_name_fr || '').trim();
  if (!name || !p.code) return null;
  const nu = p.nutriments ?? {};
  let kcal = n(nu['energy-kcal_100g']);
  if (kcal == null) {
    const kj = n(nu['energy-kj_100g']) ?? n(nu['energy_100g']);
    if (kj != null) kcal = kj / 4.184;
  }
  const per100 = {
    kcal: kcal != null ? Math.round(kcal * 10) / 10 : null,
    protein: n(nu['proteins_100g']),
    carbs: n(nu['carbohydrates_100g']),
    fat: n(nu['fat_100g']),
  };
  if (per100.kcal == null && per100.protein == null && per100.carbs == null && per100.fat == null) return null;
  const servings: ServingSize[] = [];
  const sq = n(p.serving_quantity);
  if (sq && sq > 0) servings.push({ id: 's0', label: `1 portion (${p.serving_size ?? `${sq} g`})`, amount: sq, precision: 'exact' });
  // Pour les boissons (contenance en ml/cl/l), les valeurs *_100g d'OFF correspondent à 100 ml.
  const isLiquid = /\d\s*(ml|cl|l)\b/i.test(p.quantity ?? '');
  return {
    id: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    barcode: p.code,
    basis: isLiquid ? 'ml' : 'g',
    per100,
    servings,
    source: { kind: 'openfoodfacts', label: 'Open Food Facts (données collaboratives)', url: `${BASE}/product/${p.code}`, retrievedAt: now },
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OffError('Pas de connexion Internet : la recherche Open Food Facts est indisponible. Les aliments enregistrés restent utilisables.', 'offline');
  }
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new OffError('Impossible de joindre Open Food Facts. Vérifie ta connexion ou réessaie plus tard.', 'network');
  }
  if (res.status === 429) throw new OffError('Trop de recherches en peu de temps : patiente une minute.', 'rate_limited');
  if (res.status === 404) throw new OffError('Produit introuvable.', 'not_found');
  if (!res.ok) throw new OffError(`Open Food Facts a répondu avec une erreur (${res.status}).`, 'network');
  return res.json();
}

export async function fetchByBarcode(code: string, now: string, signal?: AbortSignal): Promise<Food> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) throw new OffError('Code-barres invalide.', 'not_found');
  const data = (await getJson(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, signal)) as { status?: number; product?: OffProduct };
  if (!data.product || data.status === 0) throw new OffError('Produit introuvable dans Open Food Facts. Tu peux le saisir à la main.', 'not_found');
  const f = mapOffProduct({ ...data.product, code: data.product.code ?? clean }, now);
  if (!f) throw new OffError('Ce produit existe mais sa fiche ne contient pas de valeurs nutritionnelles.', 'not_found');
  return f;
}

export async function searchProducts(query: string, now: string, signal?: AbortSignal): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const data = (await getJson(url, signal)) as { products?: OffProduct[] };
  return (data.products ?? []).map((p) => mapOffProduct(p, now)).filter((f): f is Food => f != null);
}
