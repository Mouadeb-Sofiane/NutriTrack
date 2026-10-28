import { describe, expect, it } from 'vitest';
import { FOOD_LABELS, proposalsFromZones, scoreZones, zoneRects, type Scored } from './recognition';
import { getEntry } from './catalog';
import { getTemplate } from './templates';
import { getReferenceFood } from './referenceFoods';
import manifest from '../../public/models/food-clip-v1/manifest.json';
import labelsJson from './foodLabels.json';

describe('vocabulaire de reconnaissance', () => {
  it('chaque libellé mène à un aliment, un plat ou un modèle existant', () => {
    for (const l of FOOD_LABELS) {
      const t = l.target;
      const ok = t.kind === 'catalog' ? getEntry(t.id) : t.kind === 'template' ? getTemplate(t.id) : getReferenceFood(t.id);
      expect(ok, `${l.id} → ${t.kind}:${t.id}`).toBeTruthy();
    }
  });
  it('identifiants uniques et vecteurs pré-calculés à jour', () => {
    const ids = FOOD_LABELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(manifest.labels.ids).toEqual([...ids, ...labelsJson.background.map((b) => b.id)]);
  });
});

describe('classement', () => {
  const ids = ['pizza', 'fries', 'not-food'];
  const L = new Float32Array([1, 0, 0, /**/ 0, 1, 0, /**/ 0, 0, 1]);
  it('softmax par zone, trié', () => {
    const z = scoreZones(new Float32Array([0.9, 0.1, 0]), 1, L, ids, 10);
    expect(z[0][0].id).toBe('pizza');
    expect(z[0].reduce((s, x) => s + x.p, 0)).toBeCloseTo(1);
  });
  it('insensible à la norme du vecteur image', () => {
    const a = scoreZones(new Float32Array([0.9, 0.1, 0]), 1, L, ids, 10)[0][0].p;
    const b = scoreZones(new Float32Array([9, 1, 0]), 1, L, ids, 10)[0][0].p;
    expect(a).toBeCloseTo(b);
  });
});

describe('propositions', () => {
  const z = (...pairs: [string, number][]): Scored[] => pairs.map(([id, p]) => ({ id, p }));
  it('top-3 de l’image entière + aliment franc trouvé dans une zone', () => {
    const r = proposalsFromZones([
      z(['burger', 0.6], ['sandwich', 0.2], ['hot-dog', 0.1], ['fries', 0.05]),
      z(['fries', 0.7], ['burger', 0.2]),
      z(['burger', 0.8]),
      z(['salad', 0.15], ['burger', 0.1]),
      z(['not-food', 0.6], ['cake', 0.25]),
    ]);
    // salade (15 %) sous le seuil ; « pas de nourriture » ignoré ; gâteau trouvé en 2e dans une zone
    expect(r.proposals.map((p) => p.label.id)).toEqual(['burger', 'sandwich', 'hot-dog', 'fries', 'cake']);
    expect(r.proposals[0].p).toBe(0.8); // meilleure valeur entre image et zones
    expect(r.proposals[3].fromZone).toBe(true);
    expect(r.proposals[0].confidence).toBe('high');
    expect(r.notFood).toBe(false);
  });
  it('photo sans nourriture et résultat incertain signalés', () => {
    const r = proposalsFromZones([z(['not-food', 0.7], ['pizza', 0.1], ['salad', 0.05])]);
    expect(r.notFood).toBe(true);
    expect(r.uncertain).toBe(true);
    expect(r.proposals[0].confidence).toBe('low');
  });
  it('zones de la photo', () => {
    const r = zoneRects(1000, 800);
    expect(r).toHaveLength(5);
    expect(r[4]).toEqual({ x: 400, y: 320, w: 600, h: 480 });
  });
});
