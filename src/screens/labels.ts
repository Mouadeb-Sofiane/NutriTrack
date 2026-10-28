import type { MealType } from '../domain/types';

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
  other: 'Autre',
};

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

export const MEAL_EMOJI: Record<MealType, string> = { breakfast: '☕', lunch: '🍽️', dinner: '🌙', snack: '🍎', other: '🥄' };

export const CUISINES: { group: string; items: string[] }[] = [
  { group: 'Maghreb', items: ['Algérienne', 'Marocaine', 'Tunisienne', 'Maghrébine'] },
  { group: 'Moyen-Orient', items: ['Libanaise', 'Syrienne', 'Palestinienne', 'Turque', 'Moyen-Orient'] },
  { group: 'Asie', items: ['Japonaise', 'Chinoise', 'Thaïlandaise', 'Coréenne', 'Vietnamienne', 'Indienne', 'Asiatique'] },
  { group: 'Europe', items: ['Française', 'Espagnole', 'Italienne', 'Grecque', 'Portugaise', 'Européenne'] },
  { group: 'Autres', items: ['Africaine', 'Américaine', 'Latino-américaine', 'Méditerranéenne'] },
];

export const CATEGORIES = ['Familiale', 'Rapide', 'Végétarienne', 'Végétalienne', 'Street food', 'Dessert', 'Festive', 'Restaurant', 'Petit-déjeuner', 'Soupe', 'Salade', 'Plat au four'];
