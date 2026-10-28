/** Recherche d'aliments : table de référence + mes aliments (hors ligne) + Open Food Facts (en ligne). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Food, LineItem, Precision } from '../../domain/types';
import { getReferenceFood, REFERENCE_FOODS, searchFoods } from '../../domain/referenceFoods';
import { checkPer100, fmtG, fmtKcal, lineFromFood, PRECISION_LABEL } from '../../domain/nutrition';
import { fetchByBarcode, OffError, searchProducts } from '../../data/openFoodFacts';
import { db } from '../../data/db';
import { newId } from '../../data/ids';
import { nowISO } from '../../domain/dates';
import { repo } from '../../state/app';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, Field, Notice, NumberInput, PrecisionBadge, Segmented, SourceBadge, TextInput } from '../../ui/kit';
import { IconBarcode, IconSearch, IconStar } from '../../ui/icons';
import { useFeedback } from '../../ui/feedback';
import { PhotoMassChoice, type PhotoMassState } from '../../ui/PhotoMassChoice';
import { EstimatePanel } from '../../ui/EstimatePanel';
import { foodLineFromPhoto, type MassRange } from '../../domain/photoMass';

export function FoodPickerSheet({ open, onClose, onAdd, initialFoodId, photoMass }: { open: boolean; onClose: () => void; onAdd: (item: LineItem) => void; initialFoodId?: string; photoMass?: MassRange | null }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [online, setOnline] = useState<Food[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodeMode, setBarcodeMode] = useState(false);
  const mine = useLiveQuery(() => db.foods.toArray(), []) ?? [];
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setQ(''); setSelected(null); setOnline(null); setError(null); setBarcodeMode(false);
      abort.current?.abort();
    } else if (initialFoodId) {
      const f = getReferenceFood(initialFoodId);
      if (f) setSelected(f);
    }
  }, [open, initialFoodId]);

  const all = useMemo(() => {
    const ids = new Set(mine.map((f) => f.id));
    return [...mine, ...REFERENCE_FOODS.filter((f) => !ids.has(f.id))];
  }, [mine]);
  const results = useMemo(() => {
    if (!q.trim()) {
      const fav = mine.filter((f) => f.favorite);
      return fav.length ? fav : mine.slice(-12).reverse();
    }
    return searchFoods(all, q, 40);
  }, [q, all, mine]);

  const runOnline = async (barcode?: string) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      if (barcode) {
        const local = await repo.foodByBarcode(barcode.replace(/\D/g, ''));
        const f = local ?? (await fetchByBarcode(barcode, nowISO(), ctrl.signal));
        setSelected(f);
      } else {
        const r = await searchProducts(q, nowISO(), ctrl.signal);
        setOnline(r);
        if (!r.length) setError('Aucun produit trouvé avec des valeurs nutritionnelles. Essaie un autre nom ou saisis-le à la main.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof OffError ? e.message : 'Erreur inattendue pendant la recherche.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={selected ? 'Quantité' : 'Rechercher un aliment'}>
      {selected ? (
        <QuantityPicker food={selected} photoMass={photoMass} onBack={() => setSelected(null)} onAdd={(it) => { onAdd(it); onClose(); }} />
      ) : (
        <div>
          <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={20} />
              <TextInput autoFocus value={q} onChange={(e) => { setQ(e.target.value); setOnline(null); setError(null); }} placeholder="Riz, poulet, yaourt, marque…" className="pl-11" enterKeyHint="search" onKeyDown={(e) => e.key === 'Enter' && q.trim().length > 1 && runOnline()} />
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
              <Chip onClick={() => runOnline()} active={false}><IconSearch size={16} /> Chercher en ligne</Chip>
              <Chip onClick={() => setBarcodeMode((v) => !v)} active={barcodeMode}><IconBarcode size={16} /> Code-barres</Chip>
            </div>
          </div>
          {barcodeMode && <BarcodeInput onCode={(c) => runOnline(c)} />}
          {loading && <p className="py-4 text-center text-sm text-muted">Recherche sur Open Food Facts…</p>}
          {error && <Notice tone="warn" className="my-2">{error}</Notice>}
          {online && online.length > 0 && (
            <>
              <h3 className="mb-1 mt-3 px-1 text-[13px] font-bold uppercase text-muted">Open Food Facts</h3>
              <FoodList foods={online} onPick={setSelected} />
              <p className="mt-2 px-1 text-[12px] text-muted">Données collaboratives issues d’Open Food Facts (openfoodfacts.org), licence ODbL. Elles peuvent être incomplètes : vérifie avec l’emballage.</p>
            </>
          )}
          <h3 className="mb-1 mt-3 px-1 text-[13px] font-bold uppercase text-muted">{q.trim() ? 'Hors ligne' : mine.some((f) => f.favorite) ? 'Mes favoris' : 'Mes aliments'}</h3>
          {results.length ? <FoodList foods={results} onPick={setSelected} /> : (
            <p className="px-1 py-3 text-sm text-muted">{q.trim() ? 'Aucun aliment connu. Cherche en ligne ou utilise la saisie manuelle.' : 'Tape un nom pour chercher dans la table de référence et tes aliments.'}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function BarcodeInput({ onCode }: { onCode: (c: string) => void }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        // @ts-expect-error API expérimentale (Chrome Android)
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        while (!stop) {
          const codes = await detector.detect(video.current);
          if (codes.length) { setScanning(false); onCode(codes[0].rawValue); break; }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        setScanning(false);
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning, onCode]);
  return (
    <div className="mb-2 rounded-2xl bg-surface p-3">
      <div className="flex gap-2">
        <TextInput inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Chiffres sous le code-barres" />
        <Button onClick={() => onCode(code)} disabled={code.length < 6}>OK</Button>
      </div>
      {supported ? (
        scanning ? <video ref={video} className="mt-2 aspect-video w-full rounded-xl bg-black object-cover" playsInline muted /> : <Button variant="soft" block className="mt-2" onClick={() => setScanning(true)}>Scanner avec la caméra</Button>
      ) : (
        <p className="mt-2 text-[12.5px] text-muted">Le scan par caméra n’est pas pris en charge par ce navigateur : saisis les chiffres du code-barres.</p>
      )}
    </div>
  );
}

export function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
      {foods.map((f) => (
        <li key={f.id}>
          <button type="button" onClick={() => onPick(f)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-bg">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{f.name}{f.favorite && <IconStar filled size={13} className="ml-1 inline text-accent" />}</div>
              <div className="flex items-center gap-1.5 truncate text-[12.5px] text-muted">
                {f.brand && <span className="truncate">{f.brand} ·</span>}
                <span>{fmtKcal(f.per100.kcal)} kcal / 100 {f.basis}</span>
                <SourceBadge source={f.source} />
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function QuantityPicker({ food, onAdd, onBack, photoMass }: { food: Food; onAdd: (item: LineItem) => void; onBack?: () => void; photoMass?: MassRange | null }) {
  const usable = !!photoMass && food.basis === 'g';
  const [pm, setPm] = useState<PhotoMassState>({ on: usable, share: photoMass?.defaultShare ?? 1 });
  const photoOn = usable && pm.on;
  const { toast } = useFeedback();
  const units = [
    { id: food.basis, label: food.basis },
    ...(food.density ? [{ id: food.basis === 'g' ? 'ml' : 'g', label: food.basis === 'g' ? 'ml' : 'g' }] : []),
    ...food.servings.map((s) => ({ id: s.id, label: s.label })),
  ];
  const [unit, setUnit] = useState(food.servings[0]?.id ?? food.basis);
  const [count, setCount] = useState<number | null>(food.servings[0] ? 1 : 100);
  const [precision, setPrecision] = useState<Precision | null>(null);
  const item = photoOn ? foodLineFromPhoto(food, photoMass!, pm.share, newId('li')) : count ? lineFromFood(food, { unit, count }, newId('li'), precision ?? undefined) : null;
  const saved = food.id.startsWith('ref:') ? null : food;
  const check = checkPer100(food.per100, food.basis);

  const saveToMine = async (favorite: boolean) => {
    await repo.saveFood({ ...food, id: food.id, favorite });
    toast(favorite ? 'Ajouté à tes favoris' : 'Enregistré dans tes aliments');
  };

  return (
    <div>
      <div className="mb-3 rounded-2xl bg-surface p-3.5">
        <div className="font-semibold">{food.name}</div>
        {food.brand && <div className="text-sm text-muted">{food.brand}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          <SourceBadge source={food.source} />
          <span>Pour 100 {food.basis} : {fmtKcal(food.per100.kcal)} kcal · P {fmtG(food.per100.protein, 1)} · G {fmtG(food.per100.carbs, 1)} · L {fmtG(food.per100.fat, 1)}</span>
        </div>
        {food.source.kind === 'reference' && <p className="mt-1.5 text-[12px] text-muted">Valeur moyenne indicative : un produit précis peut différer.</p>}
        {food.source.url && <a href={food.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] font-medium text-brand">Voir la fiche Open Food Facts</a>}
        {check.warnings.map((w) => <Notice key={w} tone="warn" className="mt-2">{w}</Notice>)}
        {Object.values(food.per100).some((v) => v == null) && <Notice tone="warn" className="mt-2">Certaines valeurs sont absentes de la fiche : elles seront signalées comme manquantes.</Notice>}
      </div>
      {usable && <PhotoMassChoice mass={photoMass!} state={pm} onChange={setPm} />}
      {!photoOn && <>
      <Field label="Unité">
        <div className="flex flex-wrap gap-2">
          {units.map((u) => <Chip key={u.id} active={unit === u.id} onClick={() => { setUnit(u.id); setCount(u.id === 'g' || u.id === 'ml' ? 100 : 1); }}>{u.label}</Chip>)}
        </div>
      </Field>
      <Field label={unit === 'g' || unit === 'ml' ? `Quantité (${unit})` : 'Nombre'} error={count != null && count <= 0 ? 'La quantité doit être positive.' : null}>
        <NumberInput value={count} onChange={setCount} suffix={unit === 'g' || unit === 'ml' ? unit : '×'} autoFocus />
      </Field>
      <Field label="Précision de la quantité">
        <Segmented<Precision>
          value={precision ?? item?.precision ?? 'exact'}
          onChange={setPrecision}
          options={[{ value: 'exact', label: 'Pesé / lu' }, { value: 'approx', label: 'À peu près' }, { value: 'rough', label: 'À l’œil' }]}
        />
      </Field>
      </>}
      {item?.estimate && photoOn && <div className="mb-3"><EstimatePanel estimate={item.estimate} /></div>}
      {item && !photoOn && (
        <div className="mb-3 flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3">
          <div>
            <div className="text-2xl font-extrabold tabular-nums text-brand-strong">{fmtKcal(item.nutrients.kcal)} kcal</div>
            {item.kcalRange && item.precision !== 'exact' && <div className="text-[12.5px] text-brand-strong/80">entre {fmtKcal(item.kcalRange.min)} et {fmtKcal(item.kcalRange.max)}</div>}
          </div>
          <div className="text-right text-[13px] tabular-nums text-brand-strong">
            <div>P {fmtG(item.nutrients.protein)} g · G {fmtG(item.nutrients.carbs)} g</div>
            <div>L {fmtG(item.nutrients.fat)} g · <PrecisionBadge precision={item.precision} /></div>
          </div>
        </div>
      )}
      <p className="mb-3 text-[12px] text-muted">{PRECISION_LABEL[item?.precision ?? 'exact']} — la fourchette reflète l’incertitude sur la quantité.</p>
      <div className="flex gap-2">
        {onBack && <Button variant="secondary" onClick={onBack}>Retour</Button>}
        <Button className="flex-1" disabled={!item} onClick={() => item && onAdd(item)}>Ajouter</Button>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {!saved?.favorite && <Button variant="ghost" size="sm" onClick={() => saveToMine(true)}><IconStar size={16} /> Favori</Button>}
        {!saved && food.source.kind === 'openfoodfacts' && <Button variant="ghost" size="sm" onClick={() => saveToMine(false)}>Garder hors ligne</Button>}
      </div>
    </div>
  );
}

