/** « Qu'as-tu mangé ? » : saisie libre analysée localement, avec moyenne / haute par élément. */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LineItem } from '../../domain/types';
import { db } from '../../data/db';
import { newId } from '../../data/ids';
import { REFERENCE_FOODS } from '../../domain/referenceFoods';
import { lineFromQuickMatch, parseQuickText } from '../../domain/quickText';
import { chooseEstimate, hasMeaningfulGap, scenarioTotals } from '../../domain/estimates';
import { fmtKcal } from '../../domain/nutrition';
import { Sheet } from '../../ui/Sheet';
import { Button, Notice, Segmented, TextArea } from '../../ui/kit';
import { EntryPicker } from './CatalogSheet';
import { getEntry } from '../../domain/catalog';

const EXAMPLES = ['kebab avec frites et un coca', 'quelques chips devant un film', 'deux churros et un pop-corn sucré', 'une part de pizza et la moitié des frites'];

export function QuickTextSheet({ open, onClose, onAdd, initialText = '' }: { open: boolean; onClose: () => void; onAdd: (items: LineItem[], suggestedName: string) => void; initialText?: string }) {
  const [text, setText] = useState(initialText);
  const [overrides, setOverrides] = useState<Record<number, LineItem>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const foods = useLiveQuery(() => db.foods.toArray(), []) ?? [];
  useEffect(() => { if (open) { setText(initialText); setOverrides({}); setEditing(null); } }, [open, initialText]);

  const matches = useMemo(() => parseQuickText(text, { recipes, foods: [...foods, ...REFERENCE_FOODS] }), [text, recipes, foods]);
  const lines = useMemo(() => matches.map((m, i) => overrides[i] ?? lineFromQuickMatch(m, `q${i}`)), [matches, overrides]);
  const found = lines.filter((l): l is LineItem => !!l);
  const totals = scenarioTotals(found);
  const unknown = matches.filter((_, i) => !lines[i]);
  const setLine = (i: number, l: LineItem) => setOverrides((o) => ({ ...o, [i]: l }));

  const edited = editing != null ? lines[editing] : null;
  const editedEntry = edited?.estimate?.catalogId ? getEntry(edited.estimate.catalogId) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title="Qu’as-tu mangé ?" footer={editing == null && found.length > 0 ? (
      <Button block onClick={() => { onAdd(found.map((l) => ({ ...l, id: newId('li') })), suggestName(text)); onClose(); }}>
        Ajouter {found.length} élément{found.length > 1 ? 's' : ''} · {fmtKcal(totals.retained)} kcal
      </Button>
    ) : undefined}>
      {editing != null && edited && editedEntry ? (
        <EntryPicker entry={editedEntry} initial={edited} onBack={() => setEditing(null)} onAdd={(it) => { setLine(editing, it); setEditing(null); }} />
      ) : (
        <>
          <TextArea autoFocus value={text} onChange={(e) => { setText(e.target.value); setOverrides({}); }} rows={2} placeholder="Ex. un kebab avec des frites et un coca" aria-label="Ce que j’ai mangé" />
          {!text.trim() && (
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => setText(e)} className="rounded-full bg-surface px-3 py-1.5 text-[13px] text-muted active:bg-bg">« {e} »</button>)}
            </div>
          )}
          <p className="mt-2 text-[12px] text-muted">Analyse faite sur ton téléphone, à partir de règles simples (pas d’IA). Vérifie chaque élément.</p>

          {matches.length > 0 && (
            <ul className="mt-3 space-y-2">
              {matches.map((m, i) => {
                const l = lines[i];
                if (!l) return (
                  <li key={i} className="rounded-2xl bg-surface px-3.5 py-3 text-[13.5px]">
                    <span className="font-medium">« {m.text} »</span> <span className="text-warn">non reconnu</span>
                    <div className="text-[12px] text-muted">Ajoute-le ensuite avec « Rechercher », « Snacks » ou « Saisie manuelle ».</div>
                  </li>
                );
                const e = l.estimate;
                return (
                  <li key={i} className="rounded-2xl bg-surface px-3.5 py-3">
                    <button type="button" className="w-full text-left" onClick={() => e?.catalogId && setEditing(i)} disabled={!e?.catalogId}>
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{l.name}</span>
                        <span className="shrink-0 font-bold tabular-nums">{fmtKcal(l.nutrients.kcal)} kcal</span>
                      </div>
                      <div className="text-[12.5px] text-muted">{l.unitLabel}{e?.catalogId ? ' · modifier' : ''}</div>
                    </button>
                    {e && hasMeaningfulGap(e) && (
                      <div className="mt-2">
                        <Segmented value={e.chosen === 'high' ? 'high' : 'mean'} onChange={(c) => setLine(i, chooseEstimate(l, c))}
                          options={[{ value: 'mean', label: `Moyenne ${fmtKcal(e.mean.kcal)}` }, { value: 'high', label: `Haute ${fmtKcal(e.high.kcal)}` }]} />
                        {e.highlightHigh && <p className="mt-1.5 text-[12px] leading-snug text-[#7a3d06]">⚠️ {e.highlightHigh}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {found.length > 0 && (
            <div className="mt-3 rounded-2xl bg-brand-soft px-4 py-3 text-[13.5px] text-brand-strong">
              <div className="flex justify-between"><span>Scénario moyen</span><b className="tabular-nums">{fmtKcal(totals.mean)} kcal</b></div>
              <div className="flex justify-between"><span>Scénario haut</span><b className="tabular-nums">{fmtKcal(totals.high)} kcal</b></div>
              <div className="flex justify-between border-t border-brand/20 pt-1 mt-1"><span>Valeur retenue</span><b className="tabular-nums">{fmtKcal(totals.retained)} kcal</b></div>
            </div>
          )}
          {unknown.length > 0 && found.length > 0 && <Notice tone="warn" className="mt-3">{unknown.length} élément(s) non reconnu(s) ne sont pas comptés.</Notice>}
        </>
      )}
    </Sheet>
  );
}

function suggestName(text: string): string {
  const t = text.trim().replace(/^j[’']?ai (mangé|grignoté|pris|bu)\s*/i, '');
  if (!t || t.length > 60) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
