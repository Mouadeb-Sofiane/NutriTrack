/**
 * Associe une ligne de texte (« 2 c. à soupe d'huile ») à un aliment connu et
 * construit la ligne nutritionnelle correspondante lorsque la conversion est fiable.
 */
import type { Food, LineItem } from './types';
import { lineFromFood, manualLine } from './nutrition';
import { HOUSEHOLD_ML, PRECISION_FROM_UNIT, type ParsedLine } from './recipes';
import { normalize, searchFoods } from './referenceFoods';

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'un', 'une', 'et', 'a', 'au', 'aux', 'en', 'environ', 'gros', 'grosse', 'petit', 'petite', 'moyen', 'moyenne', 'frais', 'fraiche']);

function singular(w: string): string {
  return w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w;
}

export function bestFoodMatch(foods: Food[], name: string): Food | null {
  const words = normalize(name).split(' ').filter((w) => w && !STOP.has(w)).map(singular);
  if (!words.length) return null;
  // On essaie d'abord tous les mots, puis on retire les derniers (« huile d'olive vierge » → « huile olive »).
  for (let n = words.length; n >= 1; n--) {
    const res = searchFoods(foods, words.slice(0, n).join(' '), 1);
    if (res.length) return res[0];
  }
  return null;
}

export function lineFromParsed(foods: Food[], p: ParsedLine, id: string): { item: LineItem; matched: Food | null; converted: boolean } {
  const food = bestFoodMatch(foods, p.name);
  const unresolved = (note: string): { item: LineItem; matched: Food | null; converted: boolean } => ({
    item: manualLine(id, p.name, {}, {
      quantity: p.quantity,
      unit: 'none',
      unitLabel: p.quantity != null ? `${fmt(p.quantity)} ${p.unit ?? ''}`.trim() : undefined,
      precision: PRECISION_FROM_UNIT(p.unit),
      note,
    }),
    matched: food,
    converted: false,
  });
  if (!food) return unresolved('Aliment non reconnu : complète les valeurs ou choisis un aliment.');
  if (p.quantity == null) return unresolved(`Quantité inconnue (aliment proche : ${food.name}).`);

  let item: LineItem | null = null;
  if (p.unit === 'g' || p.unit === 'ml') {
    item = lineFromFood(food, { unit: p.unit, count: p.quantity }, id);
  } else if (p.unit && p.unit in HOUSEHOLD_ML) {
    const serving = food.servings.find((s) => normalize(s.label).includes(normalize(p.unit!)));
    if (serving) item = lineFromFood(food, { unit: serving.id, count: p.quantity }, id);
    else item = lineFromFood(food, { unit: 'ml', count: p.quantity * HOUSEHOLD_ML[p.unit] }, id, 'approx');
    if (item) item = { ...item, unitLabel: `${fmt(p.quantity)} ${p.unit}`, unit: 'serving', quantity: p.quantity };
  } else if (p.unit === 'pièce' || p.unit === 'tranche') {
    const serving = food.servings.find((s) => /^1 /.test(s.label) && !/c\. à|verre|bol|poign|louche|portion/.test(s.label));
    if (serving) item = lineFromFood(food, { unit: serving.id, count: p.quantity }, id);
  }
  if (!item) return unresolved(`Conversion impossible pour « ${p.unit ?? '?'} » (aliment proche : ${food.name}).`);
  return { item, matched: food, converted: true };
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
