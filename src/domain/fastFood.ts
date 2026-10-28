/**
 * Repas de restauration rapide en une seule opération : plat principal, accompagnement,
 * sauces, boisson, suppléments. Chaque composant devient une ligne distincte (aucun double
 * comptage : le plat principal n'inclut ni les frites ni la boisson).
 */
import type { LineItem, Nutrients } from './types';
import { getEntry, lineFromEntry } from './catalog';
import { manualLine } from './nutrition';

export interface FastFoodComponent {
  catalogId: string;
  portionId?: string;
  count?: number;
  /** Part mangée (1 = tout, 0,5 = la moitié…). */
  fraction?: number;
  /** Valeurs officielles de l'enseigne, si l'utilisateur les a. Remplacent l'estimation. */
  official?: Nutrients | null;
  officialSource?: string;
}

export function fastFoodLines(components: FastFoodComponent[], newId: () => string): LineItem[] {
  const out: LineItem[] = [];
  for (const c of components) {
    const entry = getEntry(c.catalogId);
    if (!entry) continue;
    if (c.official && c.official.kcal != null) {
      const f = c.fraction ?? 1;
      out.push(manualLine(newId(), entry.name, {
        kcal: c.official.kcal * f,
        protein: c.official.protein == null ? null : c.official.protein * f,
        carbs: c.official.carbs == null ? null : c.official.carbs * f,
        fat: c.official.fat == null ? null : c.official.fat * f,
      }, {
        precision: 'exact',
        source: { kind: 'official', label: c.officialSource?.trim() ? `Valeurs officielles : ${c.officialSource.trim()}` : 'Valeurs officielles de l’enseigne (saisies)' },
        unit: 'portion',
        unitLabel: f !== 1 ? `${Math.round(f * 100)} % mangé` : 'portion de l’enseigne',
      }));
      continue;
    }
    const line = lineFromEntry(entry, { portionId: c.portionId, count: c.count, fraction: c.fraction }, newId());
    if (line) out.push(line);
  }
  return out;
}

export function fastFoodName(components: FastFoodComponent[]): string {
  return components.map((c) => getEntry(c.catalogId)?.name.replace(/ \(.*\)$/, '')).filter(Boolean).join(', ');
}
