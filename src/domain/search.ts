/**
 * Moteur de recherche hors ligne, commun à toutes les sources (aliments, plats,
 * boissons, produits, recettes personnelles, éléments récents).
 *
 * - insensible aux accents, à la casse, aux pluriels simples (« pâtes » = « pate ») ;
 * - tolère les fautes de frappe (distance de Damerau-Levenshtein, bornée selon la longueur) ;
 * - cherche aussi dans les synonymes et noms régionaux / translittérés ;
 * - tous les mots significatifs de la requête doivent être trouvés (sinon les résultats
 *   mélangeraient des aliments sans rapport) ; les mots de liaison sont ignorés ;
 * - classe d'abord les noms qui commencent par la requête, puis les plus courts (génériques).
 */
import { normalize } from './referenceFoods';

export type SearchKind = 'food' | 'dish' | 'drink' | 'product' | 'recipe' | 'catalog' | 'recent';

export interface SearchDoc<T = unknown> {
  id: string;
  kind: SearchKind;
  name: string;
  /** Synonymes, noms régionaux, orthographes alternatives (séparés par des virgules ou espaces). */
  synonyms?: string;
  category?: string;
  /** Bonus de classement (favori, usage fréquent, aliment générique…). */
  boost?: number;
  ref: T;
}

interface Indexed<T> {
  doc: SearchDoc<T>;
  name: string;
  nameTokens: string[];
  synTokens: string[];
  catTokens: string[];
  synPhrases: string[];
}

export interface SearchIndex<T> {
  items: Indexed<T>[];
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'un', 'une', 'et', 'a', 'au', 'aux', 'en', 'avec', 'sans', 'sur', 'pour', 'ou', 'the', 'with', 'of', 'and', 'plus']);

/** Racine grossière : supprime le pluriel (s/x final) — suffisant pour la recherche. */
export function stem(w: string): string {
  if (w.length > 3 && /(aux)$/.test(w)) return `${w.slice(0, -3)}al`;
  if (w.length > 3 && /[sx]$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokens(s: string, keepStop = false): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w && (keepStop || !STOP.has(w)))
    .map(stem);
}

/** Distance de Damerau-Levenshtein (transpositions adjacentes), interrompue au-delà de `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Nombre de fautes tolérées selon la longueur du mot saisi. */
function tolerance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

/** Score d'un mot de la requête contre une liste de mots (0 = absent). */
function tokenScore(q: string, list: string[], last: boolean): number {
  let best = 0;
  const tol = tolerance(q.length);
  for (const t of list) {
    if (t === q) return 3;
    // Préfixe : surtout utile pour le dernier mot en cours de saisie.
    if (t.startsWith(q) && q.length >= 2) best = Math.max(best, last ? 2.4 : 1.8);
    else if (tol && t.length >= 3) {
      const d = editDistance(q, t.length > q.length + 2 && last ? t.slice(0, q.length) : t, tol);
      if (d <= tol) best = Math.max(best, d === 1 ? 1.5 : 1);
    }
  }
  return best;
}

export function buildIndex<T>(docs: SearchDoc<T>[]): SearchIndex<T> {
  return {
    items: docs.map((doc) => {
      const syn = doc.synonyms ?? '';
      return {
        doc,
        name: normalize(doc.name),
        nameTokens: tokens(doc.name),
        synTokens: tokens(syn),
        catTokens: tokens(doc.category ?? ''),
        synPhrases: syn.split(/[,;|]/).map((p) => normalize(p)).filter(Boolean),
      };
    }),
  };
}

export interface SearchHit<T> {
  doc: SearchDoc<T>;
  score: number;
}

export function search<T>(index: SearchIndex<T>, query: string, opts: { limit?: number; kinds?: SearchKind[] } = {}): SearchHit<T>[] {
  const limit = opts.limit ?? 40;
  const nq = normalize(query);
  const qt = tokens(query);
  if (!qt.length) return [];
  const kinds = opts.kinds ? new Set(opts.kinds) : null;
  const hits: SearchHit<T>[] = [];
  for (const it of index.items) {
    if (kinds && !kinds.has(it.doc.kind)) continue;
    let total = 0;
    let ok = true;
    for (let i = 0; i < qt.length; i++) {
      const q = qt[i];
      const last = i === qt.length - 1;
      const sName = tokenScore(q, it.nameTokens, last);
      const sSyn = tokenScore(q, it.synTokens, last) * 0.85;
      const sCat = tokenScore(q, it.catTokens, last) * 0.4;
      const s = Math.max(sName, sSyn, sCat);
      if (s === 0) { ok = false; break; }
      total += s;
    }
    if (!ok) continue;
    let score = total / qt.length;
    // Le nom commence par le premier mot cherché (« champignon… » avant « pâtes aux champignons »).
    if (it.nameTokens.length && tokenScore(qt[0], [it.nameTokens[0]], qt.length === 1) > 0) score += 1;
    if (it.name === nq) score += 3;
    else if (it.name.startsWith(nq)) score += 2;
    else if (it.name.includes(nq)) score += 1;
    if (it.synPhrases.some((p) => p === nq)) score += 2.5;
    else if (it.synPhrases.some((p) => p.startsWith(nq))) score += 1;
    // Les noms courts (génériques) passent avant les variantes très détaillées.
    score -= Math.min(1.2, it.nameTokens.length * 0.08);
    score += it.doc.boost ?? 0;
    hits.push({ doc: it.doc, score });
  }
  hits.sort((a, b) => b.score - a.score || a.doc.name.length - b.doc.name.length);
  return hits.slice(0, limit);
}

/**
 * Requête composée (« pain beurre », « café avec sucre ») : si aucun résultat ne
 * couvre tous les mots, propose la meilleure combinaison de deux éléments.
 */
export function searchCombo<T>(index: SearchIndex<T>, query: string, opts: { kinds?: SearchKind[] } = {}): SearchDoc<T>[] | null {
  const words = normalize(query).split(' ').filter(Boolean);
  // Découpe explicite sur « avec », « et », « + » ; sinon on essaie chaque coupure.
  const raw = normalize(query.replace(/\+/g, ' avec '));
  const explicit = raw.split(/\b(?:avec|et|plus)\b/).map((s) => s.trim()).filter(Boolean);
  const splits: [string, string][] = [];
  if (explicit.length === 2) splits.push([explicit[0], explicit[1]]);
  const content = words.filter((w) => !STOP.has(w));
  for (let i = 1; i < content.length; i++) splits.push([content.slice(0, i).join(' '), content.slice(i).join(' ')]);
  let best: { docs: SearchDoc<T>[]; score: number } | null = null;
  for (const [a, b] of splits) {
    const ha = search(index, a, { limit: 1, kinds: opts.kinds })[0];
    const hb = search(index, b, { limit: 1, kinds: opts.kinds })[0];
    if (!ha || !hb || ha.doc.id === hb.doc.id) continue;
    const s = Math.min(ha.score, hb.score);
    if (!best || s > best.score) best = { docs: [ha.doc, hb.doc], score: s };
  }
  return best && best.score >= 2 ? best.docs : null;
}
