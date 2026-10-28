/** Menu de restauration rapide en une opération : plat, accompagnement, sauces, boisson. */
import { useEffect, useMemo, useState } from 'react';
import type { LineItem, Nutrients } from '../../domain/types';
import { CATALOG, getEntry } from '../../domain/catalog';
import { fastFoodLines, fastFoodName, type FastFoodComponent } from '../../domain/fastFood';
import { scenarioTotals } from '../../domain/estimates';
import { fmtKcal } from '../../domain/nutrition';
import { newId } from '../../data/ids';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, Field, NumberInput, TextInput, Toggle } from '../../ui/kit';

const MAINS = CATALOG.filter((e) => e.role === 'main');
const SAUCES = CATALOG.filter((e) => e.role === 'sauce');
const DRINKS = CATALOG.filter((e) => e.role === 'drink');
const EXTRAS = CATALOG.filter((e) => e.group === 'extra' && e.id === 'cheese-extra');
const FRACTIONS: [number, string][] = [[1, 'Tout'], [0.75, '¾'], [0.5, 'La moitié'], [0.25, 'Un quart']];

export function FastFoodSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (items: LineItem[], name: string) => void }) {
  const [main, setMain] = useState<FastFoodComponent | null>(null);
  const [fries, setFries] = useState<FastFoodComponent | null>(null);
  const [sauces, setSauces] = useState<Record<string, number>>({});
  const [drink, setDrink] = useState<FastFoodComponent | null>(null);
  const [cheese, setCheese] = useState(0);
  const [official, setOfficial] = useState(false);
  const [offN, setOffN] = useState<Nutrients>({ kcal: null, protein: null, carbs: null, fat: null });
  const [offSrc, setOffSrc] = useState('');

  useEffect(() => {
    if (open) { setMain(null); setFries(null); setSauces({}); setDrink(null); setCheese(0); setOfficial(false); setOffN({ kcal: null, protein: null, carbs: null, fat: null }); setOffSrc(''); }
  }, [open]);

  const components = useMemo(() => {
    const list: FastFoodComponent[] = [];
    if (main) list.push(official && offN.kcal != null ? { ...main, official: offN, officialSource: offSrc } : main);
    if (fries) list.push(fries);
    for (const [id, n] of Object.entries(sauces)) if (n > 0) list.push({ catalogId: id, count: n });
    if (cheese > 0) list.push({ catalogId: 'cheese-extra', count: cheese });
    if (drink) list.push(drink);
    return list;
  }, [main, fries, sauces, drink, cheese, official, offN, offSrc]);
  const lines = useMemo(() => fastFoodLines(components, () => newId('li')), [components]);
  const totals = scenarioTotals(lines);
  const mainEntry = main ? getEntry(main.catalogId) : null;
  const friesEntry = getEntry('fries')!;

  return (
    <Sheet open={open} onClose={onClose} title="Menu fast-food / street food" footer={lines.length ? (
      <Button block onClick={() => { onAdd(lines, fastFoodName(components)); onClose(); }}>Ajouter le menu · {fmtKcal(totals.retained)} kcal</Button>
    ) : undefined}>
      <Field label="Plat principal">
        <div className="flex flex-wrap gap-2">
          {MAINS.map((e) => <Chip key={e.id} active={main?.catalogId === e.id} onClick={() => setMain(main?.catalogId === e.id ? null : { catalogId: e.id, portionId: e.defaultPortion, count: e.defaultCount?.mean ?? 1 })}>{e.emoji} {e.name.replace(/ \(.*\)$/, '')}</Chip>)}
        </div>
      </Field>
      {mainEntry && main && (
        <div className="-mt-1 mb-4 rounded-2xl bg-surface p-3">
          {mainEntry.portions.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-2">{mainEntry.portions.map((p) => <Chip key={p.id} active={main.portionId === p.id} onClick={() => setMain({ ...main, portionId: p.id })}>{p.label}</Chip>)}</div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">Nombre</span>
            <Button size="sm" variant="secondary" aria-label="Moins" onClick={() => setMain({ ...main, count: Math.max(1, (main.count ?? 1) - 1) })}>−</Button>
            <span className="w-8 text-center font-semibold tabular-nums">{main.count ?? 1}</span>
            <Button size="sm" variant="secondary" aria-label="Plus" onClick={() => setMain({ ...main, count: (main.count ?? 1) + 1 })}>+</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">{FRACTIONS.map(([f, l]) => <Chip key={f} active={(main.fraction ?? 1) === f} onClick={() => setMain({ ...main, fraction: f })}>{l}</Chip>)}</div>
          <div className="mt-3">
            <Toggle checked={official} onChange={setOfficial} label="J’ai les valeurs officielles de l’enseigne" desc="Affichées sur le site, l’appli ou en magasin. Elles remplacent l’estimation du plat." />
            {official && (
              <>
                <div className="grid grid-cols-2 gap-x-2">
                  <Field label="Calories"><NumberInput value={offN.kcal} onChange={(kcal) => setOffN({ ...offN, kcal })} suffix="kcal" /></Field>
                  <Field label="Protéines"><NumberInput value={offN.protein} onChange={(protein) => setOffN({ ...offN, protein })} suffix="g" /></Field>
                  <Field label="Glucides"><NumberInput value={offN.carbs} onChange={(carbs) => setOffN({ ...offN, carbs })} suffix="g" /></Field>
                  <Field label="Lipides"><NumberInput value={offN.fat} onChange={(fat) => setOffN({ ...offN, fat })} suffix="g" /></Field>
                </div>
                <Field label="Source (facultatif)"><TextInput value={offSrc} onChange={(e) => setOffSrc(e.target.value)} placeholder="Ex. site de l’enseigne, menu" /></Field>
              </>
            )}
          </div>
        </div>
      )}
      <Field label="Frites">
        <div className="flex flex-wrap gap-2">
          <Chip active={!fries} onClick={() => setFries(null)}>Pas de frites</Chip>
          {friesEntry.portions.map((p) => <Chip key={p.id} active={fries?.portionId === p.id} onClick={() => setFries({ catalogId: 'fries', portionId: p.id, fraction: fries?.fraction ?? 1 })}>{p.label}</Chip>)}
        </div>
        {fries && <div className="mt-2 flex flex-wrap gap-2"><span className="self-center text-[13px] text-muted">Mangé :</span>{FRACTIONS.map(([f, l]) => <Chip key={f} active={(fries.fraction ?? 1) === f} onClick={() => setFries({ ...fries, fraction: f })}>{l}</Chip>)}</div>}
      </Field>
      <Field label="Sauces en plus" >
        <div className="space-y-1.5">
          {SAUCES.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5">
              <span className="flex-1 text-[14px]">{s.name}</span>
              <Button size="sm" variant="ghost" aria-label={`Moins de ${s.name}`} onClick={() => setSauces({ ...sauces, [s.id]: Math.max(0, (sauces[s.id] ?? 0) - 1) })}>−</Button>
              <span className="w-5 text-center tabular-nums">{sauces[s.id] ?? 0}</span>
              <Button size="sm" variant="ghost" aria-label={`Plus de ${s.name}`} onClick={() => setSauces({ ...sauces, [s.id]: (sauces[s.id] ?? 0) + 1 })}>+</Button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">Le kebab et le burger comptent déjà leur sauce habituelle : n’ajoute ici que les doses supplémentaires.</p>
      </Field>
      {EXTRAS.map((x) => (
        <Field key={x.id} label="Suppléments">
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5">
            <span className="flex-1 text-[14px]">{x.name}</span>
            <Button size="sm" variant="ghost" aria-label="Moins de fromage" onClick={() => setCheese(Math.max(0, cheese - 1))}>−</Button>
            <span className="w-5 text-center tabular-nums">{cheese}</span>
            <Button size="sm" variant="ghost" aria-label="Plus de fromage" onClick={() => setCheese(cheese + 1)}>+</Button>
          </div>
        </Field>
      ))}
      <Field label="Boisson">
        <div className="flex flex-wrap gap-2">
          <Chip active={!drink} onClick={() => setDrink(null)}>Eau / rien</Chip>
          {DRINKS.map((d) => <Chip key={d.id} active={drink?.catalogId === d.id} onClick={() => setDrink({ catalogId: d.id, portionId: d.defaultPortion, count: 1 })}>{d.emoji} {d.name}</Chip>)}
        </div>
        {drink && (
          <div className="mt-2 flex flex-wrap gap-2">{getEntry(drink.catalogId)!.portions.map((p) => <Chip key={p.id} active={drink.portionId === p.id} onClick={() => setDrink({ ...drink, portionId: p.id })}>{p.label}</Chip>)}</div>
        )}
      </Field>
      {lines.length > 0 && (
        <div className="rounded-2xl bg-brand-soft px-4 py-3 text-[13.5px] text-brand-strong">
          {lines.map((l) => <div key={l.id} className="flex justify-between gap-2"><span className="truncate">{l.name}</span><span className="tabular-nums">{fmtKcal(l.nutrients.kcal)}{l.estimate ? ` (haute ${fmtKcal(l.estimate.high.kcal)})` : ''}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-brand/20 pt-1"><span>Estimation moyenne</span><b className="tabular-nums">{fmtKcal(totals.mean)} kcal</b></div>
          <div className="flex justify-between"><span>Estimation haute</span><b className="tabular-nums">{fmtKcal(totals.high)} kcal</b></div>
          <p className="mt-1 text-[12px]">Tu pourras choisir pour chaque élément la valeur à retenir (moyenne par défaut).</p>
        </div>
      )}
    </Sheet>
  );
}
