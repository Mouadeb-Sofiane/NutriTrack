/**
 * Modèle de données de NutriTrack.
 *
 * Principes :
 * - Un repas enregistré (MealEntry) conserve une COPIE des valeurs nutritionnelles
 *   utilisées au moment de l'enregistrement (LineItem.nutrients). Modifier un aliment
 *   ou une recette ne réécrit jamais l'historique sans action explicite.
 * - Une valeur nutritionnelle inconnue vaut `null` (et non 0) : on la signale au lieu
 *   d'inventer une précision inexistante.
 * - Chaque ligne garde sa source et son niveau de précision pour distinguer
 *   base de données, saisie manuelle, calcul et estimation.
 */

export const SCHEMA_VERSION = 1;

export type ISODate = string; // 'YYYY-MM-DD' (date locale)
export type ISODateTime = string; // ISO 8601 complet

export interface Nutrients {
  kcal: number | null;
  protein: number | null; // g
  carbs: number | null; // g (glucides assimilables)
  fat: number | null; // g
}

export type NutrientKey = keyof Nutrients;
export const NUTRIENT_KEYS: NutrientKey[] = ['kcal', 'protein', 'carbs', 'fat'];

/** Précision de la quantité : pesée/lue, mesure ménagère, estimation visuelle. */
export type Precision = 'exact' | 'approx' | 'rough';

export type SourceKind =
  | 'reference' // table de référence intégrée (valeurs moyennes indicatives)
  | 'openfoodfacts' // fiche produit Open Food Facts
  | 'manual' // saisi par l'utilisateur
  | 'recipe' // calculé à partir d'une recette personnelle
  | 'estimate' // estimation guidée (modèle de plat, portion visuelle…)
  | 'ai'; // estimation produite par une IA (non disponible pour l'instant)

export interface SourceInfo {
  kind: SourceKind;
  label?: string;
  url?: string;
  retrievedAt?: ISODateTime;
}

export type BaseUnit = 'g' | 'ml';

export interface ServingSize {
  id: string;
  label: string; // ex. « 1 œuf moyen », « 1 c. à soupe »
  amount: number; // quantité dans l'unité de base de l'aliment
  /** Précision typique de cette mesure (une c. à soupe d'huile n'est pas pesée). */
  precision: Precision;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  category?: string;
  basis: BaseUnit; // valeurs pour 100 g ou 100 ml
  per100: Nutrients;
  /** g/ml, uniquement lorsqu'elle est raisonnablement connue (on ne suppose pas 1 ml = 1 g). */
  density?: number;
  servings: ServingSize[];
  source: SourceInfo;
  favorite: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type QuantityUnit = 'g' | 'ml' | 'serving' | 'portion' | 'none';

/** Ligne d'aliment, utilisée dans un repas ET dans une recette (copie figée des valeurs). */
export interface LineItem {
  id: string;
  name: string;
  foodId?: string; // id d'un Food ou d'un aliment de référence (« ref:… »)
  recipeId?: string;
  recipeVersion?: number;
  quantity: number | null; // null = quantité inconnue
  unit: QuantityUnit;
  unitLabel?: string; // ex. « c. à soupe », « portion moyenne »
  /** Quantité convertie dans l'unité de base (g ou ml) si la conversion est fiable. */
  baseAmount?: number | null;
  baseUnit?: BaseUnit;
  nutrients: Nutrients; // pour la quantité de la ligne
  /** Fourchette calorique plausible déduite des hypothèses (voir domain/nutrition.ts). */
  kcalRange?: { min: number; max: number } | null;
  precision: Precision;
  source: SourceInfo;
  note?: string;
  /** Pour une ligne issue d'une recette : part consommée (permet un recalcul explicite). */
  consumption?: RecipeConsumption;
}

export type RecipeConsumption =
  | { kind: 'servings'; servings: number; size: 'small' | 'usual' | 'large' }
  | { kind: 'fraction'; fraction: number }
  | { kind: 'grams'; grams: number };

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type MealPlace = 'home' | 'restaurant';

export type EstimationMethod =
  | 'manual' // ingrédients et valeurs saisis
  | 'database' // aliments de la base (référence / Open Food Facts / mes aliments)
  | 'recipe' // recette personnelle
  | 'guided' // estimation guidée (modèle de plat, portion visuelle)
  | 'quick' // calories rapides
  | 'mixed'
  | 'ai';

export interface MealEntry {
  id: string;
  date: ISODate;
  mealType: MealType;
  name?: string;
  items: LineItem[];
  place: MealPlace;
  restaurantName?: string;
  method: EstimationMethod;
  assumptions: string[];
  photoId?: string;
  notes?: string;
  userCorrected: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  cuisine?: string;
  categories: string[];
  photoId?: string;
  ingredients: LineItem[];
  servings: number; // nombre de portions de la préparation
  totalWeightG?: number | null; // poids total du plat, si connu
  /**
   * Total saisi directement quand les ingrédients/quantités sont inconnus
   * (ex. « environ 2400 kcal pour le plat »). Prioritaire sur la somme des ingrédients.
   */
  manualTotal?: Nutrients | null;
  manualPrecision?: Precision;
  instructions?: string;
  prepTimeMin?: number | null;
  notes?: string;
  assumptions: string[];
  favorite: boolean;
  parentId?: string; // recette d'origine si variante
  variantLabel?: string;
  version: number; // incrémenté à chaque modification
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WeightEntry {
  id: string;
  date: ISODate;
  kg: number;
  note?: string;
  createdAt: ISODateTime;
}

export interface ExerciseEntry {
  id: string;
  date: ISODate;
  label: string;
  kcal: number; // estimation saisie par l'utilisateur
  minutes?: number | null;
  createdAt: ISODateTime;
}

export interface PhotoRecord {
  id: string;
  blob: Blob;
  mime: string;
  createdAt: ISODateTime;
}

/** Portion personnelle réutilisable : « Mon bol habituel de soupe de lentilles ». */
export interface PersonalPortion {
  id: string;
  name: string;
  recipeId?: string;
  foodId?: string;
  /** Pour une recette : nombre de portions de la recette. */
  servings?: number | null;
  /** Pour un aliment (ou une recette dont le poids total est connu) : quantité en g/ml. */
  amount?: number | null;
  unit?: BaseUnit;
  createdAt: ISODateTime;
}

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type JobType = 'seated' | 'standing' | 'physical';
export type GoalMode = 'lose' | 'maintain' | 'gain' | 'custom';
export type Pace = 'gentle' | 'moderate' | 'ambitious';
/** 'included' : le niveau d'activité inclut les entraînements. 'separate' : ils sont saisis à part. */
export type EnergyMethod = 'included' | 'separate';

export interface Profile {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  sex: Sex | null;
  activityLevel: ActivityLevel;
  jobType: JobType | null;
  trainingPerWeek: number | null;
  trainingType?: string;
  goal: GoalMode;
  pace: Pace;
  energyMethod: EnergyMethod;
  /** Part des calories d'exercice ajoutée au budget en mode 'separate' (0 par défaut). */
  exerciseCredit: 0 | 0.5 | 1;
  caution: { pregnant: boolean; breastfeeding: boolean; edHistory: boolean };
  dietPrefs?: string;
  allergies?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Goals {
  kcal: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  trackMacros: boolean;
  /** true si l'utilisateur a fixé lui-même l'objectif calorique. */
  manual: boolean;
  basis?: { bmr: number | null; tdee: number | null; factor: number; adjustmentPct: number };
  updatedAt: ISODateTime;
}

export interface Preferences {
  onboarded: boolean;
  customCuisines: string[];
  lastBackupAt?: ISODateTime;
}
