/** Correction d'une ligne avant enregistrement (quantité, précision ou valeurs). */
import { useEffect, useState } from 'react';
import { db } from '../../data/db';
import { newId } from '../../data/ids';
import { expandRecipeLine } from '../../domain/recipes';
import type { LineItem, Nutrients, Precision } from '../../domain/types';
import { cleanNutrients, fmtKcal, PRECISION_LABEL, rangeFor, rescaleLine, withPrecision } from '../../domain/nutrition';
import { Sheet } from '../../ui/Sheet';
import { Button, Field, NumberInput, Segmented, SourceBadge, TextInput } from '../../ui/kit';
import { chooseEstimate } from '../../domain/estimates';
import { getEntry } from '../../domain/catalog';
import { EstimatePanel } from '../../ui/EstimatePanel';
import { EntryPicker } from './CatalogSheet';

export function ItemEditSheet({ item, onClose, onSave, onDelete, onReplace }: { item: LineItem | null; onClose: () => void; onSave: (it: LineItem, corrected: boolean) => void; onDelete: () => void; onReplace?: (items: LineItem[]) => void }) {
  const [expanded, setExpanded] = useState<LineItem[] | null>(null);
  useEffect(() => {
    setExpanded(null);
    if (!item?.recipeId || !item.consumption || !onReplace) return;
    db.recipes.get(item.recipeId).then((r) => r && setExpanded(expandRecipeLine(item, r, () => newId('li'))));
  }, [item, !!onReplace]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<LineItem | null>(item);
  const [qty, setQty] = useState<number | null>(item?.quantity ?? null);
  const [manual, setManual] = useState(false);
  const [portionEdit, setPortionEdit] = useState(false);
  useEffect(() => { setDraft(item); setQty(item?.quantity ?? null); setManual(false); setPortionEdit(false); }, [item]);
  if (!item || !draft) return null;
  const entry = draft.estimate?.catalogId ? getEntry(draft.estimate.catalogId) : undefined;
  if (portionEdit && entry) {
    return (
      <Sheet open onClose={onClose} title={`Portion · ${entry.name}`}>
        <EntryPicker entry={entry} initial={draft} onBack={() => setPortionEdit(false)} onAdd={(it) => { setDraft({ ...it, note: draft.note }); setQty(it.quantity); setPortionEdit(false); }} />
      </Sheet>
    );
  }

  const scalable = item.quantity != null && item.quantity > 0;
  const applyQty = (v: number | null) => {
    setQty(v);
    if (v && v > 0 && scalable) setDraft((d) => d && rescaleLine({ ...d, quantity: d.quantity }, v));
  };
  const setN = (k: keyof Nutrients) => (v: number | null) => setDraft((d) => {
    if (!d) return d;
    if (d.estimate) {
      // Corriger une estimation = retenir une valeur personnalisée (les estimations restent stockées).
      const custom = cleanNutrients({ ...d.nutrients, [k]: v });
      const next = { ...d.estimate, chosen: 'custom' as const, custom };
      return { ...d, estimate: next, nutrients: custom, kcalRange: custom.kcal != null ? { min: custom.kcal, max: custom.kcal } : null };
    }
    const nutrients = cleanNutrients({ ...d.nutrients, [k]: v });
    return { ...d, nutrients, kcalRange: rangeFor(nutrients.kcal, d.precision) };
  });
  const unitText = item.unit === 'g' || item.unit === 'ml' ? item.unit : item.unitLabel ? `× ${item.unitLabel}` : '×';

  return (
    <Sheet open onClose={onClose} title="Modifier l’aliment" footer={
      <div className="flex gap-2">
        <Button variant="danger" onClick={onDelete}>Retirer</Button>
        <Button className="flex-1" disabled={qty != null && qty <= 0} onClick={() => onSave(draft, manual || draft.precision !== item.precision || qty !== item.quantity || draft.estimate?.chosen !== item.estimate?.chosen || draft.unitLabel !== item.unitLabel)}>Valider</Button>
      </div>
    }>
      <Field label="Nom"><TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
      <div className="mb-3 flex items-center gap-2 text-[12.5px] text-muted"><SourceBadge source={draft.source} /> {draft.source.label}</div>
      {draft.estimate && (
        <div className="mb-4">
          <div className="mb-1.5 text-sm font-semibold">Valeur retenue</div>
          <EstimatePanel estimate={draft.estimate} onChoose={(c, v) => setDraft(chooseEstimate(draft, c, v))} />
        </div>
      )}
      {expanded && onReplace && (
        <div className="mb-4">
          <Button variant="secondary" block onClick={() => onReplace(expanded)}>Ajuster les ingrédients pour ce repas</Button>
          <p className="mt-1 text-[12px] text-muted">Remplace cette part par ses {expanded.length} ingrédients (à l’échelle de ta part), modifiables un par un. La recette enregistrée n’est pas modifiée.</p>
        </div>
      )}
      {entry && (
        <Button variant="secondary" block className="mb-4" onClick={() => setPortionEdit(true)}>Changer la portion ou la quantité ({draft.unitLabel})</Button>
      )}
      {entry && !scalable ? null : scalable ? (
        <Field label="Quantité" hint="Les valeurs sont recalculées proportionnellement." error={qty != null && qty <= 0 ? 'La quantité doit être positive.' : null}>
          <NumberInput value={qty} onChange={applyQty} suffix={item.unit === 'g' || item.unit === 'ml' ? item.unit : '×'} />
          {item.unit !== 'g' && item.unit !== 'ml' && <p className="mt-1 text-[12.5px] text-muted">{unitText}</p>}
        </Field>
      ) : (
        <p className="mb-3 text-[13px] text-muted">Quantité non chiffrée : modifie directement les valeurs ci-dessous.</p>
      )}
      <Field label="Précision">
        <Segmented<Precision> value={draft.precision} onChange={(p) => setDraft(withPrecision(draft, p))} options={[{ value: 'exact', label: 'Pesé / lu' }, { value: 'approx', label: 'À peu près' }, { value: 'rough', label: 'À l’œil' }]} />
        <p className="mt-1 text-[12.5px] text-muted">{PRECISION_LABEL[draft.precision]}{draft.kcalRange && draft.precision !== 'exact' ? ` · ${fmtKcal(draft.kcalRange.min)}–${fmtKcal(draft.kcalRange.max)} kcal` : ''}</p>
      </Field>
      {!manual ? (
        <Button variant="ghost" size="sm" onClick={() => setManual(true)}>Corriger les valeurs nutritionnelles</Button>
      ) : (
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Calories"><NumberInput value={round(draft.nutrients.kcal)} onChange={setN('kcal')} suffix="kcal" /></Field>
          <Field label="Protéines"><NumberInput value={round(draft.nutrients.protein)} onChange={setN('protein')} suffix="g" /></Field>
          <Field label="Glucides"><NumberInput value={round(draft.nutrients.carbs)} onChange={setN('carbs')} suffix="g" /></Field>
          <Field label="Lipides"><NumberInput value={round(draft.nutrients.fat)} onChange={setN('fat')} suffix="g" /></Field>
        </div>
      )}
      <Field label="Note (facultatif)"><TextInput value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value || undefined })} /></Field>
    </Sheet>
  );
}

function round(v: number | null) {
  return v == null ? null : Math.round(v * 10) / 10;
}
