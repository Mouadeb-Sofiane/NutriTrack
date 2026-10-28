/**
 * Estimation guidée SANS balance ni IA : modèles de plats types.
 *
 * Chaque modèle décrit une HYPOTHÈSE DE COMPOSITION pour une assiette « moyenne »,
 * construite à partir des aliments de référence. Ce n'est pas une mesure : l'utilisateur
 * voit les hypothèses et peut corriger chaque ingrédient avant d'enregistrer.
 * Les deux réglages qui influencent le plus le résultat sont demandés :
 * la taille de la portion et la quantité de matière grasse / sauce.
 */
import type { LineItem } from './types';
import { lineFromFood, scalePer100 } from './nutrition';
import { withEstimate } from './estimates';
import { refFood } from './referenceFoods';

export type FatLevel = 'low' | 'medium' | 'high';
export type PlateSize = 'small' | 'medium' | 'large';

export const PLATE_FACTOR: Record<PlateSize, number> = { small: 0.7, medium: 1, large: 1.4 };
export const PLATE_LABEL: Record<PlateSize, string> = { small: 'Petite', medium: 'Moyenne', large: 'Grande' };
export const FAT_LABEL: Record<FatLevel, string> = { low: 'Peu', medium: 'Normal', high: 'Beaucoup' };

export interface DishTemplate {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  /** Ingrédients d'une assiette moyenne (g ou ml selon l'aliment). */
  base: [refId: string, amount: number][];
  /** Ingrédient gras/sauce dont la quantité dépend du réglage choisi. */
  fat: { refId: string; amounts: Record<FatLevel, number>; label: string };
}

export const DISH_TEMPLATES: DishTemplate[] = [
  { id: 'rice-meat', label: 'Riz et viande', emoji: '🍚', hint: 'Riz, poulet ou viande, quelques légumes',
    base: [['rice-cooked', 200], ['chicken-breast-cooked', 120], ['mixed-veg', 80]],
    fat: { refId: 'sunflower-oil', amounts: { low: 5, medium: 10, high: 20 }, label: 'Huile de cuisson' } },
  { id: 'pasta-tomato', label: 'Pâtes sauce tomate', emoji: '🍝', hint: 'Pâtes, sauce tomate, un peu de fromage',
    base: [['pasta-cooked', 250], ['tomato-coulis', 100], ['emmental', 10]],
    fat: { refId: 'olive-oil', amounts: { low: 3, medium: 8, high: 15 }, label: 'Huile dans la sauce' } },
  { id: 'pasta-cream', label: 'Pâtes à la crème', emoji: '🍝', hint: 'Pâtes, crème, jambon ou poulet, fromage',
    base: [['pasta-cooked', 250], ['ham', 50], ['emmental', 15]],
    fat: { refId: 'cream-30', amounts: { low: 30, medium: 60, high: 100 }, label: 'Crème fraîche' } },
  { id: 'couscous', label: 'Couscous', emoji: '🥘', hint: 'Semoule, légumes, pois chiches, viande',
    base: [['couscous-cooked', 200], ['mixed-veg', 150], ['chickpeas-cooked', 40], ['lamb-cooked', 100]],
    fat: { refId: 'olive-oil', amounts: { low: 5, medium: 12, high: 25 }, label: 'Huile / beurre (bouillon, semoule)' } },
  { id: 'stew', label: 'Plat en sauce / tajine', emoji: '🍲', hint: 'Viande, légumes en sauce, pain',
    base: [['lamb-cooked', 120], ['mixed-veg', 200], ['bread-baguette', 60]],
    fat: { refId: 'olive-oil', amounts: { low: 5, medium: 15, high: 25 }, label: 'Huile de cuisson' } },
  { id: 'soup', label: 'Soupe (chorba, harira…)', emoji: '🥣', hint: '1 bol d’environ 350 ml avec légumineuses',
    base: [['lentils-cooked', 60], ['mixed-veg', 120], ['pasta-cooked', 30], ['lamb-cooked', 25]],
    fat: { refId: 'olive-oil', amounts: { low: 3, medium: 7, high: 12 }, label: 'Huile' } },
  { id: 'salad', label: 'Salade composée', emoji: '🥗', hint: 'Crudités, thon ou œuf, maïs',
    base: [['lettuce', 50], ['tomato', 80], ['cucumber', 50], ['tuna-water', 50], ['corn', 40], ['egg', 50]],
    fat: { refId: 'olive-oil', amounts: { low: 5, medium: 12, high: 25 }, label: 'Huile de la vinaigrette' } },
  { id: 'curry', label: 'Curry et riz', emoji: '🍛', hint: 'Riz, poulet, sauce au lait de coco',
    base: [['rice-cooked', 180], ['chicken-breast-cooked', 120], ['onion', 40]],
    fat: { refId: 'coconut-milk', amounts: { low: 40, medium: 80, high: 130 }, label: 'Lait de coco / sauce' } },
  { id: 'noodles', label: 'Ramen / nouilles', emoji: '🍜', hint: 'Nouilles, bouillon, œuf, viande',
    base: [['pasta-cooked', 200], ['egg', 50], ['chicken-breast-cooked', 60], ['mixed-veg', 60]],
    fat: { refId: 'sunflower-oil', amounts: { low: 3, medium: 8, high: 15 }, label: 'Gras du bouillon / huile' } },
  { id: 'sandwich', label: 'Sandwich', emoji: '🥪', hint: 'Demi-baguette, jambon, fromage',
    base: [['bread-baguette', 125], ['ham', 40], ['emmental', 20], ['lettuce', 10]],
    fat: { refId: 'butter', amounts: { low: 5, medium: 10, high: 20 }, label: 'Beurre / mayonnaise' } },
  { id: 'burger-fries', label: 'Burger et frites', emoji: '🍔', hint: 'Pain, steak, fromage, frites',
    base: [['bread-sandwich', 70], ['beef-minced-15', 110], ['emmental', 20], ['fries', 150]],
    fat: { refId: 'mayonnaise', amounts: { low: 5, medium: 15, high: 30 }, label: 'Sauce' } },
  { id: 'pizza', label: 'Pizza', emoji: '🍕', hint: 'Une pizza individuelle de restaurant',
    base: [['pizza-margherita', 400]],
    fat: { refId: 'olive-oil', amounts: { low: 0, medium: 5, high: 15 }, label: 'Huile ajoutée / garniture grasse' } },
  { id: 'gratin', label: 'Gratin / plat au four', emoji: '🧀', hint: 'Pommes de terre, crème, fromage',
    base: [['potato-boiled', 250], ['emmental', 25]],
    fat: { refId: 'cream-30', amounts: { low: 30, medium: 60, high: 100 }, label: 'Crème' } },
  { id: 'breakfast', label: 'Petit-déjeuner', emoji: '🥐', hint: 'Pain, beurre, confiture, boisson chaude',
    base: [['bread-baguette', 60], ['jam', 20], ['coffee', 150]],
    fat: { refId: 'butter', amounts: { low: 5, medium: 10, high: 15 }, label: 'Beurre' } },
];

export function getTemplate(id: string) {
  return DISH_TEMPLATES.find((t) => t.id === id);
}

let seq = 0;
const tmpId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

const SIZES: PlateSize[] = ['small', 'medium', 'large'];
const FATS: FatLevel[] = ['low', 'medium', 'high'];
/** Taille d'assiette du scénario haut : un cran au-dessus (au-delà de « grande » : ×1,3). */
function highPlateFactor(size: PlateSize): number {
  const i = SIZES.indexOf(size);
  return i < SIZES.length - 1 ? PLATE_FACTOR[SIZES[i + 1]] : PLATE_FACTOR.large * 1.3;
}
/** Taille du bas de fourchette : un cran en dessous (en deçà de « petite » : ×0,75). */
function lowPlateFactor(size: PlateSize): number {
  const i = SIZES.indexOf(size);
  return i > 0 ? PLATE_FACTOR[SIZES[i - 1]] : PLATE_FACTOR.small * 0.75;
}
function highFatAmount(t: DishTemplate, fat: FatLevel): number {
  const i = FATS.indexOf(fat);
  return i < FATS.length - 1 ? t.fat.amounts[FATS[i + 1]] : t.fat.amounts.high * 1.5;
}
function lowFatAmount(t: DishTemplate, fat: FatLevel): number {
  const i = FATS.indexOf(fat);
  return i > 0 ? t.fat.amounts[FATS[i - 1]] : t.fat.amounts.low * 0.5;
}

/**
 * Génère les lignes (estimation visuelle) pour un modèle de plat, avec pour chacune :
 * - estimation moyenne : la taille et la matière grasse choisies ;
 * - estimation haute : assiette un cran plus copieuse ET un cran plus grasse ;
 * - bas de fourchette : un cran en dessous.
 * Le paramètre `newId` permet de fournir des identifiants stables (tests).
 */
/** Poids d'une assiette moyenne du modèle (ingrédients + matière grasse « normale »), en g. */
export function templateMass(t: DishTemplate): number {
  return t.base.reduce((s, [, g]) => s + g, 0) + t.fat.amounts.medium;
}

/**
 * Facteurs d'assiette déduits du poids estimé sur la photo (au lieu de petite / moyenne / grande).
 */
export function photoFactors(t: DishTemplate, mass: { low: number; normal: number; high: number }) {
  const m = templateMass(t);
  return { mean: mass.normal / m, high: mass.high / m, low: mass.low / m, mass };
}

export function buildTemplateItems(t: DishTemplate, size: PlateSize, fat: FatLevel, newId: () => string = tmpId, photo?: ReturnType<typeof photoFactors>): { items: LineItem[]; assumptions: string[] } {
  const f = photo ? photo.mean : PLATE_FACTOR[size];
  const fh = photo ? photo.high : highPlateFactor(size);
  const fl = photo ? photo.low : lowPlateFactor(size);
  const items: LineItem[] = [];
  const sizeReason = photo
    ? `Poids haut estimé sur la photo : ${photo.mass.high} g au lieu de ${photo.mass.normal} g pour l’assiette.`
    : `Assiette plus copieuse (×${fmt(fh)} au lieu de ×${fmt(f)} une assiette moyenne).`;
  for (const [refId, amount] of t.base) {
    const food = refFood(refId);
    const mean = Math.round(amount * f);
    const item = lineFromFood(food, { unit: food.basis, count: mean }, newId(), 'rough');
    if (!item) continue;
    items.push(withEstimate(item, {
      mean: item.nutrients,
      high: scalePer100(food.per100, Math.round(amount * fh)),
      low: scalePer100(food.per100, Math.round(amount * fl)),
      chosen: 'mean',
      highReasons: [sizeReason],
      assumptions: [`${food.name} : environ ${mean} ${food.basis}.`],
      method: 'template',
    }));
  }
  const fatAmount = Math.round(t.fat.amounts[fat] * f);
  const fatHigh = Math.round(highFatAmount(t, fat) * fh);
  const fatLow = Math.round(lowFatAmount(t, fat) * fl);
  const fatFood = refFood(t.fat.refId);
  const fatItem = lineFromFood(fatFood, { unit: fatFood.basis, count: Math.max(fatAmount, 0.0001) }, newId(), 'rough');
  if (fatItem) {
    const zero = fatAmount === 0;
    const base = zero ? { ...fatItem, quantity: null, baseAmount: 0, nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0 } } : fatItem;
    items.push(withEstimate({ ...base, note: t.fat.label }, {
      mean: base.nutrients,
      high: scalePer100(fatFood.per100, fatHigh),
      low: scalePer100(fatFood.per100, fatLow),
      chosen: 'mean',
      highReasons: [`${t.fat.label} plus généreuse : ${fatHigh} ${fatFood.basis} au lieu de ${fatAmount} ${fatFood.basis}.`],
      assumptions: [`${t.fat.label} : ${FAT_LABEL[fat].toLowerCase()} (${fatAmount} ${fatFood.basis}).`],
      highlightHigh: `${t.fat.label} : la quantité réelle est rarement connue. L’estimation haute en tient compte.`,
      method: 'template',
    }));
  }
  const assumptions = [
    photo
      ? `Modèle « ${t.label} » ajusté au poids estimé sur la photo : ~${photo.mass.normal} g (fourchette ${photo.mass.low}–${photo.mass.high} g), soit ×${fmt(f)} une assiette moyenne.`
      : `Modèle « ${t.label} », portion ${PLATE_LABEL[size].toLowerCase()} (×${fmt(f)} par rapport à une assiette moyenne).`,
    `${t.fat.label} : ${FAT_LABEL[fat].toLowerCase()} (${fatAmount} ${fatFood.basis}).`,
    'Quantités estimées visuellement, sans pesée : corrige les ingrédients si tu en sais plus.',
    photo
      ? `Scénario haut : poids haut de la photo et ${t.fat.label.toLowerCase()} un cran plus généreuse.`
      : `Scénario haut : assiette un cran plus copieuse et ${t.fat.label.toLowerCase()} un cran plus généreuse.`,
  ];
  return { items, assumptions };
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
