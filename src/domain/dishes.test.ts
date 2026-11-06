import { describe, expect, it } from 'vitest';
import raw from '../data/fooddb/dishes.json';
import { compositionTotals, dishFromRaw, lineFromComposition, PORTION_PRESETS, type CompositionIngredient } from './dishes';

const dishes = (raw as unknown as { dishes: Parameters<typeof dishFromRaw>[0][] }).dishes.map(dishFromRaw);
const get = (id: string) => structuredClone(dishes.find((d) => d.id === `dish:${id}`)!);

describe('plats composés', () => {
  it('base de plats chargée, ingrédients tous résolus avec des valeurs', () => {
    expect(dishes.length).toBeGreaterThan(150);
    for (const d of dishes) {
      expect(d.ingredients.length).toBeGreaterThan(0);
      const t = compositionTotals(d.ingredients);
      expect(t.grams, d.name).toBeGreaterThan(0);
      expect(t.nutrients.kcal, d.name).toBeGreaterThan(0);
      // Densité énergétique plausible pour un plat (eau 0 … beignets/huile < 600 kcal/100 g)
      expect(t.nutrients.kcal! / t.grams * 100, d.name).toBeLessThan(600);
    }
  });
  it('bouzelouf : les parties consommées changent le calcul', () => {
    const d = get('bouzelouf');
    const base = compositionTotals(d.ingredients).nutrients.kcal!;
    const cervelle = d.ingredients.find((i) => i.label === 'Cervelle')!;
    expect(cervelle.enabled).toBe(false);
    cervelle.enabled = true;
    const withBrain = compositionTotals(d.ingredients).nutrients.kcal!;
    expect(withBrain).toBeGreaterThan(base);
    d.ingredients.find((i) => i.label === 'Langue')!.enabled = false;
    expect(compositionTotals(d.ingredients).nutrients.kcal!).toBeLessThan(withBrain);
    expect(d.notes.join(' ')).toMatch(/Estimation/);
  });
  it('hachis parmentier : 100 g → 75 g de viande recalcule calories et protéines', () => {
    const d = get('hachis-parmentier');
    const before = compositionTotals(d.ingredients).nutrients;
    const meat = d.ingredients.find((i) => /Viande/.test(i.label))!;
    const per = meat.per100;
    meat.grams -= 25;
    const after = compositionTotals(d.ingredients).nutrients;
    expect(before.kcal! - after.kcal!).toBeCloseTo(per[0]! * 0.25, 5);
    expect(before.protein! - after.protein!).toBeCloseTo(per[1]! * 0.25, 5);
  });
  it('portion simple : « j’ai repris une 2e portion » double, « pas terminé » divise par deux', () => {
    const d = get('couscous-agneau');
    const one = compositionTotals(d.ingredients).nutrients.kcal!;
    const second = PORTION_PRESETS.find((p) => p.id === 'second')!.factor;
    expect(compositionTotals(d.ingredients, { factor: second }).nutrients.kcal!).toBeCloseTo(one * 2, 5);
    expect(compositionTotals(d.ingredients, { factor: 0.5 }).nutrients.kcal!).toBeCloseTo(one / 2, 5);
  });
  it('ligne de repas : estimation moyenne/haute et composition copiée (historique figé)', () => {
    const d = get('quiche-thon');
    const line = lineFromComposition(d.name, d.ingredients, 1, 'l1', { estimated: true, dishId: d.id, notes: d.notes })!;
    expect(line.estimate!.high.kcal!).toBeGreaterThan(line.estimate!.mean.kcal!);
    expect(line.nutrients.kcal).toBe(line.estimate!.mean.kcal);
    d.ingredients[0].grams = 999; // modifier la source après coup…
    expect(line.composition![0].grams).not.toBe(999); // …ne change pas la ligne enregistrée
  });
  it('valeur inconnue signalée, jamais comptée comme 0', () => {
    const list: CompositionIngredient[] = [{ key: 'a', label: 'X', basis: 'g', grams: 100, per100: [100, null, 10, 5, null, null], enabled: true }];
    const t = compositionTotals(list);
    expect(t.missing).toBe(1);
    expect(t.nutrients.protein).toBe(0);
  });
});
