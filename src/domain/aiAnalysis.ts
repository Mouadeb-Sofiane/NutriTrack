/**
 * Analyse de photo par IA — contrat de réponse et conversion en lignes de repas.
 *
 * Répartition des rôles (choix de conception) :
 * - le modèle de vision IDENTIFIE les aliments et ESTIME les portions (fourchette en g),
 *   en distinguant ce qui est visible, partiellement visible ou supposé ;
 * - l'application CALCULE les calories avec ses propres tables (catalogue, table de
 *   référence, recettes personnelles). Les valeurs pour 100 g proposées par l'IA ne
 *   servent qu'en dernier recours et sont marquées « non vérifiées ».
 * Rien ici ne suppose qu'une photo révèle le poids exact, l'huile ou les ingrédients cachés.
 */
import { z } from 'zod';
import type { EstimateInfo, Food, LineItem, Nutrients, Recipe } from './types';
import { cleanNutrients, scalePer100 } from './nutrition';
import { withEstimate } from './estimates';
import type { CatalogEntry } from './catalog';
import { findCatalogHits } from './quickText';
import { normalize, refFood, REFERENCE_FOODS } from './referenceFoods';

const num = z.number().refine(Number.isFinite);
const per100 = num.min(0).max(950).nullable().optional();

export const aiItemSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(['main', 'side', 'sauce', 'topping', 'drink', 'dessert', 'snack', 'other']).catch('other'),
  visibility: z.enum(['visible', 'partial', 'assumed']).catch('assumed'),
  evidence: z.string().max(200).catch(''),
  size: z.enum(['small', 'medium', 'large']).catch('medium'),
  grams_low: num.min(0).max(5000),
  grams_mean: num.min(0).max(5000),
  grams_high: num.min(0).max(5000),
  kcal_per_100g: per100,
  protein_per_100g: per100,
  carbs_per_100g: per100,
  fat_per_100g: per100,
});

export const aiAnalysisSchema = z.object({
  is_food: z.boolean(),
  dish_name: z.string().max(120).catch(''),
  confidence: z.enum(['low', 'medium', 'high']).catch('low'),
  items: z.array(aiItemSchema).max(20),
  hidden_unknowns: z.array(z.string().max(160)).max(10).catch([]),
  questions: z.array(z.object({ text: z.string().max(200), options: z.array(z.string().max(60)).max(5).catch([]) })).max(3).catch([]),
  notes: z.string().max(400).catch(''),
});

export type AiItem = z.infer<typeof aiItemSchema>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

/** Valide une réponse (du relais) ; ne laisse passer aucune structure inattendue. */
export function parseAnalysis(raw: unknown): { ok: true; analysis: AiAnalysis } | { ok: false; error: string } {
  const r = aiAnalysisSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: 'Réponse de l’IA dans un format inattendu.' };
  return { ok: true, analysis: r.data };
}

export const VISIBILITY_LABEL: Record<AiItem['visibility'], string> = {
  visible: 'visible',
  partial: 'partiellement visible',
  assumed: 'supposé (non visible avec certitude)',
};

export type NutritionSourceKind = 'catalog' | 'reference' | 'mine' | 'ai' | 'none';

export interface MappedItem {
  line: LineItem;
  ai: AiItem;
  nutritionSource: NutritionSourceKind;
  /** Nom de l'aliment de référence utilisé pour les valeurs nutritionnelles. */
  matchedName?: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

/** Remet la fourchette en ordre (basse ≤ moyenne ≤ haute) et refuse les portions nulles. */
export function orderedGrams(ai: AiItem): { low: number; mean: number; high: number } | null {
  const mean = ai.grams_mean;
  if (!(mean > 0)) return null;
  const low = Math.min(ai.grams_low > 0 ? ai.grams_low : mean, mean);
  const high = Math.max(ai.grams_high, mean);
  return { low, mean, high };
}

function aiPer100(ai: AiItem): Nutrients | null {
  if (ai.kcal_per_100g == null) return null;
  return cleanNutrients({ kcal: ai.kcal_per_100g, protein: ai.protein_per_100g ?? null, carbs: ai.carbs_per_100g ?? null, fat: ai.fat_per_100g ?? null });
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'un', 'une', 'et', 'a', 'au', 'aux', 'en', 'avec', 'sans', 'sur']);
/** Mots de préparation qui ne changent pas l'aliment de référence (on préfère alors la version cuite). */
const DESCRIPTORS = new Set(['grille', 'grillee', 'roti', 'rotie', 'poele', 'poelee', 'saute', 'sautee', 'vapeur', 'maison', 'nature', 'cuit', 'cuite', 'morceau', 'tranche', 'emince', 'emincee', 'chaud', 'chaude', 'petit', 'petite', 'gros', 'grosse', 'portion']);
const sing = (w: string) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

/**
 * Correspondance STRICTE pour l'IA : tous les mots significatifs du nom doivent se
 * retrouver dans le nom (ou les synonymes) d'un aliment. Pas de correspondance partielle
 * ni par catégorie : mieux vaut « valeurs inconnues » qu'un aliment approchant à tort.
 */
export function strictFoodMatch(foods: Food[], name: string): Food | null {
  const words = normalize(name).split(' ').filter((w) => w && !STOP.has(w)).map(sing).filter((w) => !DESCRIPTORS.has(w));
  if (!words.length) return null;
  const wantsRaw = /\bcru/.test(normalize(name));
  const scored = foods
    .map((f) => {
      const hay = normalize(`${f.name} ${(f as Food & { aliases?: string }).aliases ?? ''}`).split(' ').map(sing);
      if (!words.every((w) => hay.includes(w))) return null;
      const n = normalize(f.name);
      let score = -n.length / 100;
      if (/\bcrue?s?\b/.test(n)) score += wantsRaw ? 2 : -2;
      if (/\bcuite?s?\b/.test(n)) score += 1;
      return { f, score };
    })
    .filter((x): x is { f: Food; score: number } => x != null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.f ?? null;
}

function catalogMatch(name: string): CatalogEntry | null {
  const hits = findCatalogHits(normalize(name));
  // On n'accepte qu'une correspondance claire (une seule mention dans le nom).
  return hits.length === 1 ? hits[0].entry : null;
}

/**
 * Convertit un élément identifié par l'IA en ligne de repas avec estimation moyenne / haute.
 * - moyenne : portion moyenne × composition moyenne ;
 * - haute : portion haute (estimée par l'IA) × composition plus riche si connue ;
 * - basse : portion basse × composition moyenne.
 */
export function mapAiItem(ai: AiItem, id: string, ctx: { foods?: Food[] } = {}): MappedItem {
  const grams = orderedGrams(ai);
  const base = {
    id,
    name: ai.name.trim(),
    unit: 'g' as const,
    baseUnit: 'g' as const,
    precision: 'rough' as const,
  };
  if (!grams) {
    return {
      ai, nutritionSource: 'none',
      line: { ...base, quantity: null, baseAmount: null, nutrients: { kcal: null, protein: null, carbs: null, fat: null }, kcalRange: null, source: { kind: 'ai', label: 'Identifié par IA, portion non estimée' }, note: 'Portion inconnue : complète la quantité ou les valeurs.' },
    };
  }

  let mean100: Nutrients | null = null;
  let high100: Nutrients | null = null;
  let richLabel: string | null = null;
  let kind: NutritionSourceKind = 'none';
  let matchedName: string | undefined;

  const entry = catalogMatch(ai.name);
  if (entry) {
    mean100 = entry.per100;
    high100 = entry.rich?.per100 ?? entry.per100;
    richLabel = entry.rich?.label ?? null;
    kind = 'catalog';
    matchedName = entry.name;
  } else {
    const food = strictFoodMatch([...(ctx.foods ?? []), ...REFERENCE_FOODS], ai.name);
    if (food && food.basis === 'g' && food.per100.kcal != null) {
      mean100 = food.per100;
      high100 = food.per100;
      kind = food.id.startsWith('ref:') ? 'reference' : 'mine';
      matchedName = food.name;
    } else {
      const est = aiPer100(ai);
      if (est) {
        mean100 = est;
        high100 = est;
        kind = 'ai';
      }
    }
  }

  const assumptions = [
    `Identifié par l’IA : ${VISIBILITY_LABEL[ai.visibility]}${ai.evidence ? ` — ${ai.evidence}` : ''}.`,
    `Portion estimée sur la photo : environ ${fmt(grams.mean)} g (entre ${fmt(grams.low)} et ${fmt(grams.high)} g). Ce n’est pas une pesée.`,
  ];
  const sourceLabel =
    kind === 'catalog' ? `Portion estimée par IA · valeurs : catalogue NutriTrack (${matchedName}, ordre de grandeur)`
    : kind === 'reference' ? `Portion estimée par IA · valeurs : table de référence (${matchedName})`
    : kind === 'mine' ? `Portion estimée par IA · valeurs : mes aliments (${matchedName})`
    : kind === 'ai' ? 'Portion et valeurs nutritionnelles estimées par l’IA — non vérifiées'
    : 'Identifié par IA, valeurs nutritionnelles inconnues';

  if (!mean100 || !high100) {
    return {
      ai, nutritionSource: 'none',
      line: { ...base, quantity: Math.round(grams.mean), baseAmount: grams.mean, nutrients: { kcal: null, protein: null, carbs: null, fat: null }, kcalRange: null, source: { kind: 'ai', label: sourceLabel }, note: 'Aucune valeur nutritionnelle fiable : complète-les ou choisis un aliment.' },
    };
  }

  const highReasons: string[] = [];
  if (grams.high > grams.mean) highReasons.push(`Portion plus grande : ${fmt(grams.high)} g au lieu de ${fmt(grams.mean)} g (limite haute estimée sur la photo).`);
  if (richLabel && high100.kcal !== mean100.kcal) highReasons.push(`${richLabel} : ${fmt(high100.kcal ?? 0)} kcal/100 g au lieu de ${fmt(mean100.kcal ?? 0)}.`);
  if (kind === 'ai') assumptions.push('Valeurs pour 100 g proposées par l’IA, faute d’aliment correspondant dans les tables : à vérifier.');
  else assumptions.push(`Valeurs nutritionnelles : ${matchedName} (${fmt(mean100.kcal ?? 0)} kcal/100 g).`);

  const highlight =
    ai.visibility === 'assumed' ? 'Élément supposé, pas visible avec certitude sur la photo.'
    : ai.category === 'sauce' || ai.category === 'topping' ? 'La quantité de sauce ou de garniture est difficile à juger sur une photo. L’estimation haute en tient compte.'
    : grams.high > grams.mean * 1.4 ? 'La portion est difficile à évaluer sur la photo. L’estimation haute tient compte d’une portion plus généreuse.'
    : null;

  const info: EstimateInfo = {
    mean: scalePer100(mean100, grams.mean),
    high: scalePer100(high100, grams.high),
    low: scalePer100(mean100, grams.low),
    chosen: 'mean',
    highReasons,
    assumptions,
    highlightHigh: highlight,
    method: 'visual',
    catalogId: undefined,
  };
  const line: LineItem = {
    ...base,
    foodId: kind === 'reference' || kind === 'mine' ? strictFoodMatch([...(ctx.foods ?? []), ...REFERENCE_FOODS], ai.name)?.id : undefined,
    quantity: Math.round(grams.mean),
    baseAmount: grams.mean,
    nutrients: info.mean,
    kcalRange: null,
    source: { kind: 'ai', label: sourceLabel },
  };
  return { ai, nutritionSource: kind, matchedName, line: withEstimate(line, info) };
}

const FAT_WORDS = /huile|beurre|mati[eè]re grasse|graisse|friture|cuisson|ghee|smen/i;

/**
 * Matière grasse de cuisson invisible : si l'IA la signale comme inconnue pour un plat
 * cuisiné et qu'aucun élément gras n'est listé, on ajoute une hypothèse explicite
 * (moyenne 5 g, haute 15 g, basse 0) que l'utilisateur peut retirer.
 */
export function hiddenFatLine(a: AiAnalysis, id: string): LineItem | null {
  if (!a.hidden_unknowns.some((u) => FAT_WORDS.test(u))) return null;
  const cooked = a.items.some((i) => ['main', 'side'].includes(i.category));
  const hasFat = a.items.some((i) => FAT_WORDS.test(i.name));
  if (!cooked || hasFat) return null;
  const oil = refFood('sunflower-oil');
  const line: LineItem = {
    id, name: 'Matière grasse de cuisson (non visible)', unit: 'g', quantity: 5, baseAmount: 5, baseUnit: 'g',
    nutrients: scalePer100(oil.per100, 5), kcalRange: null, precision: 'rough',
    source: { kind: 'estimate', label: 'Hypothèse : matière grasse invisible sur la photo' },
    note: 'Hypothèse ajoutée car l’IA ne peut pas voir l’huile ou le beurre utilisés. Retire-la si le plat n’en contenait pas.',
  };
  return withEstimate(line, {
    mean: scalePer100(oil.per100, 5),
    high: scalePer100(oil.per100, 15),
    low: scalePer100(oil.per100, 0),
    chosen: 'mean',
    highReasons: ['Cuisson plus grasse : 15 g de matière grasse au lieu de 5 g.'],
    assumptions: ['Environ 1 c. à café d’huile ou de beurre pour la cuisson (invisible sur la photo).'],
    highlightHigh: 'La matière grasse de cuisson ne se voit pas sur une photo.',
    method: 'visual',
  });
}

/** Recettes personnelles dont le nom correspond au plat reconnu. */
export function suggestRecipes(a: AiAnalysis, recipes: Recipe[]): Recipe[] {
  const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'a', 'et', 'avec', 'en', 'maison', 'plat', 'assiette', 'mon', 'ma']);
  const words = (s: string) => normalize(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  const target = new Set([a.dish_name, ...a.items.map((i) => i.name)].flatMap(words));
  return recipes
    .map((r) => ({ r, score: words(r.name).filter((w) => target.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map((x) => x.r);
}

export interface AnalysisLines {
  mapped: MappedItem[];
  hiddenFat: LineItem | null;
  assumptions: string[];
  warnings: string[];
}

export function linesFromAnalysis(a: AiAnalysis, newId: () => string, ctx: { foods?: Food[] } = {}): AnalysisLines {
  const mapped = a.items.map((ai) => mapAiItem(ai, newId(), ctx));
  const warnings: string[] = [];
  if (!a.is_food) warnings.push('L’IA ne voit pas d’aliment sur cette photo.');
  if (a.is_food && !a.items.length) warnings.push('Aucun aliment identifiable avec assez de certitude.');
  if (a.confidence === 'low') warnings.push('Analyse très incertaine : vérifie chaque élément, ou décris le plat en quelques mots.');
  const unknownNutrition = mapped.filter((m) => m.nutritionSource === 'none').length;
  if (unknownNutrition) warnings.push(`${unknownNutrition} élément(s) sans valeurs nutritionnelles fiables : à compléter.`);
  const assumptions = [
    `Analyse photo par IA${a.dish_name ? ` : « ${a.dish_name} »` : ''} (confiance ${a.confidence === 'high' ? 'élevée' : a.confidence === 'medium' ? 'moyenne' : 'faible'}).`,
    ...a.hidden_unknowns.map((u) => `Inconnu sur la photo : ${u}.`),
  ];
  return { mapped, hiddenFat: hiddenFatLine(a, newId()), assumptions, warnings };
}
