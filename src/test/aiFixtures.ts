import type { AiAnalysis } from '../domain/aiAnalysis';

/** Réponse type d'un modèle de vision pour « kebab, frites, sauce, canette » (données de test). */
export const KEBAB_ANALYSIS: AiAnalysis = {
  is_food: true,
  dish_name: 'Kebab avec frites',
  confidence: 'medium',
  items: [
    { name: 'Kebab', category: 'main', visibility: 'visible', evidence: 'sandwich pita garni de viande, salade, tomate', size: 'medium', grams_low: 280, grams_mean: 330, grams_high: 400, kcal_per_100g: 230, protein_per_100g: 12, carbs_per_100g: 22, fat_per_100g: 11 },
    { name: 'Frites', category: 'side', visibility: 'visible', evidence: 'barquette de frites', size: 'medium', grams_low: 100, grams_mean: 130, grams_high: 170, kcal_per_100g: 300, protein_per_100g: 3, carbs_per_100g: 40, fat_per_100g: 14 },
    { name: 'Sauce blanche', category: 'sauce', visibility: 'partial', evidence: 'sauce visible sur la viande', size: 'small', grams_low: 20, grams_mean: 30, grams_high: 55, kcal_per_100g: null, protein_per_100g: null, carbs_per_100g: null, fat_per_100g: null },
    { name: 'Soda en canette', category: 'drink', visibility: 'visible', evidence: 'canette rouge 33 cl', size: 'medium', grams_low: 330, grams_mean: 330, grams_high: 330, kcal_per_100g: 42, protein_per_100g: 0, carbs_per_100g: 10.6, fat_per_100g: 0 },
  ],
  hidden_unknowns: ['quantité de sauce à l’intérieur du pain'],
  questions: [{ text: 'La boisson était-elle sucrée ou zéro ?', options: ['Sucrée', 'Zéro'] }],
  notes: '',
};

export const COUSCOUS_ANALYSIS: AiAnalysis = {
  is_food: true,
  dish_name: 'Couscous',
  confidence: 'low',
  items: [
    { name: 'Semoule de couscous', category: 'main', visibility: 'visible', evidence: 'semoule au centre de l’assiette', size: 'large', grams_low: 180, grams_mean: 250, grams_high: 320 },
    { name: 'Pois chiches', category: 'side', visibility: 'visible', evidence: 'une dizaine de pois chiches', size: 'small', grams_low: 30, grams_mean: 40, grams_high: 60 },
    { name: 'Merguez', category: 'main', visibility: 'partial', evidence: 'saucisse rouge en partie cachée', size: 'small', grams_low: 50, grams_mean: 70, grams_high: 100, kcal_per_100g: 300, protein_per_100g: 15, carbs_per_100g: 2, fat_per_100g: 26 },
    { name: 'Plat mystère', category: 'other', visibility: 'assumed', evidence: 'forme indistincte', size: 'small', grams_low: 20, grams_mean: 30, grams_high: 50 },
  ],
  hidden_unknowns: ['quantité d’huile ou de beurre dans la semoule', 'bouillon'],
  questions: [],
  notes: '',
};

/** Enveloppe une analyse comme le ferait l'API Gemini (generateContent). */
export function geminiResponse(analysis: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 600 },
  };
}
