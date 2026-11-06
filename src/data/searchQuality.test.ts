import { describe, expect, it } from 'vitest';
import raw from './fooddb/usda.json';
import { foodFromRow } from './foodDb';
import { buildIndex, search, searchCombo } from '../domain/search';
import { catalogDocs, dishDocs, foodDocs, type SearchRef } from './searchIndex';
import dishesRaw from './fooddb/dishes.json';
import { dishFromRaw } from '../domain/dishes';
import { REFERENCE_FOODS } from '../domain/referenceFoods';

const foods = (raw as unknown as { foods: Parameters<typeof foodFromRow>[0][] }).foods.map(foodFromRow);
const t0 = performance.now();
const idx = buildIndex<SearchRef>([...foodDocs(REFERENCE_FOODS, 0.5), ...catalogDocs(), ...dishDocs((dishesRaw as unknown as { dishes: Parameters<typeof dishFromRaw>[0][] }).dishes.map(dishFromRaw)), ...foodDocs(foods)]);
const buildMs = performance.now() - t0;
const names = (q: string, n = 8) => search(idx, q, { limit: n }).map((h) => h.doc.name);

describe('recherche sur la base réelle', () => {
  it('construction et recherche rapides', () => {
    expect(foods.length).toBeGreaterThan(7000);
    const t = performance.now();
    for (const q of ['pain', 'pomme de terre', 'cafe sucre', 'champinon']) search(idx, q);
    const ms = (performance.now() - t) / 4;
    console.log(`index ${Math.round(buildMs)} ms, requête ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(150);
  });
  it.each(['pain', 'pain avec beurre', 'pain confiture', 'banane', 'lait demi-écrémé', 'café avec sucre', 'pommes de terre', 'champignons', 'gratin', 'hachis', 'couscous', 'biryani', 'pho', 'fufu', 'bouzelouf', 'thé menthe'])('%s', (q) => {
    console.log(q, '→', names(q).join(' | '), '|| combo:', searchCombo(idx, q)?.map((d) => d.name).join(' + ') ?? '—');
  });
  it('résultats pertinents', () => {
    expect(names('banane', 3).some((n) => /^Banane/.test(n))).toBe(true);
    expect(names('lait demi-écrémé', 3).some((n) => /Lait demi-écrémé/.test(n))).toBe(true);
    expect(names('café avec sucre', 3)).toContain('Café avec sucre');
    expect(names('pommes de terre', 8).every((n) => /pomme/i.test(n))).toBe(true);
    expect(names('hachis', 5).some((n) => /Hachis parmentier/.test(n))).toBe(true);
    expect(names('bouzelouf', 1)[0]).toMatch(/Bouzelouf/);
    expect(names('bouzellouf', 1)[0]).toMatch(/Bouzelouf/);
    expect(names('tete de mouton', 1)[0]).toMatch(/Bouzelouf/);
    expect(names('pain beurre', 1)[0]).toBe('Tartine de pain beurrée');
    expect(names('pain avec beurre', 1)[0]).toBe('Tartine de pain beurrée');
    expect(names('pain confiture', 1)[0]).toMatch(/confiture/);
    expect(names('pates champignons', 1)[0]).toMatch(/Pâtes aux champignons/);
    expect(names('ndole', 1)[0]).toBe('Ndolé');
    expect(names('cafe au lait', 3).some((n) => /Café au lait/.test(n))).toBe(true);
  });
});
