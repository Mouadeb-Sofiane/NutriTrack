/**
 * Catalogue d'aliments « difficiles à peser » : grignotages, fête foraine, street food,
 * fast-food, sauces, boissons, pâtisseries.
 *
 * Pour chaque aliment :
 * - une composition moyenne pour 100 g (ou 100 ml) — ordre de grandeur des tables publiques
 *   (CIQUAL/USDA) et des étiquettes courantes, arrondi ;
 * - éventuellement une composition « plus riche » plausible (friture plus grasse, sauce
 *   généreuse…) utilisée UNIQUEMENT par le scénario haut, avec son explication ;
 * - des portions décrites par trois hypothèses explicites : basse, moyenne, haute.
 * Aucune valeur n'est universelle : ce sont des repères modifiables, affichés comme estimations.
 */
import type { EstimateInfo, LineItem, Nutrients } from './types';
import { NUTRIENT_KEYS } from './types';
import { cleanNutrients, isValidNumber, scalePer100 } from './nutrition';
import { withEstimate, addNutrients } from './estimates';
import { normalize } from './referenceFoods';

export type CatalogGroup = 'snack' | 'fair' | 'fastfood' | 'world' | 'dessert' | 'sauce' | 'drink' | 'extra';
export type CatalogRole = 'main' | 'side' | 'sauce' | 'drink' | 'extra' | 'snack';

export interface CatalogPortion {
  id: string;
  label: string;
  /** Quantités (g ou ml) : hypothèses basse, moyenne, haute. Pour une pièce : par pièce. */
  low: number;
  mean: number;
  high: number;
  /** Portion comptable (pièces, carrés, boules…) : la quantité est multipliée par le nombre. */
  piece?: boolean;
}

export interface CatalogEntry {
  id: string;
  name: string;
  group: CatalogGroup;
  role: CatalogRole;
  emoji: string;
  /** Expressions reconnues dans la saisie libre, séparées par des virgules. */
  aliases: string;
  basis: 'g' | 'ml';
  per100: Nutrients;
  rich?: { per100: Nutrients; label: string };
  /** Garniture/sauce incluse dans le produit, dont la quantité varie. */
  topping?: { label: string; per100: Nutrients; mean: number; high: number };
  portions: CatalogPortion[];
  defaultPortion: string;
  /** Nombre de pièces par défaut quand rien n'est précisé (ex. « du chocolat » → quelques carrés). */
  defaultCount?: { low: number; mean: number; high: number };
  /** Ce qui reste inconnu : mis en avant pour l'estimation haute. */
  unknown?: string;
}

const N = (kcal: number, protein: number, carbs: number, fat: number): Nutrients => ({ kcal, protein, carbs, fat });
const P = (id: string, label: string, low: number, mean: number, high: number, piece = false): CatalogPortion => ({ id, label, low, mean, high, piece });

export const CATALOG: CatalogEntry[] = [
  // ——— Grignotages ———
  { id: 'chips', name: 'Chips', group: 'snack', role: 'snack', emoji: '🥔', aliases: 'chips, chip, crisps', basis: 'g', per100: N(535, 6, 50, 34),
    portions: [P('handful', 'Une poignée', 15, 25, 35), P('small-bag', 'Petit sachet individuel', 25, 30, 45), P('bowl', 'Un bol', 40, 60, 90), P('shared-bag', 'Grand paquet partagé (ma part)', 50, 75, 120), P('big-bag', 'Grand paquet entier', 125, 150, 200)],
    defaultPortion: 'handful', unknown: 'La quantité réellement mangée dans un bol ou un paquet partagé est difficile à évaluer.' },
  { id: 'popcorn-salty', name: 'Pop-corn salé', group: 'snack', role: 'snack', emoji: '🍿', aliases: 'pop corn sale, popcorn sale, pop corn, popcorn', basis: 'g', per100: N(500, 9, 55, 27),
    portions: [P('handful', 'Une poignée', 8, 12, 18), P('small', 'Petit cornet / sachet', 30, 45, 60), P('medium', 'Pot moyen (cinéma)', 60, 85, 110), P('large', 'Grand seau (ma part)', 100, 140, 200)],
    defaultPortion: 'small', unknown: 'La taille des pots varie beaucoup selon le cinéma ou le stand.' },
  { id: 'popcorn-sweet', name: 'Pop-corn sucré / caramel', group: 'fair', role: 'snack', emoji: '🍿', aliases: 'pop corn sucre, popcorn sucre, pop corn caramel, popcorn caramel, pop corn au caramel', basis: 'g', per100: N(470, 6, 70, 18),
    portions: [P('handful', 'Une poignée', 8, 12, 18), P('small', 'Petit cornet / sachet', 35, 50, 70), P('medium', 'Pot moyen', 70, 95, 120), P('large', 'Grand seau (ma part)', 110, 150, 210)],
    defaultPortion: 'small', unknown: 'La taille du cornet et la quantité de caramel varient selon le stand.' },
  { id: 'biscuits-choco', name: 'Biscuits chocolatés / fourrés', group: 'snack', role: 'snack', emoji: '🍪', aliases: 'biscuit, biscuits, gateau sec, gateaux secs, petit beurre, sable, sables, prince, oreo', basis: 'g', per100: N(490, 6, 62, 24),
    portions: [P('piece', 'Biscuit (pièce)', 8, 10, 13, true), P('pack', 'Sachet individuel', 25, 30, 40)],
    defaultPortion: 'piece', defaultCount: { low: 2, mean: 3, high: 5 } },
  { id: 'cookie', name: 'Cookie de boulangerie', group: 'snack', role: 'snack', emoji: '🍪', aliases: 'cookie, cookies', basis: 'g', per100: N(490, 6, 62, 24),
    portions: [P('piece', 'Cookie (pièce)', 50, 70, 90, true)], defaultPortion: 'piece' },
  { id: 'candies', name: 'Bonbons', group: 'snack', role: 'snack', emoji: '🍬', aliases: 'bonbon, bonbons, haribo, sucette, sucettes, dragibus, fraises tagada', basis: 'g', per100: N(345, 3, 82, 0.5),
    portions: [P('piece', 'Bonbon (pièce)', 4, 5, 7, true), P('handful', 'Une poignée', 20, 30, 45), P('bag', 'Sachet', 80, 100, 150)],
    defaultPortion: 'piece', defaultCount: { low: 3, mean: 5, high: 8 } },
  { id: 'chocolate', name: 'Chocolat (tablette)', group: 'snack', role: 'snack', emoji: '🍫', aliases: 'chocolat, chocolat au lait, carre de chocolat, carres de chocolat, tablette', basis: 'g', per100: N(540, 7, 57, 31),
    portions: [P('square', 'Carré', 4, 5, 6, true), P('row', 'Une rangée', 20, 25, 30), P('bar', 'Tablette entière (100 g)', 100, 100, 100)],
    defaultPortion: 'square', defaultCount: { low: 2, mean: 3, high: 5 } },
  { id: 'candy-bar', name: 'Barre chocolatée', group: 'snack', role: 'snack', emoji: '🍫', aliases: 'barre chocolatee, barre chocolatees, mars, snickers, twix, kitkat, kit kat, bounty, lion', basis: 'g', per100: N(480, 5, 62, 23),
    portions: [P('piece', 'Barre (pièce)', 40, 50, 58, true), P('mini', 'Mini barre', 15, 18, 22, true)], defaultPortion: 'piece' },
  { id: 'peanuts', name: 'Cacahuètes grillées salées', group: 'snack', role: 'snack', emoji: '🥜', aliases: 'cacahuete, cacahuetes, arachides, noix de cajou, pistaches, amandes grillees, apero', basis: 'g', per100: N(600, 25, 10, 50),
    portions: [P('handful', 'Une poignée', 20, 30, 45), P('bowl', 'Un petit bol', 40, 60, 90)], defaultPortion: 'handful' },
  { id: 'cake-slice', name: 'Gâteau (part)', group: 'dessert', role: 'snack', emoji: '🍰', aliases: 'gateau, gateaux, part de gateau, morceau de gateau, cake, tarte, fondant, brownie, gateau au chocolat, gateau d anniversaire', basis: 'g', per100: N(400, 5, 50, 20),
    rich: { per100: N(450, 5, 52, 25), label: 'Gâteau plus riche (crème, glaçage, chocolat)' },
    portions: [P('small', 'Petit morceau', 30, 45, 60), P('slice', 'Part normale', 60, 90, 130), P('big', 'Grosse part', 120, 150, 200)], defaultPortion: 'slice',
    unknown: 'La recette (beurre, crème, glaçage) change beaucoup les calories.' },
  { id: 'croissant', name: 'Croissant', group: 'snack', role: 'snack', emoji: '🥐', aliases: 'croissant, croissants, viennoiserie, viennoiseries', basis: 'g', per100: N(410, 8, 45, 21),
    portions: [P('piece', 'Croissant (pièce)', 45, 60, 75, true)], defaultPortion: 'piece' },
  { id: 'pain-choc', name: 'Pain au chocolat', group: 'snack', role: 'snack', emoji: '🥐', aliases: 'pain au chocolat, pains au chocolat, chocolatine, chocolatines', basis: 'g', per100: N(420, 7, 46, 22),
    portions: [P('piece', 'Pièce', 55, 70, 85, true)], defaultPortion: 'piece' },
  { id: 'ice-cream', name: 'Glace', group: 'dessert', role: 'snack', emoji: '🍦', aliases: 'glace, glaces, creme glacee, sorbet, cornet de glace, boule de glace, boules de glace, magnum', basis: 'g', per100: N(200, 3.5, 24, 10),
    rich: { per100: N(250, 4, 24, 15), label: 'Glace plus riche (crème, enrobage chocolat)' },
    portions: [P('scoop', 'Boule', 40, 55, 75, true), P('stick', 'Bâtonnet / cône individuel', 60, 75, 100, true), P('tub', 'Pot individuel', 80, 100, 130)], defaultPortion: 'scoop',
    defaultCount: { low: 1, mean: 2, high: 2 } },
  { id: 'oriental-pastry', name: 'Pâtisserie orientale', group: 'world', role: 'snack', emoji: '🍯', aliases: 'patisserie orientale, patisseries orientales, baklava, baklawa, makrout, griwech, zlabia, chebakia, cornes de gazelle, kalb el louz, basboussa, kunafa, knafeh', basis: 'g', per100: N(430, 6, 50, 23),
    rich: { per100: N(470, 6, 56, 25), label: 'Plus de miel / sirop et d’amandes' },
    portions: [P('piece', 'Pièce', 25, 35, 50, true)], defaultPortion: 'piece', defaultCount: { low: 1, mean: 2, high: 3 },
    unknown: 'La quantité de miel ou de sirop absorbée varie beaucoup.' },
  // ——— Fête foraine & street food sucrée ———
  { id: 'churros', name: 'Churros', group: 'fair', role: 'snack', emoji: '🥖', aliases: 'churros, churro, chichi, chichis', basis: 'g', per100: N(410, 5, 47, 22),
    rich: { per100: N(460, 5, 47, 27.5), label: 'Friture plus grasse (huile absorbée)' },
    portions: [P('piece', 'Churros (pièce)', 20, 30, 45, true), P('cone', 'Cornet', 130, 180, 250)], defaultPortion: 'piece', defaultCount: { low: 3, mean: 4, high: 6 },
    unknown: 'La taille des churros, l’huile de friture et le sucre ajouté sont inconnus.' },
  { id: 'cotton-candy', name: 'Barbe à papa', group: 'fair', role: 'snack', emoji: '🍭', aliases: 'barbe a papa', basis: 'g', per100: N(390, 0, 98, 0),
    portions: [P('stick', 'Un bâton', 25, 35, 60, true)], defaultPortion: 'stick' },
  { id: 'crepe-sugar', name: 'Crêpe au sucre', group: 'fair', role: 'snack', emoji: '🥞', aliases: 'crepe au sucre, crepe sucre, crepe, crepes', basis: 'g', per100: N(220, 6, 30, 8),
    topping: { label: 'Sucre et beurre', per100: N(560, 0, 60, 35), mean: 12, high: 25 },
    portions: [P('piece', 'Crêpe (pièce)', 50, 65, 80, true)], defaultPortion: 'piece', unknown: 'La quantité de sucre et de beurre ajoutée varie selon le stand.' },
  { id: 'crepe-spread', name: 'Crêpe pâte à tartiner', group: 'fair', role: 'snack', emoji: '🥞', aliases: 'crepe nutella, crepe au nutella, crepe chocolat, crepe pate a tartiner', basis: 'g', per100: N(220, 6, 30, 8),
    topping: { label: 'Pâte à tartiner', per100: N(540, 6, 57, 31), mean: 25, high: 45 },
    portions: [P('piece', 'Crêpe (pièce)', 50, 65, 80, true)], defaultPortion: 'piece', unknown: 'La quantité de pâte à tartiner est rarement connue.' },
  { id: 'waffle', name: 'Gaufre', group: 'fair', role: 'snack', emoji: '🧇', aliases: 'gaufre, gaufres', basis: 'g', per100: N(360, 7, 45, 17),
    rich: { per100: N(430, 6, 52, 22), label: 'Gaufre plus riche (type Liège, sucre perlé)' },
    portions: [P('piece', 'Gaufre (pièce)', 70, 90, 120, true)], defaultPortion: 'piece', unknown: 'Le type de gaufre et sa taille varient.' },
  { id: 'donut', name: 'Beignet / donut', group: 'fair', role: 'snack', emoji: '🍩', aliases: 'beignet, beignets, donut, donuts, berlinois, sfenj, khfaf', basis: 'g', per100: N(400, 6, 48, 20),
    rich: { per100: N(440, 6, 50, 24), label: 'Friture plus grasse ou garniture' },
    portions: [P('piece', 'Pièce', 50, 70, 90, true)], defaultPortion: 'piece' },
  { id: 'chantilly', name: 'Chantilly', group: 'extra', role: 'extra', emoji: '🍨', aliases: 'chantilly, creme chantilly', basis: 'g', per100: N(290, 2, 12, 26),
    portions: [P('portion', 'Portion', 15, 25, 45)], defaultPortion: 'portion' },
  { id: 'spread-topping', name: 'Nappage chocolat / pâte à tartiner', group: 'extra', role: 'extra', emoji: '🍫', aliases: 'nappage chocolat, sauce chocolat, nutella, pate a tartiner', basis: 'g', per100: N(540, 6, 57, 31),
    portions: [P('portion', 'Portion', 10, 20, 40)], defaultPortion: 'portion' },
  // ——— Fast-food & street food salée ———
  { id: 'kebab', name: 'Kebab (sandwich, sauce comprise)', group: 'fastfood', role: 'main', emoji: '🥙', aliases: 'kebab, kebabs, doner, durum, sandwich grec, grec, shawarma, chawarma', basis: 'g', per100: N(225, 12, 22, 10),
    rich: { per100: N(255, 12, 22, 13.5), label: 'Plus de sauce ou viande plus grasse' },
    portions: [P('piece', 'Sandwich (pièce)', 270, 320, 400, true)], defaultPortion: 'piece', unknown: 'La quantité de sauce et de viande varie beaucoup d’un kebab à l’autre.' },
  { id: 'kebab-plate', name: 'Assiette kebab (viande, frites, salade)', group: 'fastfood', role: 'main', emoji: '🍽️', aliases: 'assiette kebab, assiette grec, assiette shawarma', basis: 'g', per100: N(200, 11, 17, 10),
    rich: { per100: N(225, 11, 17, 12.8), label: 'Plus de sauce et de frites' },
    portions: [P('plate', 'Assiette', 400, 500, 600, true)], defaultPortion: 'plate', unknown: 'La part de frites et de sauce dans l’assiette est inconnue.' },
  { id: 'burger', name: 'Burger', group: 'fastfood', role: 'main', emoji: '🍔', aliases: 'burger, burgers, hamburger, cheeseburger, big mac, whopper', basis: 'g', per100: N(250, 13, 25, 11),
    rich: { per100: N(280, 13, 25, 14.5), label: 'Sauce et fromage plus généreux' },
    portions: [P('small', 'Petit (type cheeseburger)', 100, 120, 140, true), P('standard', 'Burger standard', 180, 220, 260, true), P('big', 'Gros burger / double', 260, 320, 400, true)],
    defaultPortion: 'standard' },
  { id: 'french-tacos', name: 'Tacos (french tacos)', group: 'fastfood', role: 'main', emoji: '🌯', aliases: 'tacos, french tacos, o tacos', basis: 'g', per100: N(250, 10, 24, 13),
    rich: { per100: N(280, 10, 24, 16), label: 'Sauce fromagère plus généreuse' },
    portions: [P('m', 'Taille M', 300, 380, 450, true), P('l', 'Taille L', 450, 550, 650, true), P('xl', 'Taille XL', 600, 750, 900, true)], defaultPortion: 'm',
    unknown: 'Les frites et la sauce fromagère à l’intérieur sont très variables.' },
  { id: 'taco-mex', name: 'Taco mexicain (pièce)', group: 'world', role: 'main', emoji: '🌮', aliases: 'taco mexicain, tacos mexicains, taco', basis: 'g', per100: N(220, 11, 20, 10.5),
    portions: [P('piece', 'Pièce', 70, 90, 120, true)], defaultPortion: 'piece', defaultCount: { low: 2, mean: 3, high: 3 } },
  { id: 'hot-dog', name: 'Hot-dog', group: 'fastfood', role: 'main', emoji: '🌭', aliases: 'hot dog, hotdog, hot dogs', basis: 'g', per100: N(260, 10, 25, 14),
    portions: [P('piece', 'Pièce', 120, 150, 190, true)], defaultPortion: 'piece' },
  { id: 'sandwich', name: 'Sandwich baguette', group: 'fastfood', role: 'main', emoji: '🥖', aliases: 'sandwich, sandwichs, jambon beurre, sandwich poulet, sandwich thon', basis: 'g', per100: N(250, 11, 30, 9),
    rich: { per100: N(280, 11, 30, 12.5), label: 'Beurre ou mayonnaise généreux' },
    portions: [P('half', 'Demi-baguette', 150, 190, 230, true), P('third', 'Tiers de baguette', 100, 130, 160, true)], defaultPortion: 'half' },
  { id: 'panini', name: 'Panini', group: 'fastfood', role: 'main', emoji: '🥪', aliases: 'panini, paninis, croque monsieur, croque', basis: 'g', per100: N(260, 11, 30, 10),
    portions: [P('piece', 'Pièce', 150, 180, 220, true)], defaultPortion: 'piece' },
  { id: 'pizza', name: 'Pizza', group: 'fastfood', role: 'main', emoji: '🍕', aliases: 'pizza, pizzas, part de pizza, parts de pizza', basis: 'g', per100: N(250, 10, 30, 9),
    rich: { per100: N(280, 11, 30, 12.5), label: 'Garniture plus riche (fromage, charcuterie)' },
    portions: [P('slice', 'Part (1/8)', 80, 110, 150, true), P('individual', 'Pizza individuelle', 350, 450, 550, true), P('half', 'Moitié de grande pizza', 300, 380, 480, true)],
    defaultPortion: 'individual', unknown: 'La garniture et la taille de la pizza sont variables.' },
  { id: 'nuggets', name: 'Nuggets', group: 'fastfood', role: 'main', emoji: '🍗', aliases: 'nugget, nuggets, tenders, chicken nuggets', basis: 'g', per100: N(280, 15, 17, 17),
    portions: [P('piece', 'Pièce', 16, 18, 22, true)], defaultPortion: 'piece', defaultCount: { low: 6, mean: 6, high: 9 } },
  { id: 'sushi', name: 'Sushi / maki (pièce)', group: 'world', role: 'main', emoji: '🍣', aliases: 'sushi, sushis, maki, makis, california, californias', basis: 'g', per100: N(150, 6, 28, 1.5),
    portions: [P('piece', 'Pièce', 20, 25, 35, true)], defaultPortion: 'piece', defaultCount: { low: 6, mean: 8, high: 12 } },
  { id: 'fries', name: 'Frites', group: 'fastfood', role: 'side', emoji: '🍟', aliases: 'frite, frites, fries', basis: 'g', per100: N(300, 3.4, 39, 14),
    rich: { per100: N(330, 3.4, 39, 17.5), label: 'Friture plus grasse' },
    portions: [P('small', 'Petite portion', 70, 90, 120), P('medium', 'Portion moyenne', 100, 130, 170), P('large', 'Grande portion', 140, 170, 230), P('tray', 'Barquette de stand', 150, 200, 300)],
    defaultPortion: 'medium', unknown: 'La taille réelle de la portion et l’huile de friture sont inconnues.' },
  { id: 'cheese-extra', name: 'Supplément fromage (tranche)', group: 'extra', role: 'extra', emoji: '🧀', aliases: 'supplement fromage, fromage en plus, cheddar', basis: 'g', per100: N(400, 25, 1, 33),
    portions: [P('slice', 'Tranche', 15, 20, 25, true)], defaultPortion: 'slice' },
  // ——— Sauces ———
  { id: 'mayo-sachet', name: 'Mayonnaise', group: 'sauce', role: 'sauce', emoji: '🥫', aliases: 'mayo, mayonnaise', basis: 'g', per100: N(700, 1.2, 1.5, 76),
    portions: [P('sachet', 'Sachet / dose', 15, 20, 30, true)], defaultPortion: 'sachet' },
  { id: 'ketchup-sachet', name: 'Ketchup', group: 'sauce', role: 'sauce', emoji: '🍅', aliases: 'ketchup', basis: 'g', per100: N(110, 1.2, 25, 0.2),
    portions: [P('sachet', 'Sachet / dose', 10, 15, 25, true)], defaultPortion: 'sachet' },
  { id: 'white-sauce', name: 'Sauce blanche', group: 'sauce', role: 'sauce', emoji: '🥛', aliases: 'sauce blanche', basis: 'g', per100: N(300, 2, 6, 30),
    portions: [P('dose', 'Dose / pot', 20, 30, 50, true)], defaultPortion: 'dose' },
  { id: 'rich-sauce', name: 'Sauce algérienne / samouraï / andalouse', group: 'sauce', role: 'sauce', emoji: '🌶️', aliases: 'sauce algerienne, algerienne, samourai, sauce samourai, andalouse, biggy, sauce burger, sauce barbecue, bbq, harissa mayo', basis: 'g', per100: N(480, 1, 8, 49),
    portions: [P('dose', 'Dose / pot', 20, 30, 50, true)], defaultPortion: 'dose' },
  // ——— Boissons ———
  { id: 'soda', name: 'Soda sucré', group: 'drink', role: 'drink', emoji: '🥤', aliases: 'soda, sodas, coca, coca cola, cola, fanta, sprite, oasis, ice tea, limonade, orangina, boisson gazeuse', basis: 'ml', per100: N(42, 0, 10.6, 0),
    portions: [P('can', 'Canette 33 cl', 330, 330, 330, true), P('small', 'Petit gobelet', 250, 300, 400, true), P('medium', 'Gobelet moyen', 400, 450, 500, true), P('large', 'Grand gobelet', 500, 600, 750, true), P('bottle', 'Bouteille 50 cl', 500, 500, 500, true)],
    defaultPortion: 'can' },
  { id: 'soda-zero', name: 'Soda zéro / light', group: 'drink', role: 'drink', emoji: '🥤', aliases: 'coca zero, zero, light, coca light, pepsi max, sans sucre', basis: 'ml', per100: N(1, 0, 0, 0),
    portions: [P('can', 'Canette 33 cl', 330, 330, 330, true), P('medium', 'Gobelet moyen', 400, 450, 500, true)], defaultPortion: 'can' },
  { id: 'milkshake', name: 'Milkshake', group: 'drink', role: 'drink', emoji: '🥤', aliases: 'milkshake, milk shake', basis: 'ml', per100: N(110, 3.5, 17, 3),
    portions: [P('small', 'Petit', 250, 300, 350, true), P('large', 'Grand', 400, 500, 600, true)], defaultPortion: 'small' },
  { id: 'mint-tea', name: 'Thé à la menthe sucré', group: 'drink', role: 'drink', emoji: '🍵', aliases: 'the a la menthe, the menthe, the sucre', basis: 'ml', per100: N(30, 0, 7.5, 0),
    rich: { per100: N(45, 0, 11.25, 0), label: 'Plus sucré' },
    portions: [P('glass', 'Verre', 100, 120, 150, true)], defaultPortion: 'glass', defaultCount: { low: 1, mean: 2, high: 3 } },
  { id: 'juice', name: 'Jus de fruits', group: 'drink', role: 'drink', emoji: '🧃', aliases: 'jus, jus d orange, jus de fruits, jus de pomme', basis: 'ml', per100: N(45, 0.7, 10, 0.2),
    portions: [P('glass', 'Verre', 150, 200, 250, true), P('brick', 'Petite brique', 200, 200, 200, true)], defaultPortion: 'glass' },
];

export const CATALOG_GROUPS: { id: CatalogGroup; label: string }[] = [
  { id: 'snack', label: 'Grignotage' },
  { id: 'fair', label: 'Fête foraine' },
  { id: 'fastfood', label: 'Fast-food' },
  { id: 'world', label: 'Cuisines du monde' },
  { id: 'dessert', label: 'Desserts' },
  { id: 'sauce', label: 'Sauces' },
  { id: 'drink', label: 'Boissons' },
  { id: 'extra', label: 'Suppléments' },
];

export const CATALOG_SOURCE_LABEL = 'Estimation : ordre de grandeur (tables publiques et étiquettes courantes)';

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
export function getEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

export type CountRange = { low: number; mean: number; high: number };

export interface EntryEstimateInput {
  portionId?: string;
  /** Nombre de pièces (portions comptables) — fixe ou incertain (« quelques »). */
  count?: number | CountRange;
  /** Part effectivement mangée (« la moitié des frites ») : 0 < f ≤ 1, ou plus pour « 2 portions ». */
  fraction?: number;
  /** Quantité personnalisée connue (g/ml) : remplace les hypothèses de portion. */
  customAmount?: number | null;
}

export interface EntryEstimate {
  low: Nutrients;
  mean: Nutrients;
  high: Nutrients;
  amounts: { low: number; mean: number; high: number };
  assumptions: string[];
  highReasons: string[];
  highlightHigh: string | null;
  label: string;
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function toRange(c: number | CountRange | undefined, fallback: CountRange): CountRange {
  if (c == null) return fallback;
  if (typeof c === 'number') return { low: c, mean: c, high: c };
  return c;
}

/**
 * Calcule les trois scénarios d'un aliment du catalogue.
 * Retourne null si l'entrée n'est pas valide (quantité nulle ou négative…).
 */
export function estimateEntry(entry: CatalogEntry, input: EntryEstimateInput = {}): EntryEstimate | null {
  const portion = entry.portions.find((p) => p.id === (input.portionId ?? entry.defaultPortion)) ?? entry.portions[0];
  const fraction = input.fraction ?? 1;
  if (!isValidNumber(fraction) || fraction <= 0) return null;
  const custom = input.customAmount;
  if (custom != null && (!isValidNumber(custom) || custom <= 0)) return null;

  const unit = entry.basis;
  const count = portion.piece ? toRange(input.count, entry.defaultCount ?? { low: 1, mean: 1, high: 1 }) : { low: 1, mean: 1, high: 1 };
  if ([count.low, count.mean, count.high].some((c) => !isValidNumber(c) || c <= 0)) return null;

  const amounts = custom != null
    ? { low: custom * fraction, mean: custom * fraction, high: custom * fraction }
    : {
        low: portion.low * count.low * fraction,
        mean: portion.mean * count.mean * fraction,
        high: portion.high * count.high * fraction,
      };

  let mean = scalePer100(entry.per100, amounts.mean);
  let low = scalePer100(entry.per100, amounts.low);
  let high = scalePer100(entry.rich?.per100 ?? entry.per100, amounts.high);
  const assumptions: string[] = [];
  const highReasons: string[] = [];

  const label = custom != null
    ? `${fmt(custom)} ${unit}${fraction !== 1 ? ` × ${fmt(fraction)}` : ''}`
    : `${portion.piece ? (count.low === count.high ? `${fmt(count.mean)} × ` : `${fmt(count.low)} à ${fmt(count.high)} × `) : ''}${portion.label.replace(/ \(pièce\)$/, '')}${fraction !== 1 ? ` (${fraction < 1 ? `${Math.round(fraction * 100)} % mangé` : `× ${fmt(fraction)}`})` : ''}`;

  if (custom != null) {
    assumptions.push(`Quantité indiquée : ${fmt(amounts.mean)} ${unit}.`);
  } else {
    assumptions.push(`${portion.label} : environ ${fmt(portion.mean)} ${unit}${portion.piece ? ' par pièce' : ''} (hypothèse moyenne).`);
    if (portion.piece && count.low !== count.high) assumptions.push(`Nombre estimé : ${fmt(count.mean)} (entre ${fmt(count.low)} et ${fmt(count.high)}).`);
    if (amounts.high > amounts.mean) {
      highReasons.push(`Portion plus grande : ${fmt(amounts.high)} ${unit} au lieu de ${fmt(amounts.mean)} ${unit}${count.high > count.mean ? ` (${fmt(count.high)} pièces)` : ''}.`);
    }
  }
  if (fraction !== 1) assumptions.push(fraction < 1 ? `Seule une partie a été mangée (${Math.round(fraction * 100)} %).` : `Quantité multipliée par ${fmt(fraction)}.`);
  assumptions.push(`Composition moyenne : ${fmt(entry.per100.kcal ?? 0)} kcal pour 100 ${unit}.`);
  if (entry.rich) highReasons.push(`${entry.rich.label} : ${fmt(entry.rich.per100.kcal ?? 0)} kcal/100 ${unit} au lieu de ${fmt(entry.per100.kcal ?? 0)}.`);

  if (entry.topping) {
    const t = entry.topping;
    const per = custom != null ? 1 : count.mean;
    const perHigh = custom != null ? 1 : count.high;
    const perLow = custom != null ? 1 : count.low;
    mean = addNutrients(mean, scalePer100(t.per100, t.mean * per * fraction));
    low = addNutrients(low, scalePer100(t.per100, t.mean * perLow * fraction));
    high = addNutrients(high, scalePer100(t.per100, t.high * perHigh * fraction));
    assumptions.push(`${t.label} : environ ${fmt(t.mean)} g par pièce.`);
    highReasons.push(`${t.label} généreux : ${fmt(t.high)} g au lieu de ${fmt(t.mean)} g par pièce.`);
  }

  const highlightHigh = custom == null && entry.unknown && highReasons.length ? entry.unknown : null;
  return { low: round(low), mean: round(mean), high: round(high), amounts, assumptions, highReasons, highlightHigh, label };
}

function round(n: Nutrients): Nutrients {
  const out = { ...n };
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    out[k] = v == null ? null : Math.round(v * 10) / 10;
  }
  return cleanNutrients(out);
}

/** Construit la ligne de repas (copie figée, estimation moyenne retenue par défaut). */
export function lineFromEntry(entry: CatalogEntry, input: EntryEstimateInput, id: string): LineItem | null {
  const est = estimateEntry(entry, input);
  if (!est) return null;
  const custom = input.customAmount != null;
  const info: EstimateInfo = {
    mean: est.mean,
    high: est.high,
    low: est.low,
    chosen: 'mean',
    custom: null,
    highReasons: est.highReasons,
    assumptions: est.assumptions,
    highlightHigh: est.highlightHigh,
    method: input.count != null && typeof input.count !== 'number' ? 'text' : 'catalog',
    catalogId: entry.id,
    portionId: custom ? 'custom' : input.portionId ?? entry.defaultPortion,
    count: typeof input.count === 'number' ? input.count : undefined,
    fraction: input.fraction,
  };
  const base: LineItem = {
    id,
    name: entry.name,
    // La quantité se modifie en recalculant l'estimation (nombre, portion, part mangée).
    quantity: custom ? input.customAmount! * (input.fraction ?? 1) : null,
    unit: custom ? entry.basis : 'portion',
    unitLabel: est.label,
    baseAmount: est.amounts.mean,
    baseUnit: entry.basis,
    nutrients: est.mean,
    kcalRange: null,
    precision: custom ? 'approx' : 'rough',
    source: { kind: 'estimate', label: CATALOG_SOURCE_LABEL },
  };
  return withEstimate(base, info);
}

/** Recalcule une ligne du catalogue avec une nouvelle quantité, en conservant le choix moyenne/haute. */
export function reestimateLine(item: LineItem, input: EntryEstimateInput): LineItem | null {
  const entry = item.estimate?.catalogId ? getEntry(item.estimate.catalogId) : undefined;
  if (!entry) return null;
  const next = lineFromEntry(entry, input, item.id);
  if (!next || !next.estimate) return null;
  const chosen = item.estimate!.chosen === 'high' ? 'high' : 'mean';
  return withEstimate({ ...next, note: item.note }, { ...next.estimate, chosen });
}

/** Recherche dans le catalogue par nom ou expression. */
export function searchCatalog(query: string, limit = 30): CatalogEntry[] {
  const q = normalize(query);
  if (!q) return CATALOG.slice(0, limit);
  const words = q.split(' ');
  return CATALOG.map((e) => {
    const hay = normalize(`${e.name} ${e.aliases}`);
    if (!words.every((w) => hay.includes(w))) return null;
    const score = (normalize(e.name).startsWith(q) ? 2 : 0) + (hay.includes(q) ? 1 : 0);
    return { e, score };
  })
    .filter((x): x is { e: CatalogEntry; score: number } => x != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}
