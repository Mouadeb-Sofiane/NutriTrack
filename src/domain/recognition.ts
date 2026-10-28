/**
 * Reconnaissance locale (CLIP) : classement des libellés et propositions.
 *
 * Le modèle produit un vecteur par zone de la photo (image entière + 4 quarts). On le
 * compare aux vecteurs pré-calculés des libellés (foodLabels.json). Le score affiché est
 * une PROBABILITÉ RELATIVE entre nos libellés, pas une certitude : si l'aliment n'est pas
 * dans la liste, le modèle choisira quand même le libellé le plus proche.
 * Le modèle ne mesure ni poids, ni huile, ni ingrédients cachés : la portion est choisie
 * par l'utilisateur, avec les estimations moyenne et haute habituelles.
 */
import raw from './foodLabels.json';

export type LabelTarget =
  | { kind: 'catalog'; id: string }
  | { kind: 'template'; id: string }
  | { kind: 'food'; id: string };

export interface FoodLabel {
  id: string;
  fr: string;
  prompts: string[];
  target: LabelTarget;
}

export const FOOD_LABELS = raw.labels as FoodLabel[];
export const NOT_FOOD = 'not-food';
const BY_ID = new Map(FOOD_LABELS.map((l) => [l.id, l]));
export const getLabel = (id: string) => BY_ID.get(id);

export interface Scored {
  id: string;
  p: number;
}

/** Similarité cosinus × échelle, puis softmax : une distribution par zone. */
export function scoreZones(embeddings: Float32Array, zones: number, labels: Float32Array, ids: string[], logitScale = 100): Scored[][] {
  const dim = labels.length / ids.length;
  const out: Scored[][] = [];
  for (let z = 0; z < zones; z++) {
    const e = embeddings.subarray(z * dim, (z + 1) * dim);
    let n = 0;
    for (let k = 0; k < dim; k++) n += e[k] * e[k];
    n = Math.sqrt(n) || 1;
    const logits = ids.map((_, j) => {
      let s = 0;
      for (let k = 0; k < dim; k++) s += e[k] * labels[j * dim + k];
      return (logitScale * s) / n;
    });
    const max = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    out.push(ids.map((id, j) => ({ id, p: exps[j] / sum })).sort((a, b) => b.p - a.p));
  }
  return out;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Proposal {
  label: FoodLabel;
  /** Probabilité relative la plus forte observée (image entière ou zone). */
  p: number;
  confidence: Confidence;
  /** Trouvé dans une zone de la photo plutôt que sur l'image entière. */
  fromZone: boolean;
}

export interface RecognitionResult {
  proposals: Proposal[];
  /** La photo ressemble davantage à « pas de nourriture » qu'à nos libellés. */
  notFood: boolean;
  /** Aucune proposition franche : à présenter comme très incertain. */
  uncertain: boolean;
}

export function confidenceOf(p: number): Confidence {
  return p >= 0.5 ? 'high' : p >= 0.2 ? 'medium' : 'low';
}

/**
 * Règle évaluée sur 258 photos réelles (Open Images, 43 types d'aliments) : les 3 meilleurs
 * libellés de l'image entière + les 2 meilleurs de chaque zone s'ils dépassent 20 %.
 * L'aliment présent figure parmi ces propositions dans 93 % des cas (87 % sur les photos à
 * plusieurs aliments), pour ≈ 3,6 propositions par photo.
 */
export function proposalsFromZones(zones: Scored[][], opts: { top?: number; zoneThreshold?: number; perZone?: number } = {}): RecognitionResult {
  const top = opts.top ?? 3;
  const thr = opts.zoneThreshold ?? 0.2;
  const perZone = opts.perZone ?? 2;
  const whole = zones[0] ?? [];
  const food = whole.filter((s) => s.id !== NOT_FOOD);
  const notFoodP = whole.find((s) => s.id === NOT_FOOD)?.p ?? 0;
  const picked = new Map<string, Proposal>();
  for (const s of food.slice(0, top)) {
    const label = getLabel(s.id);
    if (label) picked.set(s.id, { label, p: s.p, confidence: confidenceOf(s.p), fromZone: false });
  }
  for (const z of zones.slice(1)) {
    for (const s of z.filter((x) => x.id !== NOT_FOOD).slice(0, perZone)) {
      if (s.p < thr) continue;
      const label = getLabel(s.id);
      if (!label) continue;
      const cur = picked.get(s.id);
      if (!cur) picked.set(s.id, { label, p: s.p, confidence: confidenceOf(s.p), fromZone: true });
      else if (s.p > cur.p) picked.set(s.id, { ...cur, p: s.p, confidence: confidenceOf(s.p) });
    }
  }
  const proposals = [...picked.values()].sort((a, b) => Number(a.fromZone) - Number(b.fromZone) || b.p - a.p);
  return {
    proposals,
    notFood: notFoodP > (food[0]?.p ?? 0),
    uncertain: (food[0]?.p ?? 0) < 0.2,
  };
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: 'très probable', medium: 'probable', low: 'possible' };

/** Zones analysées : image entière puis 4 quarts recouvrants (60 % de côté). */
export function zoneRects(w: number, h: number): { x: number; y: number; w: number; h: number }[] {
  const cw = Math.round(w * 0.6);
  const ch = Math.round(h * 0.6);
  return [
    { x: 0, y: 0, w, h },
    { x: 0, y: 0, w: cw, h: ch },
    { x: w - cw, y: 0, w: cw, h: ch },
    { x: 0, y: h - ch, w: cw, h: ch },
    { x: w - cw, y: h - ch, w: cw, h: ch },
  ];
}

/** Recettes personnelles dont le nom évoque un plat proposé (« couscous » → « Couscous familial »). */
export function recipesForProposals<R extends { name: string }>(proposals: Proposal[], recipes: R[]): R[] {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  const STOP = new Set(['plat', 'avec', 'sauce', 'et', 'de', 'la', 'le', 'les', 'des', 'du', 'aux', 'maison']);
  const words = new Set(proposals.flatMap((p) => [p.label.id, ...norm(p.label.fr).split(' ')]).map((w) => w.replace(/s$/, '')).filter((w) => w.length > 3 && !STOP.has(w)));
  return recipes.filter((r) => norm(r.name).split(' ').some((w) => words.has(w.replace(/s$/, '')))).slice(0, 4);
}
