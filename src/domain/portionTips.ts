/**
 * Idées d'ajustement de portions à partir des plats HABITUELS de l'utilisateur.
 * Toujours facultatives : rien n'est modifié dans les recettes ni dans le journal.
 */
import type { GoalMode, MealEntry } from './types';
import { frequentFoods } from './stats';

export interface PortionTip { text: string; kcal: number }

export function portionTips(goal: GoalMode, remaining: number, recentMeals: MealEntry[]): PortionTip[] {
  const usual = frequentFoods(recentMeals, 5).filter((f) => f.kcal / Math.max(1, f.count) > 150);
  const top = usual[0];
  if (goal === 'gain' && remaining > 250) {
    const tips: PortionTip[] = [];
    if (top) tips.push({ text: `Une portion un peu plus grande de ton plat habituel « ${top.name} » (+25 %)`, kcal: Math.round((top.kcal / Math.max(1, top.count)) * 0.25) });
    tips.push({ text: 'Un filet d’huile d’olive ou une noisette de beurre de plus dans ton plat (1 c. à soupe)', kcal: 120 });
    tips.push({ text: 'Une collation : yaourt grec, une poignée d’amandes et une banane', kcal: 380 });
    tips.push({ text: 'Une part de féculents en plus (pain, riz, semoule)', kcal: 150 });
    return tips.filter((t) => t.kcal > 0).slice(0, 3);
  }
  if (goal === 'lose' && remaining < -150) {
    const tips: PortionTip[] = [
      { text: 'Au prochain repas, plus de légumes et un peu moins de féculents', kcal: -150 },
      { text: 'Moins de sauce ou de matière grasse ajoutée (1 c. à soupe d’huile = 120 kcal)', kcal: -120 },
    ];
    if (top) tips.unshift({ text: `Une portion un peu plus petite de « ${top.name} » (−20 %) la prochaine fois`, kcal: -Math.round((top.kcal / Math.max(1, top.count)) * 0.2) });
    return tips.slice(0, 3);
  }
  return [];
}
