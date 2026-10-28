/** Dupliquer un repas déjà enregistré (les valeurs sont recopiées telles quelles). */
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { LineItem, MealEntry } from '../../domain/types';
import { db } from '../../data/db';
import { formatDayLabel } from '../../domain/dates';
import { fmtKcal } from '../../domain/nutrition';
import { mealTotals, recentDistinctItems } from '../../domain/stats';
import { quantityText } from '../MealComposer';
import { EstimateBadge } from '../../ui/EstimatePanel';
import { MEAL_LABEL } from '../labels';
import { Sheet } from '../../ui/Sheet';
import { EmptyState, Segmented } from '../../ui/kit';
import { IconClock } from '../../ui/icons';

export function RecentSheet({ open, onClose, onPick, onPickItem }: { open: boolean; onClose: () => void; onPick: (m: MealEntry) => void; onPickItem: (it: LineItem) => void }) {
  const [tab, setTab] = useState<'meals' | 'items'>('meals');
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
    <Sheet open={open} onClose={onClose} title="Récents">
      <Segmented value={tab} onChange={setTab} className="mb-3" options={[{ value: 'meals', label: 'Repas entiers' }, { value: 'items', label: 'Aliments' }]} />
      {tab === 'items' ? (
        recent.length === 0 ? <EmptyState icon={<IconClock />} title="Aucun aliment récent" /> : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {recentDistinctItems(recent).map(({ item, date }) => (
              <li key={`${item.id}-${date}`}>
                <button type="button" onClick={() => { onPickItem(item); onClose(); }} className="w-full px-3.5 py-3 text-left active:bg-bg">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{fmtKcal(item.nutrients.kcal)} kcal</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">{quantityText(item)} · {formatDayLabel(date).toLowerCase()} {item.estimate && <EstimateBadge estimate={item.estimate} />}</div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : unique.length === 0 ? (
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
