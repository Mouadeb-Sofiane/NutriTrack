/**
 * Table de référence intégrée (fonctionne hors ligne).
 *
 * ⚠️ Valeurs MOYENNES INDICATIVES pour 100 g (ou 100 ml), arrondies, correspondant
 * aux ordres de grandeur publiés par les tables publiques de composition (CIQUAL/ANSES,
 * USDA FoodData Central). Glucides = glucides assimilables (hors fibres).
 * Elles ne remplacent pas l'étiquette d'un produit précis et peuvent être corrigées.
 * Les densités (g/ml) ne sont indiquées que lorsqu'elles sont raisonnablement stables.
 */
import type { Food, Precision, ServingSize } from './types';

type Row = [
  id: string,
  name: string,
  category: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  opts?: { basis?: 'g' | 'ml'; density?: number; servings?: [label: string, amount: number, precision?: Precision][]; aliases?: string },
];

// Volumes ménagers usuels (approximatifs) : c. à soupe ≈ 15 ml, c. à café ≈ 5 ml, verre ≈ 200 ml.
const ROWS: Row[] = [
  // Féculents
  ['rice-raw', 'Riz blanc cru', 'Féculents', 355, 7, 79, 0.6, { density: 0.85, servings: [['1 verre (cru)', 170, 'approx']] , aliases: 'riz basmati thai' }],
  ['rice-cooked', 'Riz blanc cuit', 'Féculents', 130, 2.7, 28, 0.3, { density: 0.8, servings: [['1 assiette moyenne', 200, 'rough'], ['1 bol', 250, 'rough']], aliases: 'riz basmati thai' }],
  ['pasta-dry', 'Pâtes sèches (crues)', 'Féculents', 360, 12.5, 72, 1.5, { servings: [['1 portion (crue)', 90, 'approx']], aliases: 'spaghetti penne coquillettes macaroni' }],
  ['pasta-cooked', 'Pâtes cuites', 'Féculents', 155, 5.5, 30, 0.9, { servings: [['1 assiette moyenne', 250, 'rough']], aliases: 'spaghetti penne nouilles' }],
  ['couscous-dry', 'Semoule de couscous (crue)', 'Féculents', 365, 12.5, 74, 1, { density: 0.7, servings: [['1 verre (crue)', 140, 'approx']], aliases: 'graine couscous' }],
  ['couscous-cooked', 'Semoule de couscous cuite', 'Féculents', 112, 3.8, 23, 0.2, { servings: [['1 assiette moyenne', 200, 'rough']] }],
  ['bulgur-cooked', 'Boulgour cuit', 'Féculents', 85, 3, 15, 0.2, { servings: [['1 assiette moyenne', 200, 'rough']] }],
  ['quinoa-cooked', 'Quinoa cuit', 'Féculents', 120, 4.4, 19, 1.9, { servings: [['1 assiette moyenne', 180, 'rough']] }],
  ['oats', "Flocons d'avoine", 'Féculents', 375, 13, 60, 7, { density: 0.4, servings: [['1 c. à soupe', 6, 'approx'], ['1 bol (portion)', 50, 'approx']] }],
  ['flour', 'Farine de blé', 'Féculents', 350, 10, 73, 1.2, { density: 0.55, servings: [['1 c. à soupe', 9, 'approx'], ['1 verre', 110, 'approx']] }],
  ['potato-boiled', "Pomme de terre cuite à l'eau", 'Féculents', 85, 1.8, 19, 0.1, { servings: [['1 pomme de terre moyenne', 150, 'approx']], aliases: 'patate vapeur' }],
  ['fries', 'Frites', 'Féculents', 300, 3.4, 39, 14, { servings: [['1 petite portion', 100, 'rough'], ['1 portion moyenne', 150, 'rough'], ['1 grande portion', 200, 'rough']] }],
  ['bread-baguette', 'Pain baguette', 'Pains', 270, 9, 55, 1.5, { servings: [['1 tranche / morceau', 30, 'approx'], ['1/4 de baguette', 62, 'approx'], ['1 baguette', 250, 'approx']], aliases: 'pain blanc' }],
  ['bread-whole', 'Pain complet', 'Pains', 245, 10, 43, 3, { servings: [['1 tranche', 35, 'approx']] }],
  ['bread-sandwich', 'Pain de mie', 'Pains', 265, 8, 48, 4, { servings: [['1 tranche', 25, 'approx']] }],
  ['lentils-dry', 'Lentilles sèches (crues)', 'Légumineuses', 350, 25, 50, 1.5, { density: 0.8, servings: [['1 verre (crues)', 160, 'approx']] }],
  ['lentils-cooked', 'Lentilles cuites', 'Légumineuses', 116, 9, 17, 0.4, { servings: [['1 assiette moyenne', 200, 'rough']] }],
  ['chickpeas-cooked', 'Pois chiches cuits', 'Légumineuses', 165, 9, 20, 2.6, { servings: [['1 c. à soupe', 15, 'approx'], ['1 petite boîte égouttée', 140, 'approx']] }],
  ['kidney-beans-cooked', 'Haricots rouges cuits', 'Légumineuses', 125, 8.7, 16, 0.5, { servings: [['1 petite boîte égouttée', 250, 'approx']] }],
  // Viandes, poissons, œufs
  ['chicken-breast-raw', 'Blanc de poulet cru', 'Viandes', 115, 23, 0, 2, { servings: [['1 filet', 130, 'approx']], aliases: 'escalope volaille dinde' }],
  ['chicken-breast-cooked', 'Blanc de poulet cuit', 'Viandes', 165, 31, 0, 3.6, { servings: [['1 filet cuit', 110, 'approx']], aliases: 'escalope volaille dinde' }],
  ['chicken-thigh-cooked', 'Cuisse de poulet cuite (avec peau)', 'Viandes', 230, 24, 0, 15, { servings: [['1 cuisse (partie comestible)', 130, 'approx']], aliases: 'pilon haut de cuisse' }],
  ['beef-minced-5', 'Bœuf haché 5 % MG (cru)', 'Viandes', 125, 21, 0, 5, { servings: [['1 steak haché', 100, 'exact']], aliases: 'steak viande hachée' }],
  ['beef-minced-15', 'Bœuf haché 15 % MG (cru)', 'Viandes', 215, 18.6, 0, 15, { servings: [['1 steak haché', 100, 'exact']], aliases: 'steak viande hachée' }],
  ['lamb-cooked', "Agneau (épaule) cuit", 'Viandes', 275, 23, 0, 20, { servings: [['1 morceau moyen', 100, 'rough']], aliases: 'mouton' }],
  ['ham', 'Jambon blanc', 'Viandes', 115, 20, 1, 3.5, { servings: [['1 tranche', 40, 'approx']] }],
  ['egg', 'Œuf entier', 'Œufs', 140, 12.5, 0.7, 9.5, { servings: [['1 œuf moyen', 50, 'approx'], ['1 gros œuf', 60, 'approx']], aliases: 'oeuf omelette' }],
  ['tuna-water', 'Thon au naturel (égoutté)', 'Poissons', 115, 25.5, 0, 1, { servings: [['1 petite boîte égouttée', 100, 'approx']] }],
  ['salmon-raw', 'Saumon cru', 'Poissons', 205, 20, 0, 13, { servings: [['1 pavé', 125, 'approx']] }],
  ['white-fish-raw', 'Poisson blanc cru (cabillaud, colin)', 'Poissons', 82, 18, 0, 0.7, { servings: [['1 filet', 130, 'approx']] }],
  ['shrimp-cooked', 'Crevettes cuites décortiquées', 'Poissons', 100, 24, 0.2, 0.3 ],
  ['tofu', 'Tofu ferme', 'Végétal', 130, 14, 2, 7.5, { servings: [['1/2 bloc', 100, 'approx']] }],
  // Produits laitiers
  ['milk-semi', 'Lait demi-écrémé', 'Produits laitiers', 46, 3.3, 4.8, 1.6, { basis: 'ml', density: 1.03, servings: [['1 verre', 200, 'approx'], ['1 bol', 300, 'approx']] }],
  ['milk-whole', 'Lait entier', 'Produits laitiers', 64, 3.2, 4.7, 3.6, { basis: 'ml', density: 1.03, servings: [['1 verre', 200, 'approx']] }],
  ['yogurt-plain', 'Yaourt nature', 'Produits laitiers', 55, 4.2, 5.5, 1.5, { servings: [['1 pot', 125, 'exact'], ['1 c. à soupe', 15, 'approx']] }],
  ['yogurt-greek', 'Yaourt à la grecque (type 10 % MG)', 'Produits laitiers', 125, 4, 4, 10, { servings: [['1 pot', 150, 'exact'], ['1 c. à soupe', 15, 'approx']] }],
  ['skyr', 'Skyr nature', 'Produits laitiers', 60, 10, 4, 0.2, { servings: [['1 pot', 150, 'exact']] }],
  ['fromage-blanc-0', 'Fromage blanc 0 %', 'Produits laitiers', 45, 7.5, 4, 0.1, { servings: [['1 c. à soupe', 20, 'approx'], ['1 pot', 100, 'exact']] }],
  ['fromage-blanc-3', 'Fromage blanc 3 %', 'Produits laitiers', 75, 7, 4, 3, { servings: [['1 c. à soupe', 20, 'approx']] }],
  ['emmental', 'Emmental (râpé ou en morceau)', 'Fromages', 380, 28, 0, 29, { servings: [['1 poignée de râpé', 15, 'rough'], ['1 portion', 30, 'approx']], aliases: 'gruyère fromage râpé' }],
  ['comte', 'Comté', 'Fromages', 410, 27, 0, 34, { servings: [['1 portion', 30, 'approx']] }],
  ['mozzarella', 'Mozzarella', 'Fromages', 245, 18, 1, 19, { servings: [['1 boule', 125, 'exact']] }],
  ['feta', 'Feta', 'Fromages', 265, 14, 4, 21, { servings: [['1 portion', 30, 'approx']] }],
  ['parmesan', 'Parmesan', 'Fromages', 395, 33, 0, 29, { servings: [['1 c. à soupe râpé', 6, 'approx']] }],
  ['cream-30', 'Crème fraîche épaisse 30 %', 'Matières grasses', 290, 2.3, 3, 30, { density: 1.0, servings: [['1 c. à soupe', 15, 'approx']] }],
  ['cream-15', 'Crème légère 15 %', 'Matières grasses', 165, 2.7, 4, 15, { density: 1.0, servings: [['1 c. à soupe', 15, 'approx']] }],
  ['coconut-milk', 'Lait de coco (conserve)', 'Matières grasses', 190, 1.8, 3, 19, { basis: 'ml', density: 1.0, servings: [['1 c. à soupe', 15, 'approx'], ['1 petite brique', 200, 'exact']] }],
  // Matières grasses & sauces
  ['olive-oil', "Huile d'olive", 'Matières grasses', 900, 0, 0, 100, { density: 0.91, servings: [['1 c. à café', 4.5, 'approx'], ['1 c. à soupe', 13.5, 'approx'], ['1 filet', 5, 'rough']] }],
  ['sunflower-oil', 'Huile de tournesol / colza', 'Matières grasses', 900, 0, 0, 100, { density: 0.92, servings: [['1 c. à café', 4.5, 'approx'], ['1 c. à soupe', 13.5, 'approx']], aliases: 'huile végétale friture' }],
  ['butter', 'Beurre', 'Matières grasses', 745, 0.7, 0.6, 82, { servings: [['1 noisette', 5, 'rough'], ['1 portion individuelle', 10, 'exact'], ['1 c. à soupe', 14, 'approx']] }],
  ['mayonnaise', 'Mayonnaise', 'Sauces', 700, 1.2, 1.5, 76, { servings: [['1 c. à café', 5, 'approx'], ['1 c. à soupe', 15, 'approx']] }],
  ['ketchup', 'Ketchup', 'Sauces', 110, 1.2, 25, 0.2, { servings: [['1 c. à soupe', 15, 'approx']] }],
  ['tomato-coulis', 'Coulis / purée de tomate', 'Sauces', 35, 1.6, 5.5, 0.3, { servings: [['1 louche', 100, 'rough']], aliases: 'sauce tomate passata' }],
  ['tomato-paste', 'Concentré de tomate', 'Sauces', 82, 4.3, 15, 0.5, { servings: [['1 c. à soupe', 16, 'approx']] }],
  ['lemon-juice', 'Jus de citron', 'Sauces', 22, 0.4, 7, 0.2, { basis: 'ml', density: 1.03, servings: [['1 c. à soupe', 15, 'approx']] }],
  // Légumes
  ['tomato', 'Tomate', 'Légumes', 18, 0.9, 3, 0.2, { servings: [['1 tomate moyenne', 120, 'approx']] }],
  ['carrot', 'Carotte', 'Légumes', 36, 0.8, 7, 0.2, { servings: [['1 carotte moyenne', 80, 'approx']] }],
  ['onion', 'Oignon', 'Légumes', 38, 1.1, 7.5, 0.1, { servings: [['1 oignon moyen', 100, 'approx']] }],
  ['zucchini', 'Courgette', 'Légumes', 17, 1.2, 2.2, 0.3, { servings: [['1 courgette moyenne', 200, 'approx']] }],
  ['bell-pepper', 'Poivron', 'Légumes', 28, 1, 5, 0.3, { servings: [['1 poivron', 150, 'approx']] }],
  ['eggplant', 'Aubergine', 'Légumes', 22, 1, 3, 0.2, { servings: [['1 aubergine', 250, 'approx']] }],
  ['lettuce', 'Salade verte', 'Légumes', 15, 1.3, 1.5, 0.2, { servings: [['1 bol de salade', 50, 'rough']], aliases: 'laitue' }],
  ['cucumber', 'Concombre', 'Légumes', 13, 0.6, 2.5, 0.1, { servings: [['1/2 concombre', 150, 'approx']] }],
  ['broccoli', 'Brocoli', 'Légumes', 30, 2.8, 4, 0.4 ],
  ['green-beans', 'Haricots verts', 'Légumes', 28, 1.8, 4.3, 0.2 ],
  ['mushroom', 'Champignons de Paris', 'Légumes', 22, 3, 2.3, 0.3 ],
  ['spinach', 'Épinards', 'Légumes', 23, 2.9, 1.4, 0.4 ],
  ['cauliflower', 'Chou-fleur', 'Légumes', 25, 1.9, 3, 0.3 ],
  ['peas', 'Petits pois', 'Légumes', 75, 5.4, 9, 0.4 ],
  ['corn', 'Maïs doux (égoutté)', 'Légumes', 80, 2.5, 15, 1.2, { servings: [['1 c. à soupe', 15, 'approx']] }],
  ['avocado', 'Avocat', 'Légumes', 160, 2, 1.8, 14.7, { servings: [['1/2 avocat', 70, 'approx']] }],
  ['mixed-veg', 'Légumes variés (moyenne)', 'Légumes', 30, 1.5, 4.5, 0.3, { servings: [['1 assiette', 200, 'rough']], aliases: 'légumes poêlée' }],
  // Fruits
  ['apple', 'Pomme', 'Fruits', 52, 0.3, 12, 0.2, { servings: [['1 pomme moyenne', 150, 'approx']] }],
  ['banana', 'Banane', 'Fruits', 89, 1.1, 20, 0.3, { servings: [['1 banane moyenne (épluchée)', 120, 'approx']] }],
  ['orange', 'Orange', 'Fruits', 47, 0.9, 9.5, 0.1, { servings: [['1 orange moyenne (épluchée)', 150, 'approx']] }],
  ['strawberry', 'Fraises', 'Fruits', 32, 0.7, 5.7, 0.3 ],
  ['grapes', 'Raisin', 'Fruits', 69, 0.7, 17, 0.2 ],
  ['dates', 'Dattes sèches', 'Fruits', 280, 2.5, 66, 0.4, { servings: [['1 datte (sans noyau)', 8, 'approx']] }],
  // Fruits à coque
  ['almonds', 'Amandes', 'Fruits à coque', 580, 21, 9, 50, { servings: [['1 poignée', 25, 'rough']] }],
  ['peanuts', 'Cacahuètes', 'Fruits à coque', 570, 25, 8, 49, { servings: [['1 poignée', 25, 'rough']] }],
  ['walnuts', 'Noix', 'Fruits à coque', 655, 15, 7, 65, { servings: [['1 poignée', 25, 'rough']] }],
  ['peanut-butter', 'Beurre de cacahuète', 'Fruits à coque', 590, 24, 13, 50, { servings: [['1 c. à soupe', 16, 'approx']] }],
  // Sucré
  ['sugar', 'Sucre', 'Sucré', 400, 0, 100, 0, { density: 0.85, servings: [['1 morceau', 5, 'approx'], ['1 c. à café', 5, 'approx'], ['1 c. à soupe', 13, 'approx']] }],
  ['honey', 'Miel', 'Sucré', 305, 0.3, 82, 0, { density: 1.4, servings: [['1 c. à café', 7, 'approx'], ['1 c. à soupe', 21, 'approx']] }],
  ['jam', 'Confiture', 'Sucré', 250, 0.4, 60, 0.1, { servings: [['1 c. à café', 8, 'approx'], ['1 c. à soupe', 20, 'approx']] }],
  ['choco-spread', 'Pâte à tartiner cacao-noisette', 'Sucré', 540, 6, 57, 31, { servings: [['1 c. à café', 8, 'approx'], ['1 c. à soupe', 20, 'approx']] }],
  ['dark-chocolate', 'Chocolat noir 70 %', 'Sucré', 580, 8, 34, 43, { servings: [['1 carré', 5, 'approx']] }],
  ['croissant', 'Croissant', 'Sucré', 410, 8, 45, 21, { servings: [['1 croissant', 60, 'approx']] }],
  ['biscuits', 'Biscuits secs (type petit-beurre)', 'Sucré', 440, 7.5, 73, 12, { servings: [['1 biscuit', 8, 'approx']] }],
  // Boissons (pour 100 ml)
  ['orange-juice', "Jus d'orange", 'Boissons', 45, 0.7, 10, 0.2, { basis: 'ml', servings: [['1 verre', 200, 'approx']] }],
  ['soda', 'Soda sucré (type cola)', 'Boissons', 42, 0, 10.6, 0, { basis: 'ml', servings: [['1 canette', 330, 'exact'], ['1 verre', 200, 'approx']] }],
  ['soda-zero', 'Soda sans sucres (édulcoré)', 'Boissons', 1, 0, 0, 0, { basis: 'ml', servings: [['1 canette', 330, 'exact']] }],
  ['coffee', 'Café noir', 'Boissons', 2, 0.1, 0, 0, { basis: 'ml', servings: [['1 tasse', 120, 'approx']] }],
  ['tea', 'Thé (sans sucre)', 'Boissons', 1, 0, 0.2, 0, { basis: 'ml', servings: [['1 tasse', 200, 'approx']] }],
  ['beer', 'Bière (5 % vol.)', 'Boissons', 43, 0.5, 3.5, 0, { basis: 'ml', servings: [['1 demi (25 cl)', 250, 'exact'], ['1 bouteille 33 cl', 330, 'exact']] }],
  ['wine-red', 'Vin rouge (12,5 % vol.)', 'Boissons', 85, 0.1, 2.6, 0, { basis: 'ml', servings: [['1 verre (12,5 cl)', 125, 'approx']] }],
  // Plats très variables : à utiliser comme ordre de grandeur
  ['pizza-margherita', 'Pizza margherita (moyenne)', 'Plats préparés', 250, 10, 30, 9, { servings: [['1 part (1/8)', 60, 'rough'], ['1 pizza individuelle', 450, 'rough']] }],
];

export const REFERENCE_SOURCE = {
  kind: 'reference' as const,
  label: 'Valeur moyenne indicative (ordre de grandeur CIQUAL/USDA)',
};

const EPOCH = '2026-01-01T00:00:00.000Z';

export const REFERENCE_FOODS: Food[] = ROWS.map(([id, name, category, kcal, protein, carbs, fat, opts]) => {
  const servings: ServingSize[] = (opts?.servings ?? []).map(([label, amount, precision], i) => ({
    id: `s${i}`,
    label,
    amount,
    precision: precision ?? 'approx',
  }));
  return {
    id: `ref:${id}`,
    name,
    category,
    basis: opts?.basis ?? 'g',
    per100: { kcal, protein, carbs, fat },
    density: opts?.density,
    servings,
    source: REFERENCE_SOURCE,
    favorite: false,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    // champ de recherche supplémentaire non persistant
    ...(opts?.aliases ? { aliases: opts.aliases } : {}),
  } as Food;
});

const BY_ID = new Map(REFERENCE_FOODS.map((f) => [f.id, f]));

export function getReferenceFood(id: string): Food | undefined {
  return BY_ID.get(id.startsWith('ref:') ? id : `ref:${id}`);
}

export function refFood(id: string): Food {
  const f = getReferenceFood(id);
  if (!f) throw new Error(`Aliment de référence inconnu : ${id}`);
  return f;
}

/** Normalise un texte pour la recherche (minuscules, sans accents, œ → oe). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Recherche simple par mots : tous les mots de la requête doivent apparaître. */
export function searchFoods(foods: Food[], query: string, limit = 30): Food[] {
  const q = normalize(query);
  if (!q) return foods.slice(0, limit);
  const words = q.split(' ');
  const scored: { f: Food; score: number }[] = [];
  for (const f of foods) {
    const hay = normalize(`${f.name} ${f.brand ?? ''} ${(f as Food & { aliases?: string }).aliases ?? ''} ${f.category ?? ''}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const name = normalize(f.name);
    let score = 0;
    if (name.startsWith(q)) score += 3;
    if (name.includes(q)) score += 2;
    if (f.favorite) score += 1;
    score -= name.length / 100;
    scored.push({ f, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.f);
}
