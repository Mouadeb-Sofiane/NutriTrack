import { describe, expect, it } from 'vitest';
import { estimatePlateMass, foodLineFromPhoto, shareOf, type MassModel } from './photoMass';
import { buildTemplateItems, getTemplate, photoFactors, templateMass } from './templates';
import { estimateEntry, getEntry, lineFromEntry } from './catalog';
import { scenarioTotals } from './estimates';
import { refFood } from './referenceFoods';
import model from '../vision/massModel.json';
import samples from '../test/nutrition5kSamples.json';

const M = model as unknown as MassModel;

describe('poids estimé sur la photo', () => {
  it('même résultat que le modèle entraîné en Python (3 vraies assiettes Nutrition5k)', () => {
    for (const s of samples) {
      const r = estimatePlateMass(new Float32Array(s.embeddings), 5, M)!;
      // arrondi à 5 g dans l'application
      expect(Math.abs(r.normal - s.python.normal), s.id).toBeLessThanOrEqual(3);
      expect(Math.abs(r.high - s.python.high), s.id).toBeLessThanOrEqual(3);
      expect(r.low).toBeLessThanOrEqual(r.normal);
      expect(r.high).toBeGreaterThan(r.normal);
    }
  });
  it('les performances annoncées sont celles mesurées', () => {
    expect(M.test.plates).toBe(507);
    expect(M.test.maeGrams).toBeLessThan(45);
    expect(M.test.highCoverage).toBeGreaterThan(0.75);
  });
  it('entrée invalide → pas d’estimation', () => {
    expect(estimatePlateMass(new Float32Array(10), 5, M)).toBeNull();
    expect(estimatePlateMass(new Float32Array(0), 0, M)).toBeNull();
  });
  it('mode rapide (image entière seulement) reste possible', () => {
    const r = estimatePlateMass(new Float32Array(samples[1].embeddings.slice(0, 512)), 1, M);
    expect(r!.normal).toBeGreaterThan(0);
  });
  it('part de l’assiette', () => {
    expect(shareOf({ low: 200, normal: 300, high: 400 }, 0.5)).toEqual({ low: 100, normal: 150, high: 200 });
  });
});

describe('utilisation du poids de la photo', () => {
  const mass = { low: 300, normal: 380, high: 470 };
  it('aliment de la table : quantité normale / haute / basse issues de la photo', () => {
    const l = foodLineFromPhoto(refFood('rice-cooked'), mass, 0.5, 'r')!;
    expect(l.quantity).toBe(190);
    expect(l.estimate!.mean.kcal).toBeCloseTo(190 * 1.3);
    expect(l.estimate!.high.kcal).toBeCloseTo(235 * 1.3);
    expect(l.estimate!.low!.kcal).toBeCloseTo(150 * 1.3);
    expect(l.estimate!.highReasons[0]).toMatch(/photo/);
    expect(foodLineFromPhoto(refFood('milk-semi'), mass, 1, 'm')).toBeNull(); // boisson : pas de poids d'assiette
  });
  it('modèle de plat ajusté au poids de l’assiette', () => {
    const t = getTemplate('couscous')!;
    const { items, assumptions } = buildTemplateItems(t, 'medium', 'medium', () => Math.random().toString(), photoFactors(t, mass));
    const grams = items.reduce((s, i) => s + (i.baseAmount ?? 0), 0);
    expect(grams).toBeCloseTo(380, -1); // même poids total que la photo (arrondis près)
    expect(scenarioTotals(items).high).toBeGreaterThan(scenarioTotals(items).mean);
    expect(assumptions[0]).toMatch(/poids estimé sur la photo/);
    expect(templateMass(t)).toBeGreaterThan(0);
  });
  it('aliment du catalogue (frites) : fourchette de la photo + composition plus riche pour la haute', () => {
    const e = estimateEntry(getEntry('fries')!, { amountRange: { low: 100, mean: 140, high: 180, reason: 'photo', highReason: 'photo haute' } })!;
    expect(e.mean.kcal).toBeCloseTo(140 * 3);
    expect(e.high.kcal).toBeCloseTo(180 * 3.3);
    expect(e.highReasons).toContain('photo haute');
    const l = lineFromEntry(getEntry('fries')!, { amountRange: { low: 100, mean: 140, high: 180, reason: 'photo', highReason: 'photo haute' } }, 'f')!;
    expect(l.quantity).toBe(140);
    expect(l.estimate!.method).toBe('visual');
    expect(estimateEntry(getEntry('fries')!, { amountRange: { low: 200, mean: 140, high: 180, reason: '', highReason: '' } })).toBeNull();
  });
});
