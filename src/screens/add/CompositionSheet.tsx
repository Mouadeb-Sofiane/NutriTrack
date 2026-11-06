/**
 * Éditeur de composition : plat composé, plat reconnu sur une photo, boisson personnalisée.
 *
 * - « Valider mon repas » ajoute le plat au repas en cours (rien n'est enregistré ailleurs) ;
 * - « Enregistrer dans Mes plats » crée une recette personnelle, action distincte et explicite ;
 * - « Changer de plat » remplace TOUTE la composition (on ne garde pas les ingrédients d'un
 *   plat mal reconnu) ;
 * - chaque modification (quantité, ingrédient, portion) recalcule immédiatement.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Food, LineItem } from '../../domain/types';
import { compositionTotals, ingredientFromFood, lineFromComposition, PORTION_PRESETS, type CompositionIngredient, type Dish } from '../../domain/dishes';
import { fmtG, fmtKcal } from '../../domain/nutrition';
import { getReferenceFood } from '../../domain/referenceFoods';
import type { SearchRef } from '../../data/searchIndex';
import { newId } from '../../data/ids';
import { nowISO } from '../../domain/dates';
import { repo } from '../../state/app';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, Field, IconButton, Notice, NumberInput, TextInput, cx } from '../../ui/kit';
import { IconEdit, IconPlus, IconTrash } from '../../ui/icons';
import { useFeedback } from '../../ui/feedback';
import { EstimatePanel } from '../../ui/EstimatePanel';
import { chooseEstimate } from '../../domain/estimates';
import { SearchPanel } from './SearchPanel';

export interface CompositionStart {
  name: string;
  ingredients: CompositionIngredient[];
  notes?: string[];
  /** true : composition type (estimation) ; false : composition saisie par l'utilisateur. */
  estimated: boolean;
  dishId?: string;
  factor?: number;
  /** Texte d'origine (ex. « reconnu sur la photo : quiche aux poireaux »). */
  origin?: string;
}

export function startFromDish(d: Dish, origin?: string): CompositionStart {
  return { name: d.name, ingredients: d.ingredients.map((i) => ({ ...i })), notes: d.notes, estimated: true, dishId: d.id, origin };
}

/** Ajouts rapides de matières grasses, sauces et fromage (quantités ménagères courantes). */
const QUICK_ADDS: { label: string; foodId: string; grams: number }[] = [
  { label: '+ Huile (1 c. à soupe)', foodId: 'ref:olive-oil', grams: 13.5 },
  { label: '+ Beurre (10 g)', foodId: 'ref:butter', grams: 10 },
  { label: '+ Crème (2 c. à soupe)', foodId: 'ref:cream-30', grams: 30 },
  { label: '+ Fromage râpé (20 g)', foodId: 'ref:emmental', grams: 20 },
  { label: '+ Sauce tomate (1 louche)', foodId: 'ref:tomato-coulis', grams: 100 },
  { label: '+ Mayonnaise (1 c. à soupe)', foodId: 'ref:mayonnaise', grams: 15 },
  { label: '+ Sucre (1 morceau)', foodId: 'ref:sugar', grams: 5 },
  { label: '+ Lait (1/2 verre)', foodId: 'ref:milk-semi', grams: 100 },
];

type Picker = null | { mode: 'add' } | { mode: 'replace'; key: string } | { mode: 'dish' };

export function CompositionSheet({ start, onClose, onAdd, dishes }: { start: CompositionStart | null; onClose: () => void; onAdd: (item: LineItem) => void; dishes: Dish[] }) {
  const [name, setName] = useState('');
  const [editName, setEditName] = useState(false);
  const [list, setList] = useState<CompositionIngredient[]>([]);
  const [factor, setFactor] = useState(1);
  const [customGrams, setCustomGrams] = useState<number | null>(null);
  const [meta, setMeta] = useState<Omit<CompositionStart, 'name' | 'ingredients'>>({ estimated: true });
  const [picker, setPicker] = useState<Picker>(null);
  const [chosen, setChosen] = useState<'mean' | 'high' | 'custom'>('mean');
  const [customKcal, setCustomKcal] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const { toast } = useFeedback();

  const load = (s: CompositionStart) => {
    setName(s.name); setList(s.ingredients.map((i) => ({ ...i }))); setFactor(s.factor ?? 1); setCustomGrams(null);
    setMeta({ notes: s.notes, estimated: s.estimated, dishId: s.dishId, origin: s.origin }); setChosen('mean'); setCustomKcal(null); setSaved(false); setEditName(false);
  };
  useEffect(() => { if (start) load(start); }, [start]);

  const base = useMemo(() => compositionTotals(list), [list]);
  // Quantité personnalisée de l'assiette : on ajuste le facteur, pas chaque ingrédient.
  const effFactor = customGrams && base.grams > 0 ? customGrams / base.grams : factor;
  const line = useMemo(() => {
    const l = lineFromComposition(name.trim() || 'Plat', list, effFactor, newId('li'), { estimated: meta.estimated, dishId: meta.dishId, notes: meta.notes });
    if (!l || !l.estimate) return l;
    return chosen === 'mean' ? l : chooseEstimate(l, chosen, customKcal);
  }, [name, list, effFactor, meta, chosen, customKcal]);

  if (!start) return null;

  const update = (key: string, patch: Partial<CompositionIngredient>) => setList((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => setList((l) => l.filter((i) => i.key !== key));
  const addFood = (food: Food, grams: number) => setList((l) => [...l, ingredientFromFood(food, grams, newId('ing'))]);
  const defaultGrams = (food: Food) => food.servings[0]?.amount ?? 100;

  const onPicked = (ref: SearchRef) => {
    if (!picker) return;
    if (picker.mode === 'dish') {
      if (ref.type === 'dish') { load({ ...startFromDish(ref.dish), origin: meta.origin ? `${meta.origin} → corrigé en « ${ref.dish.name} »` : undefined }); setPicker(null); }
      return;
    }
    const food = ref.type === 'food' ? ref.food : null;
    if (!food) return;
    if (picker.mode === 'add') addFood(food, defaultGrams(food));
    else {
      setList((l) => l.map((i) => (i.key === picker.key ? { ...ingredientFromFood(food, i.grams, i.key), group: i.group } : i)));
    }
    setPicker(null);
  };

  const saveAsRecipe = async () => {
    const now = nowISO();
    const ingredients: LineItem[] = list.filter((i) => i.enabled && i.grams > 0).map((i) => {
      const t = compositionTotals([{ ...i, enabled: true }]);
      return {
        id: newId('li'), name: i.label, foodId: i.foodId, quantity: Math.round(i.grams * 10) / 10, unit: i.basis, baseAmount: i.grams, baseUnit: i.basis,
        nutrients: t.nutrients, precision: 'approx', source: meta.estimated ? { kind: 'estimate', label: 'Composition type (ingrédients USDA)', status: 'estimated' } : { kind: 'manual', status: 'user' },
      };
    });
    await repo.saveRecipe({
      id: newId('rec'), name: name.trim() || 'Mon plat', categories: [], ingredients, servings: 1, totalWeightG: Math.round(base.grams),
      assumptions: meta.notes ?? [], favorite: false, version: 1, createdAt: now, updatedAt: now,
      notes: meta.dishId ? `Créé à partir de la composition type « ${start.name} ».` : undefined,
    });
    setSaved(true);
    toast('Plat enregistré ! Tu le retrouveras dans Mes plats enregistrés.');
  };

  if (picker) {
    return (
      <Sheet open onClose={() => setPicker(null)} title={picker.mode === 'dish' ? 'Quel est ce plat ?' : picker.mode === 'add' ? 'Ajouter un ingrédient' : 'Remplacer l’ingrédient'}>
        {picker.mode === 'dish' && <p className="mb-2 text-[13px] text-muted">La composition actuelle sera entièrement remplacée par celle du plat choisi.</p>}
        <SearchPanel kinds={picker.mode === 'dish' ? ['dish'] : ['food', 'drink', 'product']} onPick={onPicked} placeholder={picker.mode === 'dish' ? 'Hachis parmentier, quiche au thon…' : 'Thon, poireau, crème, fromage…'} />
        <Button variant="secondary" block className="mt-3" onClick={() => setPicker(null)}>Retour</Button>
      </Sheet>
    );
  }

  const groups: { id: string; title: string; items: CompositionIngredient[] }[] = [
    { id: 'parts', title: 'Parties consommées (coche ce que tu as mangé)', items: list.filter((i) => i.group === 'parts') },
    { id: 'main', title: 'Ingrédients', items: list.filter((i) => !i.group) },
    { id: 'fat', title: 'Matières grasses de cuisson', items: list.filter((i) => i.group === 'fat') },
    { id: 'side', title: 'Accompagnements', items: list.filter((i) => i.group === 'side') },
  ].filter((g) => g.items.length);

  return (
    <Sheet open onClose={onClose} title={editName ? 'Modifier le plat' : name}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={saveAsRecipe} disabled={saved || !line}>{saved ? 'Enregistré ✓' : 'Enregistrer dans Mes plats'}</Button>
          <Button className="flex-1" disabled={!line} onClick={() => line && (onAdd(line), onClose())}>Valider mon repas</Button>
        </div>
      }>
      {meta.origin && <Notice className="mb-2">{meta.origin}</Notice>}
      <div className="mb-2 flex flex-wrap gap-2">
        <Chip onClick={() => setEditName(!editName)}><IconEdit size={15} /> Modifier le nom</Chip>
        {dishes.length > 0 && <Chip onClick={() => setPicker({ mode: 'dish' })}>Ce n’est pas ce plat</Chip>}
      </div>
      {editName && <Field label="Nom du plat"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>}

      <Field label="Quelle quantité as-tu mangée ?" hint={`Portion type : ${Math.round(base.grams)} g. Les quantités sont approximatives ; corrige seulement ce que tu connais.`}>
        <div className="flex flex-wrap gap-2">
          {PORTION_PRESETS.map((p) => <Chip key={p.id} active={!customGrams && factor === p.factor} onClick={() => { setFactor(p.factor); setCustomGrams(null); }}>{p.label}</Chip>)}
        </div>
        <div className="mt-2 max-w-[12rem]"><NumberInput value={customGrams ?? (base.grams ? Math.round(base.grams * factor) : null)} onChange={setCustomGrams} suffix="g" aria-label="Poids total de la portion" /></div>
      </Field>

      {line && (line.estimate ? (
        <div className="mb-3"><EstimatePanel estimate={line.estimate} onChoose={(c, k) => { setChosen(c); setCustomKcal(k ?? null); }} /></div>
      ) : (
        <div className="mb-3 rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
          <div className="text-2xl font-extrabold tabular-nums">{fmtKcal(line.nutrients.kcal)} kcal</div>
        </div>
      ))}
      {line && !line.estimate && <p className="mb-3 text-center text-[13px] tabular-nums text-muted">P {fmtG(line.nutrients.protein)} g · G {fmtG(line.nutrients.carbs)} g · L {fmtG(line.nutrients.fat)} g{base.missing ? ' · certaines valeurs inconnues' : ''}</p>}

      {groups.map((g) => (
        <div key={g.id} className="mb-3">
          <h3 className="mb-1 px-1 text-[13px] font-bold uppercase text-muted">{g.title}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {g.items.map((i) => (
              <li key={i.key} className={cx('flex items-center gap-2 px-3 py-2', !i.enabled && 'opacity-55')}>
                <input type="checkbox" checked={i.enabled} onChange={(e) => update(i.key, { enabled: e.target.checked })} aria-label={`Inclure ${i.label}`} className="h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPicker({ mode: 'replace', key: i.key })} title="Remplacer cet ingrédient">
                  <div className="truncate text-[14px] font-medium">{i.label}</div>
                  <div className="text-[12px] text-muted">{fmtKcal(i.per100[0] != null ? (i.per100[0] * i.grams * effFactor) / 100 : null)} kcal · toucher pour remplacer</div>
                </button>
                <div className="w-24 shrink-0"><NumberInput value={Math.round(i.grams * 10) / 10} onChange={(v) => update(i.key, { grams: v ?? 0 })} suffix={i.basis} aria-label={`Quantité de ${i.label}`} /></div>
                <IconButton label={`Retirer ${i.label}`} className="text-muted" onClick={() => remove(i.key)}><IconTrash size={18} /></IconButton>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="-mt-1 mb-2 px-1 text-[12px] text-muted">Quantités pour une portion type{effFactor !== 1 ? ` (× ${effFactor.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} appliqué au total)` : ''}.</p>

      <Button variant="soft" block onClick={() => setPicker({ mode: 'add' })}><IconPlus size={18} /> Ajouter un ingrédient</Button>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {QUICK_ADDS.map((a) => {
          const f = getReferenceFood(a.foodId);
          return f ? <Chip key={a.label} onClick={() => addFood(f, a.grams)}>{a.label}</Chip> : null;
        })}
      </div>
      {meta.notes?.length ? <div className="mt-3 space-y-1">{meta.notes.map((n) => <p key={n} className="text-[12.5px] leading-snug text-muted">ℹ️ {n}</p>)}</div> : null}
      {meta.estimated && <p className="mt-2 text-[12px] text-muted">Composition type estimée à partir d’ingrédients de la base USDA : ta recette peut différer. Ce n’est pas une mesure.</p>}
    </Sheet>
  );
}
