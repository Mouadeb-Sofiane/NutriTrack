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
import { lineFromFood } from './nutrition';
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

/**
 * Génère les lignes (estimation visuelle, précision « rough ») pour un modèle de plat.
 * Le paramètre `newId` permet de fournir des identifiants stables (tests).
 */
export function buildTemplateItems(t: DishTemplate, size: PlateSize, fat: FatLevel, newId: () => string = tmpId): { items: LineItem[]; assumptions: string[] } {
  const f = PLATE_FACTOR[size];
  const items: LineItem[] = [];
  for (const [refId, amount] of t.base) {
    const food = refFood(refId);
    const item = lineFromFood(food, { unit: food.basis, count: Math.round(amount * f) }, newId(), 'rough');
    if (item) items.push(item);
  }
  const fatAmount = Math.round(t.fat.amounts[fat] * f);
  if (fatAmount > 0) {
    const food = refFood(t.fat.refId);
    const item = lineFromFood(food, { unit: food.basis, count: fatAmount }, newId(), 'rough');
    if (item) items.push({ ...item, note: t.fat.label });
  }
  const assumptions = [
    `Modèle « ${t.label} », portion ${PLATE_LABEL[size].toLowerCase()} (×${f.toString().replace('.', ',')} par rapport à une assiette moyenne).`,
    `${t.fat.label} : ${FAT_LABEL[fat].toLowerCase()} (${fatAmount} ${refFood(t.fat.refId).basis}).`,
    'Quantités estimées visuellement, sans pesée : corrige les ingrédients si tu en sais plus.',
  ];
  return { items, assumptions };
}
