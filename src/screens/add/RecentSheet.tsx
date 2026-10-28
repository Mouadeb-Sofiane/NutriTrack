/** Dupliquer un repas déjà enregistré (les valeurs sont recopiées telles quelles). */
import { useLiveQuery } from 'dexie-react-hooks';
import type { MealEntry } from '../../domain/types';
import { db } from '../../data/db';
import { formatDayLabel } from '../../domain/dates';
import { fmtKcal } from '../../domain/nutrition';
import { mealTotals } from '../../domain/stats';
import { MEAL_LABEL } from '../labels';
import { Sheet } from '../../ui/Sheet';
import { EmptyState } from '../../ui/kit';
import { IconClock } from '../../ui/icons';

export function RecentSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: MealEntry) => void }) {
  const recent = useLiveQuery(() => (open ? db.meals.orderBy('createdAt').reverse().limit(60).toArray() : Promise.resolve([] as MealEntry[])), [open]) ?? [];
  // Un seul exemplaire par composition identique.
  const seen = new Set<string>();
  const unique = recent.filter((m) => {
    const key = m.items.map((i) => `${i.name}|${Math.round(i.nutrients.kcal ?? 0)}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 25);
  return (
    <Sheet open={open} onClose={onClose} title="Repas récents">
      {unique.length === 0 ? (
        <EmptyState icon={<IconClock />} title="Aucun repas enregistré" text="Les repas que tu enregistres apparaîtront ici pour être dupliqués en un geste." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {unique.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => { onPick(m); onClose(); }} className="w-full px-3.5 py-3 text-left active:bg-bg">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{m.name || m.items.map((i) => i.name).join(', ')}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtKcal(mealTotals(m).kcal)} kcal</span>
                </div>
                <div className="text-[12.5px] text-muted">{MEAL_LABEL[m.mealType]} · {formatDayLabel(m.date)}{m.place === 'restaurant' ? ' · restaurant' : ''}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
