/**
 * Saisie libre : « J'ai mangé un kebab avec des frites et un coca », « quelques chips ».
 * Analyse par règles simples, entièrement locale (aucune IA, aucun envoi réseau).
 * Ce qui n'est pas reconnu est signalé, jamais inventé.
 */
import type { Food, LineItem, Recipe } from './types';
import { CATALOG, getEntry, lineFromEntry, type CatalogEntry, type CountRange } from './catalog';
import { normalize } from './referenceFoods';
import { bestFoodMatch } from './matching';
import { lineFromFood } from './nutrition';
import { lineFromRecipe } from './recipes';
import { withEstimate } from './estimates';

export interface QuickMatch {
  text: string;
  kind: 'catalog' | 'recipe' | 'food' | 'unknown';
  entry?: CatalogEntry;
  recipe?: Recipe;
  food?: Food;
  portionId?: string;
  count?: number | CountRange;
  fraction?: number;
  /** La quantité n'a pas été précisée : portion par défaut, incertitude plus grande. */
  quantityGuessed: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12,
};
const VAGUE: Record<string, CountRange> = {
  quelques: { low: 2, mean: 3, high: 5 },
  plusieurs: { low: 2, mean: 4, high: 6 },
  beaucoup: { low: 4, mean: 6, high: 10 },
};
const FRACTIONS: [RegExp, number][] = [
  [/\b(la |une )?moitie\b/, 0.5],
  [/\bun quart\b/, 0.25],
  [/\bun tiers\b/, 1 / 3],
  [/\btrois quarts?\b/, 0.75],
];
/** Mots de portion → identifiant de portion du catalogue (si l'aliment la propose). */
const PORTION_WORDS: [RegExp, string[]][] = [
  [/\bpoignees?\b/, ['handful']],
  [/\bbols?\b/, ['bowl']],
  [/\b(petits? )?sachets? individuels?\b|\bpetits? (sachets?|paquets?)\b/, ['small-bag', 'small', 'pack']],
  [/\bgrands? (sachets?|paquets?)\b/, ['shared-bag', 'big-bag']],
  [/\bsachets?\b|\bpaquets?\b/, ['small-bag', 'pack', 'bag', 'small']],
  [/\bcornets?\b/, ['cone', 'small']],
  [/\bseaux?\b/, ['large']],
  [/\bbarquettes?\b/, ['tray']],
  [/\bcanettes?\b/, ['can']],
  [/\bbouteilles?\b/, ['bottle']],
  [/\bverres?\b/, ['glass']],
  [/\bgobelets?\b/, ['medium']],
  [/\bcarres?\b/, ['square']],
  [/\brangees?\b/, ['row']],
  [/\btablettes?\b/, ['bar']],
  [/\bboules?\b/, ['scoop']],
  [/\bparts?\b|\bmorceaux?\b|\bmorceau\b/, ['slice', 'piece', 'small']],
  [/\bassiettes?\b/, ['plate']],
];
const SIZE_WORDS: [RegExp, string[]][] = [
  [/\b(grande?s?|gros(se)?s?|xl|maxi)\b/, ['large', 'big', 'xl', 'big-bag', 'l']],
  [/\b(petite?s?|mini)\b/, ['small', 'mini', 'third']],
  [/\b(moyenne?s?)\b/, ['medium', 'standard', 'm']],
];

/** Découpe une phrase en éléments : « kebab avec frites et coca » → 3 éléments. */
export function splitQuickText(text: string): string[] {
  return normalize(text.replace(/[’']/g, ' '))
    .split(/\s*(?:,|;|\+|\bavec\b|\bet\b|\bpuis\b|\bplus\b|\bainsi que\b|\baccompagne d?e?\b)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

interface Hit { entry: CatalogEntry; start: number; end: number; score: number }

/** Toutes les mentions d'aliments du catalogue dans un segment, sans chevauchement. */
export function findCatalogHits(seg: string): Hit[] {
  const padded = ` ${seg} `;
  const candidates: Hit[] = [];
  for (const entry of CATALOG) {
    for (const phrase of entry.aliases.split(',').map((p) => normalize(p)).filter(Boolean)) {
      let from = 0;
      for (;;) {
        const i = padded.indexOf(` ${phrase} `, from);
        if (i < 0) break;
        candidates.push({ entry, start: i, end: i + phrase.length + 1, score: phrase.split(' ').length * 10 + phrase.length });
        from = i + 1;
      }
    }
  }
  const chosen: Hit[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (chosen.some((x) => c.start < x.end && x.start < c.end)) continue;
    if (chosen.some((x) => x.entry.id === c.entry.id)) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

export function matchCatalog(seg: string): CatalogEntry | null {
  const hits = findCatalogHits(seg);
  return hits.length ? [...hits].sort((a, b) => b.score - a.score)[0].entry : null;
}

function pickPortion(seg: string, e: CatalogEntry): string | undefined {
  for (const [re, ids] of PORTION_WORDS) {
    if (re.test(seg)) {
      const sized = SIZE_WORDS.find(([sr]) => sr.test(seg));
      if (sized) {
        const hit = sized[1].find((id) => ids.includes(id) && e.portions.some((p) => p.id === id));
        if (hit) return hit;
      }
      const id = ids.find((x) => e.portions.some((p) => p.id === x));
      if (id) return id;
    }
  }
  for (const [re, ids] of SIZE_WORDS) {
    if (re.test(seg)) {
      const id = ids.find((x) => e.portions.some((p) => p.id === x));
      if (id) return id;
    }
  }
  return undefined;
}

function pickCount(seg: string): number | CountRange | undefined {
  const digits = seg.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (digits) return parseFloat(digits[1].replace(',', '.'));
  for (const [w, r] of Object.entries(VAGUE)) if (new RegExp(`\\b${w}\\b`).test(seg)) return r;
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\b`).test(seg)) return n;
  return undefined;
}

export function parseQuickText(text: string, ctx: { recipes?: Recipe[]; foods?: Food[] } = {}): QuickMatch[] {
  const out: QuickMatch[] = [];
  for (const seg of splitQuickText(text)) {
    let fraction: number | undefined;
    for (const [re, f] of FRACTIONS) if (re.test(seg)) { fraction = f; break; }
    // Recettes personnelles d'abord : « mon couscous du vendredi ».
    const recipe = (ctx.recipes ?? []).find((r) => {
      const n = normalize(r.name);
      return n.length > 2 && ` ${seg} `.includes(` ${n} `);
    });
    if (recipe) {
      const c = pickCount(seg);
      out.push({ text: seg, kind: 'recipe', recipe, count: typeof c === 'number' ? c : 1, fraction, quantityGuessed: c == null });
      continue;
    }
    const hits = findCatalogHits(seg);
    if (hits.length) {
      // « kebab frites coca » : chaque mention devient un élément ; les mots de quantité
      // s'appliquent à la mention qui les suit (« deux churros et un coca »).
      const padded = ` ${seg} `;
      hits.forEach((h, i) => {
        const sub = padded.slice(i === 0 ? 0 : hits[i - 1].end, h.end).trim();
        const entry = h.entry;
        const portionId = pickPortion(sub, entry);
        const portion = entry.portions.find((p) => p.id === (portionId ?? entry.defaultPortion));
        // « un sachet de chips » : le « un » porte sur le sachet, pas sur des pièces.
        const count = portion?.piece ? pickCount(sub) : undefined;
        out.push({ text: sub, kind: 'catalog', entry, portionId, count, fraction, quantityGuessed: portionId == null && count == null });
      });
      continue;
    }
    const food = bestFoodMatch(ctx.foods ?? [], seg.replace(/\b(j ai|mange|bu|grignote|pris|des|du|de la|de|un|une|le|la|les)\b/g, ' ').trim());
    if (food && food.servings.length) {
      out.push({ text: seg, kind: 'food', food, quantityGuessed: true, fraction });
      continue;
    }
    out.push({ text: seg, kind: 'unknown', quantityGuessed: true });
  }
  return out;
}

/**
 * Transforme une correspondance en ligne de repas avec estimation moyenne / haute.
 * Quand la quantité n'a pas été précisée, la fourchette est plus large et l'estimation
 * haute est mise en avant.
 */
export function lineFromQuickMatch(m: QuickMatch, id: string): LineItem | null {
  if (m.kind === 'catalog' && m.entry) {
    let count = m.count;
    const portion = m.entry.portions.find((p) => p.id === (m.portionId ?? m.entry!.defaultPortion));
    // Nombre non précisé : on suppose le nombre habituel (« des churros » ≈ quelques-uns),
    // sinon une seule pièce. Doubler le nombre serait un pire cas, pas un scénario plausible :
    // le scénario haut tient déjà compte d'une pièce plus grande ou plus riche.
    if (portion?.piece && count == null) count = m.entry.defaultCount ?? 1;
    const line = lineFromEntry(m.entry, { portionId: m.portionId, count, fraction: m.fraction }, id);
    if (!line?.estimate) return line;
    const extra = m.quantityGuessed ? ['Quantité non précisée : portion habituelle supposée.'] : [];
    return withEstimate(line, {
      ...line.estimate,
      method: 'text',
      assumptions: [...extra, ...line.estimate.assumptions],
      highlightHigh: m.quantityGuessed ? `Quantité non précisée. ${line.estimate.highlightHigh ?? 'L’estimation haute tient compte d’une portion plus généreuse.'}` : line.estimate.highlightHigh,
    });
  }
  if (m.kind === 'recipe' && m.recipe) {
    return lineFromRecipe(m.recipe, m.fraction && !m.count ? { kind: 'fraction', fraction: m.fraction } : { kind: 'servings', servings: typeof m.count === 'number' ? m.count : 1, size: 'usual' }, id);
  }
  if (m.kind === 'food' && m.food && m.food.servings[0]) {
    return lineFromFood(m.food, { unit: m.food.servings[0].id, count: m.fraction ?? 1 }, id, 'rough');
  }
  return null;
}

export { getEntry };
