import { describe, expect, it } from 'vitest';
import { CATALOG, estimateEntry, getEntry, lineFromEntry, reestimateLine, searchCatalog } from './catalog';
import { chooseEstimate, findDuplicateItem, findRecentDuplicateMeal, scenarioTotals, withEstimate } from './estimates';
import { checkPer100, lineFromFood, manualLine, sumItems } from './nutrition';
import { lineFromQuickMatch, parseQuickText, splitQuickText } from './quickText';
import { fastFoodLines, fastFoodName } from './fastFood';
import { analyzePhoto } from './photoAnalysis';
import { buildTemplateItems, DISH_TEMPLATES } from './templates';
import { lineFromRecipe } from './recipes';
import { dayTotals } from './stats';
import { refFood } from './referenceFoods';
import type { LineItem, MealEntry, Recipe } from './types';

let n = 0;
const id = () => `i${n++}`;
const entry = (x: string) => getEntry(x)!;

describe('catalogue', () => {
  it('compositions cohérentes et hypothèses ordonnées (basse ≤ moyenne ≤ haute)', () => {
    for (const e of CATALOG) {
      for (const per100 of [e.per100, e.rich?.per100].filter(Boolean)) {
        const c = checkPer100(per100!, e.basis);
        expect(c.ok, e.id).toBe(true);
        if (e.id !== 'soda-zero') expect(c.warnings, e.id).toEqual([]);
      }
      if (e.rich) expect(e.rich.per100.kcal! >= e.per100.kcal!, e.id).toBe(true);
      for (const p of e.portions) expect(p.low <= p.mean && p.mean <= p.high, `${e.id}/${p.id}`).toBe(true);
      expect(e.portions.some((p) => p.id === e.defaultPortion), e.id).toBe(true);
    }
  });
  it('recherche', () => {
    expect(searchCatalog('churros')[0].id).toBe('churros');
    expect(searchCatalog('barbe a papa')[0].id).toBe('cotton-candy');
  });
});

describe('création d’un aliment estimé', () => {
  it('moyenne et haute construites à partir d’hypothèses explicites', () => {
    const e = estimateEntry(entry('churros'), { portionId: 'piece', count: 4 })!;
    // moyenne : 4 × 30 g × 410 kcal/100 g
    expect(e.mean.kcal).toBeCloseTo(492);
    // haute : 4 × 45 g × 460 kcal/100 g (portion plus grande + friture plus grasse)
    expect(e.high.kcal).toBeCloseTo(828);
    expect(e.low.kcal).toBeCloseTo(4 * 20 * 4.1);
    expect(e.highReasons.join(' ')).toMatch(/Portion plus grande/);
    expect(e.highReasons.join(' ')).toMatch(/Friture plus grasse/);
    expect(e.highlightHigh).toBeTruthy();
  });
  it('pas de valeur fixe : la portion change le résultat', () => {
    const small = estimateEntry(entry('french-tacos'), { portionId: 'm', count: 1 })!;
    const xl = estimateEntry(entry('french-tacos'), { portionId: 'xl', count: 1 })!;
    expect(xl.mean.kcal!).toBeGreaterThan(small.mean.kcal! * 1.5);
  });
  it('garniture incluse (crêpe) comptée une seule fois', () => {
    const e = estimateEntry(entry('crepe-spread'), { count: 1 })!;
    expect(e.mean.kcal).toBeCloseTo(65 * 2.2 + 25 * 5.4);
    expect(e.high.kcal).toBeCloseTo(80 * 2.2 + 45 * 5.4);
  });
  it('quantité connue : seule la composition varie', () => {
    const e = estimateEntry(entry('fries'), { customAmount: 100 })!;
    expect(e.mean.kcal).toBe(300);
    expect(e.high.kcal).toBe(330);
    expect(e.highlightHigh).toBeNull();
  });
  it('portion partiellement mangée', () => {
    const all = estimateEntry(entry('fries'), { portionId: 'large' })!;
    const half = estimateEntry(entry('fries'), { portionId: 'large', fraction: 0.5 })!;
    expect(half.mean.kcal).toBeCloseTo(all.mean.kcal! / 2);
  });
  it('quantités invalides refusées', () => {
    expect(estimateEntry(entry('chips'), { fraction: 0 })).toBeNull();
    expect(estimateEntry(entry('chips'), { customAmount: -20 })).toBeNull();
    expect(estimateEntry(entry('churros'), { portionId: 'piece', count: -2 })).toBeNull();
    expect(lineFromEntry(entry('chips'), { fraction: -1 }, 'x')).toBeNull();
  });
});

describe('valeur retenue et corrections', () => {
  const line = lineFromEntry(entry('kebab'), { count: 1 }, 'k')!;
  it('moyenne retenue par défaut, les deux estimations conservées', () => {
    expect(line.estimate!.chosen).toBe('mean');
    expect(line.nutrients.kcal).toBe(line.estimate!.mean.kcal);
    expect(line.estimate!.high.kcal!).toBeGreaterThan(line.estimate!.mean.kcal!);
    expect(line.kcalRange!.max).toBe(line.estimate!.high.kcal);
  });
  it('choisir l’estimation haute', () => {
    const h = chooseEstimate(line, 'high');
    expect(h.nutrients.kcal).toBe(line.estimate!.high.kcal);
    expect(h.estimate!.mean.kcal).toBe(line.estimate!.mean.kcal);
  });
  it('valeur personnalisée : calories corrigées, macros proportionnelles, estimations gardées', () => {
    const c = chooseEstimate(line, 'custom', 900);
    expect(c.nutrients.kcal).toBe(900);
    expect(c.estimate!.chosen).toBe('custom');
    expect(c.estimate!.custom!.protein).toBeCloseTo(line.estimate!.mean.protein! * (900 / line.estimate!.mean.kcal!));
    expect(c.estimate!.high.kcal).toBe(line.estimate!.high.kcal);
    expect(chooseEstimate(line, 'custom', -5)).toBe(line);
  });
  it('recalcul de quantité en gardant le choix', () => {
    const h = chooseEstimate(lineFromEntry(entry('churros'), { count: 2 }, 'c')!, 'high');
    const r = reestimateLine(h, { portionId: 'piece', count: 4 })!;
    expect(r.id).toBe('c');
    expect(r.estimate!.chosen).toBe('high');
    expect(r.nutrients.kcal).toBeCloseTo(4 * 45 * 4.6);
  });
});

describe('scénarios et total journalier', () => {
  const kebab = lineFromEntry(entry('kebab'), { count: 1 }, 'a')!;
  const fries = chooseEstimate(lineFromEntry(entry('fries'), { portionId: 'medium' }, 'b')!, 'high');
  const soda = lineFromEntry(entry('soda'), { portionId: 'can', count: 1 }, 'c')!;
  const weighed = lineFromFood(refFood('apple'), { unit: 'g', count: 150 }, 'd')!;
  const items = [kebab, fries, soda, weighed];
  it('total retenu = somme des valeurs retenues', () => {
    expect(sumItems(items).kcal).toBeCloseTo(kebab.estimate!.mean.kcal! + fries.estimate!.high.kcal! + soda.nutrients.kcal! + weighed.nutrients.kcal!);
  });
  it('scénarios moyen et haut cohérents', () => {
    const s = scenarioTotals(items);
    expect(s.mean).toBeCloseTo(kebab.estimate!.mean.kcal! + fries.estimate!.mean.kcal! + soda.nutrients.kcal! + weighed.nutrients.kcal!);
    expect(s.high).toBeCloseTo(kebab.estimate!.high.kcal! + fries.estimate!.high.kcal! + soda.nutrients.kcal! + weighed.nutrients.kcal!);
    expect(s.highChosenCount).toBe(1);
    expect(s.uncertainCount).toBe(2); // la canette et la pomme pesée n'ont pas d'incertitude
    expect(s.mean).toBeLessThanOrEqual(s.retained);
    expect(s.retained).toBeLessThanOrEqual(s.high);
  });
  it('une valeur personnalisée s’applique aux deux scénarios', () => {
    const s = scenarioTotals([chooseEstimate(kebab, 'custom', 700)]);
    expect(s).toMatchObject({ retained: 700, mean: 700, high: 700, customCount: 1 });
  });
  it('total du jour (plusieurs repas, grignotage compris)', () => {
    const meal = (mid: string, its: LineItem[], type: MealEntry['mealType'] = 'lunch'): MealEntry => ({ id: mid, date: '2026-10-28', mealType: type, items: its, place: 'restaurant', method: 'mixed', assumptions: [], userCorrected: false, createdAt: '', updatedAt: '' });
    const snack = lineFromEntry(entry('chips'), { portionId: 'handful' }, 'e')!;
    const t = dayTotals([meal('m1', [kebab, fries, soda]), meal('m2', [snack], 'snack')], '2026-10-28');
    expect(t.kcal).toBeCloseTo(kebab.nutrients.kcal! + fries.nutrients.kcal! + soda.nutrients.kcal! + snack.nutrients.kcal!);
  });
});

describe('doublons', () => {
  const a = lineFromEntry(entry('churros'), { count: 3 }, 'x1')!;
  it('même aliment, même portion, même valeur → doublon', () => {
    expect(findDuplicateItem([a], { ...a, id: 'x2' })).toBe(a);
    expect(findDuplicateItem([a], lineFromEntry(entry('churros'), { count: 5 }, 'x3')!)).toBeNull();
    expect(findDuplicateItem([a], lineFromEntry(entry('popcorn-sweet'), {}, 'x4')!)).toBeNull();
  });
  it('repas identique enregistré il y a quelques minutes', () => {
    const now = new Date('2026-10-28T20:10:00Z');
    const saved = { id: 'm1', date: '2026-10-28', mealType: 'snack', items: [a], createdAt: '2026-10-28T20:05:00Z' };
    expect(findRecentDuplicateMeal([saved], { date: '2026-10-28', mealType: 'snack', items: [{ ...a, id: 'z' }] }, now)).toBe(saved);
    expect(findRecentDuplicateMeal([saved], { id: 'm1', date: '2026-10-28', mealType: 'snack', items: [a] }, now)).toBeNull();
    expect(findRecentDuplicateMeal([saved], { date: '2026-10-28', mealType: 'snack', items: [a] }, new Date('2026-10-28T22:00:00Z'))).toBeNull();
  });
});

describe('saisie libre', () => {
  it('découpe une phrase en éléments', () => {
    expect(splitQuickText('J’ai mangé un kebab avec des frites et un coca')).toHaveLength(3);
  });
  it('kebab avec frites et coca', () => {
    const m = parseQuickText('J’ai mangé un kebab avec des frites et un coca');
    expect(m.map((x) => x.entry?.id)).toEqual(['kebab', 'fries', 'soda']);
    expect(m[0].count).toBe(1);
  });
  it('plusieurs aliments sans séparateur', () => {
    expect(parseQuickText('kebab frites coca zero').map((x) => x.entry?.id)).toEqual(['kebab', 'fries', 'soda-zero']);
  });
  it('quantités : nombres, « quelques », poignée, sachet, moitié', () => {
    const [churros] = parseQuickText('deux churros à la fête foraine');
    expect(churros).toMatchObject({ count: 2, quantityGuessed: false });
    const [bisc] = parseQuickText('quelques biscuits');
    expect(bisc.count).toEqual({ low: 2, mean: 3, high: 5 });
    expect(parseQuickText('une poignée de cacahuètes')[0].portionId).toBe('handful');
    expect(parseQuickText('un grand paquet de chips')[0].portionId).toBe('big-bag');
    expect(parseQuickText('un sachet de pop-corn')[0]).toMatchObject({ portionId: 'small' });
    const half = parseQuickText('un burger et la moitié des frites');
    expect(half[1].fraction).toBe(0.5);
  });
  it('quantité inconnue : portion habituelle, estimation haute mise en avant', () => {
    const [m] = parseQuickText('j’ai grignoté des chips devant un film');
    expect(m.entry!.id).toBe('chips');
    expect(m.quantityGuessed).toBe(true);
    const line = lineFromQuickMatch(m, 'q')!;
    expect(line.estimate!.highlightHigh).toMatch(/Quantité non précisée/);
    expect(line.estimate!.high.kcal!).toBeGreaterThan(line.estimate!.mean.kcal!);
  });
  it('nombre non précisé : une pièce, pas un pire cas', () => {
    const line = lineFromQuickMatch(parseQuickText('pizza')[0], 'p')!;
    const e = estimateEntry(entry('pizza'), { portionId: 'individual', count: 1 })!;
    expect(line.estimate!.high.kcal).toBeCloseTo(e.high.kcal!);
    expect(line.estimate!.high.kcal!).toBeLessThan(line.estimate!.mean.kcal! * 1.6);
  });
  it('quantité vague : fourchette sur le nombre de pièces', () => {
    const line = lineFromQuickMatch(parseQuickText('quelques biscuits avec du chocolat')[0], 'b')!;
    expect(line.estimate!.mean.kcal).toBeCloseTo(3 * 10 * 4.9);
    expect(line.estimate!.high.kcal).toBeCloseTo(5 * 13 * 4.9);
  });
  it('recettes personnelles reconnues', () => {
    const r: Recipe = { id: 'r', name: 'Couscous du vendredi', categories: [], ingredients: [], servings: 6, manualTotal: { kcal: 3000, protein: null, carbs: null, fat: null }, manualPrecision: 'rough', assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '' };
    const [m] = parseQuickText('une assiette de couscous du vendredi', { recipes: [r] });
    expect(m.kind).toBe('recipe');
    const line = lineFromQuickMatch(m, 'r1')!;
    expect(line.nutrients.kcal).toBe(500);
    expect(line.estimate!.high.kcal!).toBeGreaterThan(500);
  });
  it('élément non reconnu : signalé, pas inventé', () => {
    const [m] = parseQuickText('un truc bizarre');
    expect(m.kind).toBe('unknown');
    expect(lineFromQuickMatch(m, 'u')).toBeNull();
  });
});

describe('repas fast-food', () => {
  it('composants séparés, total = somme, sans double comptage', () => {
    const lines = fastFoodLines([
      { catalogId: 'kebab', count: 1 },
      { catalogId: 'fries', portionId: 'medium', fraction: 0.5 },
      { catalogId: 'rich-sauce', count: 1 },
      { catalogId: 'soda', portionId: 'can', count: 1 },
    ], id);
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((l) => l.id)).size).toBe(4);
    const fries = estimateEntry(entry('fries'), { portionId: 'medium' })!;
    expect(lines[1].nutrients.kcal).toBeCloseTo(fries.mean.kcal! / 2);
    expect(sumItems(lines).kcal).toBeCloseTo(lines.reduce((s, l) => s + l.nutrients.kcal!, 0));
    expect(fastFoodName([{ catalogId: 'kebab' }, { catalogId: 'fries' }])).toBe('Kebab, Frites');
  });
  it('valeurs officielles de l’enseigne prioritaires, avec leur provenance', () => {
    const [l] = fastFoodLines([{ catalogId: 'burger', official: { kcal: 540, protein: 25, carbs: 45, fat: 28 }, officialSource: 'site de l’enseigne' }], id);
    expect(l.nutrients.kcal).toBe(540);
    expect(l.source.kind).toBe('official');
    expect(l.estimate).toBeUndefined();
  });
});

describe('plats maison et recettes', () => {
  it('modèle de plat : haute = assiette plus copieuse et plus de matière grasse', () => {
    const t = DISH_TEMPLATES.find((x) => x.id === 'couscous')!;
    const { items } = buildTemplateItems(t, 'medium', 'medium', id);
    const s = scenarioTotals(items);
    expect(s.high).toBeGreaterThan(s.mean * 1.3);
    expect(items.at(-1)!.estimate!.highlightHigh).toBeTruthy();
    expect(items.every((i) => i.estimate)).toBe(true);
  });
  it('part de recette pesée exactement : pas d’estimation haute artificielle', () => {
    const r: Recipe = { id: 'r', name: 'Soupe', categories: [], servings: 4, totalWeightG: 2000, assumptions: [], favorite: false, version: 1, createdAt: '', updatedAt: '',
      ingredients: [manualLine('i', 'Lentilles', { kcal: 800 }, { precision: 'exact' })] };
    expect(lineFromRecipe(r, { kind: 'grams', grams: 500 }, 'l')!.estimate).toBeUndefined();
    expect(lineFromRecipe(r, { kind: 'servings', servings: 1, size: 'usual' }, 'l')!.estimate!.highReasons.join()).toMatch(/plus garnie/);
  });
});

describe('données incomplètes', () => {
  it('une estimation sans macros garde les macros inconnues', () => {
    const base = manualLine('m', 'Assiette chez des amis', { kcal: 600 }, { precision: 'rough' });
    const l = withEstimate(base, { mean: base.nutrients, high: { kcal: 850, protein: null, carbs: null, fat: null }, chosen: 'mean', highReasons: ['Plus de sauce'], assumptions: [], method: 'visual' });
    const t = sumItems([l]);
    expect(t.kcal).toBe(600);
    expect(t.missing.protein).toBe(1);
    expect(chooseEstimate(l, 'custom', 700).nutrients.protein).toBeNull();
  });
});

describe('photo sans service d’IA', () => {
  it('renvoie « indisponible » sans inventer de résultat', async () => {
    const r = await analyzePhoto(new Blob([new Uint8Array([1])]), null);
    expect(r.status).toBe('unavailable');
    expect(r.description).toBeUndefined();
    expect(r.visible).toBeUndefined();
  });
  it('erreur du service → message de secours', async () => {
    const r = await analyzePhoto(new Blob([]), { id: 'x', label: 'x', analyze: async () => { throw new Error('boom'); } });
    expect(r.status).toBe('error');
  });
});

describe('conseils sans culpabilisation', () => {
  it('les sauces de fast-food déclenchent une idée facultative, sans injonction', async () => {
    const { buildInsights, SWAPS } = await import('./advice');
    const items = fastFoodLines([{ catalogId: 'kebab', count: 1 }, { catalogId: 'rich-sauce', count: 3 }], id);
    const meal: MealEntry = { id: 'm', date: '2026-10-28', mealType: 'dinner', items, place: 'restaurant', method: 'guided', assumptions: [], userCorrected: false, createdAt: '', updatedAt: '' };
    const ins = buildInsights([meal], null, '2026-10-22', '2026-10-28');
    expect(ins.some((i) => i.swapId === 'mayo-yogurt')).toBe(true);
    const all = [...ins.map((i) => i.text), ...SWAPS.flatMap((s) => [s.why, ...s.tradeoffs])].join(' ').toLowerCase();
    for (const word of ['sauter', 'interdit', 'mauvais', 'culpab', 'compenser']) expect(all).not.toContain(word);
  });
});
