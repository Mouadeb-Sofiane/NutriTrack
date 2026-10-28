import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LineItem, PersonalPortion, Recipe } from '../../domain/types';
import { describeConsumption, fractionLabel, lineFromRecipe, PORTION_SIZE_LABEL, recipeNutrition, type Consumption, type PortionSize } from '../../domain/recipes';
import { fmtG, fmtKcal } from '../../domain/nutrition';
import { normalize } from '../../domain/referenceFoods';
import { db } from '../../data/db';
import { newId } from '../../data/ids';
import { navigate } from '../../state/router';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, EmptyState, Field, Notice, NumberInput, PrecisionBadge, Segmented, TextInput } from '../../ui/kit';
import { IconBook, IconSearch, IconStar } from '../../ui/icons';

export function RecipePickerSheet({ open, onClose, onAdd, initialRecipeId }: { open: boolean; onClose: () => void; onAdd: (item: LineItem) => void; initialRecipeId?: string }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Recipe | null>(null);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  useEffect(() => {
    if (!open) { setQ(''); setPicked(null); return; }
    if (initialRecipeId) db.recipes.get(initialRecipeId).then((r) => r && setPicked(r));
  }, [open, initialRecipeId]);

  const list = useMemo(() => {
    const nq = normalize(q);
    return recipes
      .filter((r) => !nq || normalize(`${r.name} ${r.cuisine ?? ''} ${r.categories.join(' ')} ${r.ingredients.map((i) => i.name).join(' ')}`).includes(nq))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
  }, [recipes, q]);

  return (
    <Sheet open={open} onClose={onClose} title={picked ? picked.name : 'Mes recettes'}>
      {picked ? (
        <ConsumptionPicker recipe={picked} onBack={initialRecipeId ? undefined : () => setPicked(null)} onAdd={(it) => { onAdd(it); onClose(); }} />
      ) : recipes.length === 0 ? (
        <EmptyState icon={<IconBook />} title="Aucune recette pour l’instant" text="Enregistre tes plats habituels (même sans connaître les quantités exactes) pour les ajouter en quelques secondes." action={<Button onClick={() => { onClose(); navigate('recipe/new'); }}>Créer une recette</Button>} />
      ) : (
        <>
          <div className="relative mb-2">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={20} />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ingrédient, cuisine…" className="pl-11" />
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {list.map((r) => {
              const n = recipeNutrition(r);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setPicked(r)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-bg">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.name}{r.favorite && <IconStar filled size={13} className="ml-1 inline text-accent" />}</div>
                      <div className="text-[12.5px] text-muted">{n.basis === 'none' ? 'Valeurs inconnues' : `~${fmtKcal(n.perServing.kcal)} kcal / portion`}{r.cuisine ? ` · ${r.cuisine}` : ''}</div>
                    </div>
                    {n.basis !== 'none' && <PrecisionBadge precision={n.precision} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {!list.length && <p className="py-4 text-center text-sm text-muted">Aucune recette ne correspond.</p>}
        </>
      )}
    </Sheet>
  );
}

type Mode = 'servings' | 'fraction' | 'grams' | 'personal';
const FRACTIONS = [1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 1];

export function ConsumptionPicker({ recipe, onAdd, onBack }: { recipe: Recipe; onAdd: (item: LineItem) => void; onBack?: () => void }) {
  const portions = useLiveQuery(() => db.portions.where('recipeId').equals(recipe.id).toArray(), [recipe.id]) ?? [];
  const [mode, setMode] = useState<Mode>('servings');
  const [servings, setServings] = useState<number | null>(1);
  const [size, setSize] = useState<PortionSize>('usual');
  const [fraction, setFraction] = useState(1 / 4);
  const [grams, setGrams] = useState<number | null>(null);
  const [personal, setPersonal] = useState<PersonalPortion | null>(null);
  const n = recipeNutrition(recipe);

  let c: Consumption | null = null;
  if (mode === 'servings' && servings) c = { kind: 'servings', servings, size };
  if (mode === 'fraction') c = { kind: 'fraction', fraction };
  if (mode === 'grams' && grams) c = { kind: 'grams', grams };
  if (mode === 'personal' && personal) {
    c = personal.amount && recipe.totalWeightG ? { kind: 'grams', grams: personal.amount } : { kind: 'servings', servings: personal.servings ?? 1, size: 'usual' };
  }
  const item = c ? lineFromRecipe(recipe, c, newId('li')) : null;
  if (item && mode === 'personal' && personal) item.unitLabel = `${personal.name} (${describeConsumption(c!)})`;

  const modes = [
    { value: 'servings' as Mode, label: 'Portions' },
    { value: 'fraction' as Mode, label: 'Part du plat' },
    ...(recipe.totalWeightG ? [{ value: 'grams' as Mode, label: 'Grammes' }] : []),
    ...(portions.length ? [{ value: 'personal' as Mode, label: 'Mes portions' }] : []),
  ];

  return (
    <div>
      <div className="mb-3 rounded-2xl bg-surface p-3.5 text-[13.5px]">
        {n.basis === 'none' ? (
          <span className="text-warn">Cette recette n’a pas encore de valeurs nutritionnelles : le repas sera enregistré sans calories. Complète la recette pour les calculer.</span>
        ) : (
          <>
            <b>{recipe.servings} portion{recipe.servings > 1 ? 's' : ''}</b> · ~{fmtKcal(n.total.kcal)} kcal au total · ~{fmtKcal(n.perServing.kcal)} kcal/portion <PrecisionBadge precision={n.precision} />
          </>
        )}
      </div>
      <Segmented value={mode} onChange={setMode} options={modes} className="mb-4" />
      {mode === 'servings' && (
        <>
          <Field label="Nombre de portions">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setServings(Math.max(0.25, (servings ?? 1) - 0.5))} aria-label="Moins">−</Button>
              <NumberInput value={servings} onChange={setServings} className="text-center" />
              <Button variant="secondary" onClick={() => setServings((servings ?? 0) + 0.5)} aria-label="Plus">+</Button>
            </div>
          </Field>
          <Field label="Taille de la portion" hint="Dans un plat familial, les assiettes ne sont pas identiques : ajuste si la tienne était plus petite ou plus grande que d’habitude.">
            <Segmented<PortionSize> value={size} onChange={setSize} options={(['small', 'usual', 'large'] as PortionSize[]).map((v) => ({ value: v, label: PORTION_SIZE_LABEL[v] }))} />
          </Field>
        </>
      )}
      {mode === 'fraction' && (
        <Field label="Quelle part du plat as-tu mangée ?">
          <div className="flex flex-wrap gap-2">
            {FRACTIONS.map((f) => <Chip key={f} active={Math.abs(fraction - f) < 0.001} onClick={() => setFraction(f)}>{fractionLabel(f)}</Chip>)}
          </div>
        </Field>
      )}
      {mode === 'grams' && (
        <Field label="Quantité pesée" hint={`Poids total du plat : ${fmtG(recipe.totalWeightG)} g`}>
          <NumberInput value={grams} onChange={setGrams} suffix="g" />
        </Field>
      )}
      {mode === 'personal' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {portions.map((p) => <Chip key={p.id} active={personal?.id === p.id} onClick={() => setPersonal(p)}>{p.name}</Chip>)}
        </div>
      )}
      {item && item.nutrients.kcal != null && (
        <div className="mb-3 rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
          <div className="text-2xl font-extrabold tabular-nums">~{fmtKcal(item.nutrients.kcal)} kcal</div>
          {item.kcalRange && <div className="text-[12.5px]">fourchette plausible : {fmtKcal(item.kcalRange.min)} – {fmtKcal(item.kcalRange.max)} kcal</div>}
          <div className="mt-1 text-[13px] tabular-nums">P {fmtG(item.nutrients.protein)} g · G {fmtG(item.nutrients.carbs)} g · L {fmtG(item.nutrients.fat)} g</div>
        </div>
      )}
      {n.missingQuantities > 0 && <Notice tone="warn" className="mb-3">{n.missingQuantities} ingrédient(s) sans quantité ne sont pas comptés : l’estimation est probablement basse.</Notice>}
      <div className="flex gap-2">
        {onBack && <Button variant="secondary" onClick={onBack}>Retour</Button>}
        <Button className="flex-1" disabled={!item} onClick={() => item && onAdd(item)}>Ajouter au repas</Button>
      </div>
    </div>
  );
}
