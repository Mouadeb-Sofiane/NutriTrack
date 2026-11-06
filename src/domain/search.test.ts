import { describe, expect, it } from 'vitest';
import { buildIndex, editDistance, search, searchCombo, type SearchDoc } from './search';

const docs: SearchDoc<null>[] = [
  ['bread', 'food', 'Pain baguette', 'pain blanc'],
  ['bread-whole', 'food', 'Pain complet', ''],
  ['bread-butter', 'dish', 'Tartine de pain beurrée', 'pain beurre, tartine beurre'],
  ['butter', 'food', 'Beurre doux', ''],
  ['jam', 'food', 'Confiture', ''],
  ['potato-raw', 'food', 'Pomme de terre, crue', 'patate'],
  ['potato-boiled', 'food', 'Pomme de terre, bouillie', 'patate'],
  ['fries', 'food', 'Frites', 'pomme de terre frite'],
  ['apple', 'food', 'Pomme, crue', ''],
  ['mush', 'food', 'Champignon de Paris, cru', ''],
  ['pasta-mush', 'dish', 'Pâtes aux champignons', ''],
  ['coffee', 'drink', 'Café noir', ''],
  ['sugar', 'food', 'Sucre blanc', ''],
  ['bouzelouf', 'dish', 'Bouzelouf (tête de mouton)', 'bouzellouf, bouzelouf, tête de mouton, ras el kebch'],
  ['hachis', 'dish', 'Hachis parmentier', ''],
  ['gratin-dauph', 'dish', 'Gratin dauphinois', 'gratin de pommes de terre'],
  ['gratin-cauli', 'dish', 'Gratin de chou-fleur', ''],
  ['milk', 'drink', 'Lait demi-écrémé', 'lait 1/2 écrémé'],
].map(([id, kind, name, synonyms]) => ({ id, kind: kind as SearchDoc['kind'], name, synonyms, ref: null }));
const idx = buildIndex(docs);
const ids = (q: string) => search(idx, q).map((h) => h.doc.id);

describe('distance d’édition', () => {
  it('compte substitutions, insertions et transpositions', () => {
    expect(editDistance('cafe', 'cafe')).toBe(0);
    expect(editDistance('pian', 'pain')).toBe(1);
    expect(editDistance('champinon', 'champignon')).toBe(1);
    expect(editDistance('abc', 'xyzw', 2)).toBe(3);
  });
});

describe('recherche', () => {
  it('pain : propose les pains, pas les autres aliments', () => {
    const r = ids('pain');
    expect(r.slice(0, 2).sort()).toEqual(['bread', 'bread-whole']);
    expect(r).not.toContain('butter');
  });
  it('accents et pluriels ignorés', () => {
    expect(ids('pates champignon')[0]).toBe('pasta-mush');
    expect(ids('PÂTES aux CHAMPIGNONS')[0]).toBe('pasta-mush');
    expect(ids('lait demi ecreme')[0]).toBe('milk');
  });
  it('fautes de frappe tolérées', () => {
    expect(ids('champinon')[0]).toBe('mush');
    expect(ids('hachi parmantier')[0]).toBe('hachis');
    expect(ids('bouzellouf')[0]).toBe('bouzelouf');
  });
  it('pomme de terre : distingue les préparations sans mélanger avec la pomme', () => {
    const r = ids('pomme de terre');
    expect(r.slice(0, 2).sort()).toEqual(['potato-boiled', 'potato-raw']);
    expect(r.indexOf('apple')).toBe(-1);
  });
  it('gratin : plusieurs gratins distincts', () => {
    expect(ids('gratin').slice(0, 2).sort()).toEqual(['gratin-cauli', 'gratin-dauph']);
  });
  it('synonymes et noms régionaux', () => {
    expect(ids('tete de mouton')[0]).toBe('bouzelouf');
    expect(ids('patate')).toContain('potato-raw');
  });
  it('saisie en cours : préfixe du dernier mot', () => {
    expect(ids('hachis par')[0]).toBe('hachis');
    expect(ids('conf')[0]).toBe('jam');
  });
  it('pain beurre : le plat composé existe', () => {
    expect(ids('pain beurre')[0]).toBe('bread-butter');
  });
  it('café sucre : combinaison proposée quand aucun élément ne couvre tout', () => {
    expect(ids('cafe sucre')).toEqual([]);
    expect(searchCombo(idx, 'café avec sucre')?.map((d) => d.id)).toEqual(['coffee', 'sugar']);
    expect(searchCombo(idx, 'pain confiture')?.map((d) => d.id)).toEqual(['bread', 'jam']);
  });
  it('filtre par type', () => {
    expect(search(idx, 'lait', { kinds: ['food'] })).toEqual([]);
    expect(search(idx, 'lait', { kinds: ['drink'] })[0].doc.id).toBe('milk');
  });
});
