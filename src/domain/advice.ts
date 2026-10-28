/**
 * Conseiller nutritionnel (règles transparentes, sans IA).
 * - Les observations sont calculées à partir des repas réellement enregistrés.
 * - Les alternatives sont chiffrées avec la table de référence intégrée : ce sont des
 *   ordres de grandeur, pas des valeurs de produits précis.
 * Ton : informatif et bienveillant. Aucun aliment n'est « interdit ».
 */
import type { Goals, LineItem, MealEntry } from './types';
import { lineFromFood, sumItems, type Totals } from './nutrition';
import { refFood } from './referenceFoods';
import { periodSummary } from './stats';

export interface SwapOption {
  title: string;
  ingredients: { refId: string; amount: number; label?: string }[];
  extra?: string[]; // ingrédients non chiffrés (herbes, épices…)
  steps?: string[];
}

export interface Swap {
  id: string;
  title: string;
  /** Aliments de référence qui déclenchent la suggestion quand ils pèsent lourd dans un repas. */
  triggers: string[];
  why: string;
  original: SwapOption;
  homemade: SwapOption;
  store: { lookFor: string; label: string; tips: string[] };
  tradeoffs: string[];
}

export const SWAPS: Swap[] = [
  {
    id: 'mayo-yogurt',
    title: 'Sauce plus légère pour salades et sandwichs',
    triggers: ['ref:mayonnaise'],
    why: 'La mayonnaise est très riche en lipides : 2 cuillères à soupe représentent souvent plus de calories que la salade elle-même.',
    original: { title: 'Mayonnaise (2 c. à soupe)', ingredients: [{ refId: 'mayonnaise', amount: 30 }] },
    homemade: {
      title: 'Sauce yaourt, citron et herbes (même quantité)',
      ingredients: [{ refId: 'yogurt-plain', amount: 25 }, { refId: 'lemon-juice', amount: 5 }],
      extra: ['herbes fraîches (ciboulette, persil, menthe)', 'ail, sel, poivre, cumin selon les goûts'],
      steps: ['Mélanger le yaourt et le jus de citron.', 'Ajouter herbes ciselées et épices.', 'Goûter et ajuster ; un filet d’huile d’olive (≈ 5 g, +45 kcal) apporte de la rondeur.'],
    },
    store: {
      lookFor: 'Sauce « allégée » ou sauce à base de yaourt / fromage blanc',
      label: 'Compare les kcal pour 100 g sur l’étiquette : une mayonnaise classique est autour de 700 kcal/100 g.',
      tips: ['Regarde aussi la portion réellement utilisée : une sauce allégée en grande quantité peut revenir au même.', 'Certaines versions allégées contiennent plus de sucre : vérifie la ligne « dont sucres ».'],
    },
    tradeoffs: ['Goût : plus frais et acidulé, moins onctueux.', 'Satiété : le yaourt apporte un peu de protéines.', 'Prix : très économique fait maison.', 'Praticité : 2 minutes de préparation, se garde 2 jours au frais.'],
  },
  {
    id: 'cream-light',
    title: 'Sauce crémeuse moins énergétique',
    triggers: ['ref:cream-30'],
    why: 'La crème à 30 % de matière grasse apporte beaucoup de calories pour un petit volume.',
    original: { title: 'Crème fraîche 30 % (4 c. à soupe)', ingredients: [{ refId: 'cream-30', amount: 60 }] },
    homemade: {
      title: 'Crème légère + fromage blanc (même volume)',
      ingredients: [{ refId: 'cream-15', amount: 30 }, { refId: 'fromage-blanc-0', amount: 30 }],
      extra: ['un peu d’eau de cuisson des pâtes ou de bouillon pour fluidifier'],
      steps: ['Hors du feu, mélanger la crème légère et le fromage blanc.', 'Détendre avec un peu d’eau de cuisson.', 'Incorporer au dernier moment (le fromage blanc tranche s’il bout).'],
    },
    store: {
      lookFor: 'Crème légère 15 % (ou moins) ou « spécialité végétale » cuisine',
      label: 'Vise environ deux fois moins de kcal pour 100 g que la crème entière (≈ 290 kcal/100 g).',
      tips: ['Les versions très allégées sont parfois épaissies : elles supportent moins bien la cuisson longue.'],
    },
    tradeoffs: ['Goût : légèrement plus acidulé.', 'Texture : un peu moins nappante.', 'Satiété : plus de protéines grâce au fromage blanc.'],
  },
  {
    id: 'vinaigrette',
    title: 'Vinaigrette maison allégée',
    triggers: ['ref:olive-oil', 'ref:sunflower-oil'],
    why: 'L’huile est indispensable (et bénéfique) mais très concentrée : 1 c. à soupe ≈ 120 kcal. Doser la quantité change beaucoup le total.',
    original: { title: 'Vinaigrette avec 2 c. à soupe d’huile', ingredients: [{ refId: 'olive-oil', amount: 27 }] },
    homemade: {
      title: 'Vinaigrette 1 c. à soupe d’huile + citron',
      ingredients: [{ refId: 'olive-oil', amount: 13.5 }, { refId: 'lemon-juice', amount: 15 }],
      extra: ['moutarde, vinaigre, 1 c. à soupe d’eau, herbes'],
      steps: ['Mélanger moutarde, vinaigre/citron et eau.', 'Ajouter l’huile en fouettant.', 'Bien mélanger la salade : elle en demande moins qu’on ne croit.'],
    },
    store: {
      lookFor: 'Vinaigrette « allégée » ou spray d’huile',
      label: 'Une vinaigrette classique du commerce est souvent entre 300 et 500 kcal/100 ml : regarde l’étiquette.',
      tips: ['Le spray d’huile permet d’en mettre très peu sur les légumes rôtis.'],
    },
    tradeoffs: ['Garde un peu d’huile : elle aide à absorber certaines vitamines et améliore la satiété.', 'Prix : identique, voire moins cher.'],
  },
  {
    id: 'fries-oven',
    title: 'Pommes de terre au four plutôt que frites',
    triggers: ['ref:fries'],
    why: 'La friture fait absorber beaucoup d’huile. Au four, on garde le croustillant avec une petite quantité de matière grasse.',
    original: { title: 'Frites (portion moyenne)', ingredients: [{ refId: 'fries', amount: 150 }] },
    homemade: {
      title: 'Quartiers de pommes de terre au four',
      ingredients: [{ refId: 'potato-boiled', amount: 180 }, { refId: 'olive-oil', amount: 5 }],
      extra: ['paprika, herbes de Provence, sel'],
      steps: ['Couper en quartiers, sécher.', 'Mélanger avec 1 c. à café d’huile et les épices.', 'Four 210 °C, 30 à 35 min, en retournant à mi-cuisson.'],
    },
    store: {
      lookFor: 'Frites ou potatoes « spéciales four »',
      label: 'Compare les kcal pour 100 g : elles sont souvent pré-frites, l’écart avec la friteuse est réel mais variable.',
      tips: ['La portion compte davantage que le produit choisi.'],
    },
    tradeoffs: ['Goût : moins gras, plus « rôti ».', 'Praticité : plus long qu’une friteuse.', 'Satiété : volume similaire pour moins de calories.'],
  },
  {
    id: 'soda',
    title: 'Boisson sucrée',
    triggers: ['ref:soda', 'ref:orange-juice'],
    why: 'Les calories liquides rassasient peu : une canette de soda apporte environ 35 g de sucre.',
    original: { title: 'Soda sucré (1 canette)', ingredients: [{ refId: 'soda', amount: 330 }] },
    homemade: {
      title: 'Eau pétillante + citron (+ menthe)',
      ingredients: [{ refId: 'lemon-juice', amount: 15 }],
      extra: ['330 ml d’eau pétillante', 'feuilles de menthe, rondelles de concombre'],
    },
    store: {
      lookFor: 'Version « zéro » / sans sucres ou eau aromatisée sans sucre',
      label: 'Vérifie « 0 g de sucres » sur l’étiquette.',
      tips: ['Les versions édulcorées ont un goût sucré : c’est une étape possible, pas une obligation.'],
    },
    tradeoffs: ['Goût : différent ; on s’y habitue en quelques semaines.', 'Prix : l’eau pétillante est souvent moins chère.'],
  },
  {
    id: 'protein-breakfast',
    title: 'Petit-déjeuner plus rassasiant',
    triggers: ['ref:jam', 'ref:choco-spread', 'ref:croissant'],
    why: 'Un petit-déjeuner pauvre en protéines rassasie souvent moins longtemps. Ajouter une source de protéines aide à tenir jusqu’au déjeuner.',
    original: { title: 'Tartines confiture', ingredients: [{ refId: 'bread-baguette', amount: 60 }, { refId: 'butter', amount: 10 }, { refId: 'jam', amount: 20 }] },
    homemade: {
      title: 'Tartine + skyr et fruit',
      ingredients: [{ refId: 'bread-baguette', amount: 40 }, { refId: 'jam', amount: 10 }, { refId: 'skyr', amount: 150 }, { refId: 'banana', amount: 60 }],
      extra: ['cannelle'],
    },
    store: {
      lookFor: 'Skyr, fromage blanc ou yaourt nature riche en protéines',
      label: 'Compare la ligne « protéines » pour 100 g (souvent 8 à 11 g pour un skyr).',
      tips: ['Les versions aromatisées contiennent souvent du sucre ajouté : regarde « dont sucres ».'],
    },
    tradeoffs: ['Satiété : nettement meilleure grâce aux protéines.', 'Prix : un pot de skyr coûte un peu plus que la confiture.'],
  },
  {
    id: 'pasta-veg',
    title: 'Plus de volume dans l’assiette de pâtes',
    triggers: ['ref:pasta-cooked'],
    why: 'Remplacer une partie des pâtes par des légumes garde une assiette bien remplie pour moins de calories, avec plus de fibres.',
    original: { title: 'Assiette de pâtes (250 g cuites)', ingredients: [{ refId: 'pasta-cooked', amount: 250 }] },
    homemade: {
      title: 'Pâtes + légumes poêlés (même volume)',
      ingredients: [{ refId: 'pasta-cooked', amount: 170 }, { refId: 'zucchini', amount: 120 }, { refId: 'olive-oil', amount: 4 }],
      extra: ['ail, basilic'],
    },
    store: {
      lookFor: 'Mélange de légumes surgelés « nature » (sans sauce)',
      label: 'Vérifie qu’il n’y a pas de sauce ou de matière grasse ajoutée (kcal pour 100 g < 50).',
      tips: ['Pratique pour les soirs pressés : se cuit en 8 minutes à la poêle.'],
    },
    tradeoffs: ['Satiété : volume conservé, plus de fibres.', 'Goût : dépend des légumes choisis.', 'Prix : les surgelés nature sont économiques.'],
  },
];

export function optionLines(o: SwapOption): LineItem[] {
  return o.ingredients
    .map((i, idx) => {
      const f = refFood(i.refId);
      return lineFromFood(f, { unit: f.basis, count: i.amount }, `a${idx}`);
    })
    .filter((x): x is LineItem => x != null);
}

export function optionTotals(o: SwapOption): Totals {
  return sumItems(optionLines(o));
}

export interface Insight {
  id: string;
  tone: 'positive' | 'neutral' | 'tip';
  title: string;
  text: string;
  swapId?: string;
}

/** Observations sur les 7 derniers jours enregistrés. */
export function buildInsights(meals: MealEntry[], goals: Goals | null, from: string, to: string): Insight[] {
  const out: Insight[] = [];
  const summary = periodSummary(meals, from, to);
  if (summary.loggedDays === 0) return out;
  const avg = summary.avg!;

  if (summary.loggedDays >= 5) {
    out.push({ id: 'regular', tone: 'positive', title: 'Belle régularité', text: `Tu as noté tes repas ${summary.loggedDays} jours sur ${summary.totalDays}. La régularité compte plus que la perfection.` });
  }

  if (goals?.trackMacros && goals.protein) {
    const ratio = avg.protein / goals.protein;
    if (ratio < 0.75) {
      out.push({
        id: 'protein-low', tone: 'tip', title: 'Protéines un peu basses',
        text: `Moyenne de ${Math.round(avg.protein)} g/jour pour un repère de ${goals.protein} g. Pistes simples : un yaourt/skyr, des œufs, des légumineuses (lentilles, pois chiches) ou un peu plus de viande/poisson dans un repas.`,
        swapId: 'protein-breakfast',
      });
    } else if (ratio >= 0.9) {
      out.push({ id: 'protein-ok', tone: 'positive', title: 'Protéines au rendez-vous', text: `Moyenne de ${Math.round(avg.protein)} g/jour, proche de ton repère (${goals.protein} g).` });
    }
  }

  if (goals && avg.kcal > 0) {
    const diff = avg.kcal - goals.kcal;
    if (Math.abs(diff) <= goals.kcal * 0.08) {
      out.push({ id: 'kcal-on-track', tone: 'positive', title: 'Proche de ton objectif', text: `Moyenne de ${Math.round(avg.kcal)} kcal sur les jours notés, pour un objectif de ${goals.kcal} kcal.` });
    } else {
      out.push({
        id: 'kcal-gap', tone: 'neutral', title: 'Écart avec l’objectif',
        text: `Moyenne de ${Math.round(avg.kcal)} kcal sur les jours notés (objectif ${goals.kcal} kcal). Les estimations ont leur marge d’erreur : observe la tendance du poids sur plusieurs semaines avant de changer quoi que ce soit.`,
      });
    }
  }

  // Ingrédients très énergétiques qui pèsent dans les repas : proposer une alternative (sans jugement).
  const counts = new Map<string, number>();
  for (const m of meals.filter((x) => x.date >= from && x.date <= to)) {
    const mealKcal = sumItems(m.items).kcal;
    for (const it of m.items) {
      if (!it.foodId || it.nutrients.kcal == null || mealKcal <= 0) continue;
      const swap = SWAPS.find((s) => s.triggers.includes(it.foodId!));
      if (swap && it.nutrients.kcal / mealKcal >= 0.2) counts.set(swap.id, (counts.get(swap.id) ?? 0) + 1);
    }
  }
  for (const [swapId, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    const s = SWAPS.find((x) => x.id === swapId)!;
    out.push({ id: `swap-${swapId}`, tone: 'tip', title: s.title, text: `${s.why} (repéré dans ${n} repas cette semaine). Ce n’est qu’une idée : à toi de voir si elle te convient.`, swapId });
  }
  return out;
}
