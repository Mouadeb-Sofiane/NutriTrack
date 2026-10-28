/** Grignotages, fête foraine, fast-food, sauces, boissons : portions simples, sans pesée. */
import { useEffect, useMemo, useState } from 'react';
import type { LineItem } from '../../domain/types';
import { CATALOG, CATALOG_GROUPS, getEntry, lineFromEntry, searchCatalog, type CatalogEntry, type CatalogGroup } from '../../domain/catalog';
import { chooseEstimate } from '../../domain/estimates';
import { newId } from '../../data/ids';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, Field, NumberInput, TextInput } from '../../ui/kit';
import { IconSearch } from '../../ui/icons';
import { EstimatePanel } from '../../ui/EstimatePanel';

export function CatalogSheet({ open, onClose, onAdd, initialGroup = 'snack', initialEntryId }: { open: boolean; onClose: () => void; onAdd: (item: LineItem) => void; initialGroup?: CatalogGroup; initialEntryId?: string }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<CatalogGroup>(initialGroup);
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  useEffect(() => { if (!open) { setQ(''); setEntry(null); } else { setGroup(initialGroup); if (initialEntryId) setEntry(getEntry(initialEntryId) ?? null); } }, [open, initialGroup, initialEntryId]);
  const list = useMemo(() => (q.trim() ? searchCatalog(q) : CATALOG.filter((e) => e.group === group)), [q, group]);

  return (
    <Sheet open={open} onClose={onClose} title={entry ? entry.name : 'Snacks, street food & fast-food'}>
      {entry ? (
        <EntryPicker entry={entry} onBack={() => setEntry(null)} onAdd={(it) => { onAdd(it); onClose(); }} />
      ) : (
        <>
          <div className="relative mb-2">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={20} />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Churros, chips, kebab, glace…" className="pl-11" aria-label="Rechercher" />
          </div>
          {!q.trim() && (
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              {CATALOG_GROUPS.map((g) => <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</Chip>)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {list.map((e) => (
              <button key={e.id} type="button" onClick={() => setEntry(e)} className="flex items-center gap-2.5 rounded-2xl bg-surface p-3 text-left active:bg-bg">
                <span className="text-2xl" aria-hidden>{e.emoji}</span>
                <span className="text-[14px] font-semibold leading-tight">{e.name}</span>
              </button>
            ))}
          </div>
          {!list.length && <p className="py-4 text-center text-sm text-muted">Pas dans cette liste. Essaie « Rechercher » (produits) ou « Écrire ce que j’ai mangé ».</p>}
          <p className="mt-3 text-[12px] text-muted">Valeurs d’ordre de grandeur. Chaque aliment est estimé avec une hypothèse moyenne et une hypothèse haute.</p>
        </>
      )}
    </Sheet>
  );
}

const FRACTIONS: [number, string][] = [[1, 'Tout'], [0.75, '¾'], [0.5, 'La moitié'], [0.25, 'Un quart']];

export function EntryPicker({ entry, onAdd, onBack, initial }: { entry: CatalogEntry; onAdd: (item: LineItem) => void; onBack?: () => void; initial?: LineItem }) {
  const [portionId, setPortionId] = useState(initial?.estimate?.portionId && initial.estimate.portionId !== 'custom' ? initial.estimate.portionId : entry.defaultPortion);
  const [count, setCount] = useState<number | null>(initial?.estimate?.count ?? entry.defaultCount?.mean ?? 1);
  const [fraction, setFraction] = useState(initial?.estimate?.fraction ?? 1);
  const [custom, setCustom] = useState<number | null>(null);
  const [useCustom, setUseCustom] = useState(initial?.estimate?.portionId === 'custom');
  const [choice, setChoice] = useState<{ c: 'mean' | 'high' | 'custom'; v?: number | null }>({ c: initial?.estimate?.chosen ?? 'mean', v: initial?.estimate?.custom?.kcal });
  const portion = entry.portions.find((p) => p.id === portionId) ?? entry.portions[0];

  let item = lineFromEntry(entry, useCustom ? { customAmount: custom, fraction } : { portionId, count: portion.piece ? count ?? undefined : undefined, fraction }, initial?.id ?? newId('li'));
  if (item && useCustom && custom == null) item = null;
  if (item && portion.piece && !useCustom && (!count || count <= 0)) item = null;
  if (item && choice.c !== 'mean') item = chooseEstimate(item, choice.c, choice.v);

  return (
    <div>
      <Field label="Portion">
        <div className="flex flex-wrap gap-2">
          {entry.portions.map((p) => <Chip key={p.id} active={!useCustom && portionId === p.id} onClick={() => { setUseCustom(false); setPortionId(p.id); }}>{p.label}</Chip>)}
          <Chip active={useCustom} onClick={() => setUseCustom(true)}>Quantité connue ({entry.basis})</Chip>
        </div>
      </Field>
      {useCustom ? (
        <Field label={`Quantité (${entry.basis})`}><NumberInput value={custom} onChange={setCustom} suffix={entry.basis} autoFocus /></Field>
      ) : portion.piece ? (
        <Field label="Combien ?">
          <div className="flex items-center gap-2">
            <Button variant="secondary" aria-label="Moins" onClick={() => setCount(Math.max(1, (count ?? 1) - 1))}>−</Button>
            <NumberInput value={count} onChange={setCount} className="text-center" aria-label="Nombre" />
            <Button variant="secondary" aria-label="Plus" onClick={() => setCount((count ?? 0) + 1)}>+</Button>
          </div>
        </Field>
      ) : null}
      <Field label="Part mangée">
        <div className="flex flex-wrap gap-2">{FRACTIONS.map(([f, l]) => <Chip key={f} active={fraction === f} onClick={() => setFraction(f)}>{l}</Chip>)}</div>
      </Field>
      {item?.estimate && (
        <div className="mb-3">
          <EstimatePanel estimate={item.estimate} onChoose={(c, v) => setChoice({ c, v })} />
        </div>
      )}
      <div className="flex gap-2">
        {onBack && <Button variant="secondary" onClick={onBack}>Retour</Button>}
        <Button className="flex-1" disabled={!item} onClick={() => item && onAdd(item)}>{initial ? 'Valider' : 'Ajouter'}</Button>
      </div>
    </div>
  );
}
