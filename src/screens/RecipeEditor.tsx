/** Création / modification d'une recette. Toutes les informations sont facultatives sauf le nom. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LineItem, Precision, Recipe } from '../domain/types';
import { db } from '../data/db';
import { repo, useApp } from '../state/app';
import { goBack, navigate, type Route } from '../state/router';
import { parseRecipeText, recipeNutrition, refreshRecipeLines } from '../domain/recipes';
import { lineFromParsed } from '../domain/matching';
import { REFERENCE_FOODS } from '../domain/referenceFoods';
import { fmtKcal } from '../domain/nutrition';
import { nowISO } from '../domain/dates';
import { newId } from '../data/ids';
import { CATEGORIES, CUISINES } from './labels';
import { Button, Card, Chip, Field, IconButton, Notice, NumberInput, PrecisionBadge, Segmented, TextArea, TextInput, Toggle } from '../ui/kit';
import { IconCamera, IconChevronLeft, IconEdit, IconFamily, IconSearch, IconText, IconX } from '../ui/icons';
import { useFeedback } from '../ui/feedback';
import { compressImage } from '../ui/photo';
import { PhotoView } from '../ui/PhotoView';
import { Sheet } from '../ui/Sheet';
import { FoodPickerSheet } from './add/FoodPicker';
import { ManualSheet } from './add/ManualSheet';
import { GuidedSheet } from './add/GuidedSheet';
import { ItemEditSheet } from './add/ItemEditSheet';
import { quantityText } from './MealComposer';

function blank(): Recipe {
  const now = nowISO();
  return { id: newId('rec'), name: '', categories: [], ingredients: [], servings: 4, assumptions: [], favorite: false, version: 1, createdAt: now, updatedAt: now, manualTotal: null, totalWeightG: null };
}

export function RecipeEditor({ id, route }: { id: string | null; route: Route }) {
  const { prefs } = useApp();
  const { toast, confirm } = useFeedback();
  const [r, setR] = useState<Recipe | null>(id ? null : blank());
  const [original, setOriginal] = useState<Recipe | null>(null);
  const [sheet, setSheet] = useState<'search' | 'manual' | 'import' | 'family' | null>(route.query.get('import') ? 'import' : null);
  const [editing, setEditing] = useState<LineItem | null>(null);
  const [totalOnly, setTotalOnly] = useState(false);
  const [newCuisine, setNewCuisine] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const tempPhotos = useRef<string[]>([]);

  useEffect(() => {
    if (!id) return;
    db.recipes.get(id).then((x) => {
      if (!x) { navigate('meals', undefined, { replace: true }); return; }
      setR(structuredClone(x)); setOriginal(x); setTotalOnly(x.manualTotal?.kcal != null);
    });
  }, [id]);

  const nutrition = useMemo(() => (r ? recipeNutrition(totalOnly ? r : { ...r, manualTotal: null }) : null), [r, totalOnly]);
  if (!r || !nutrition) return null;
  const set = (patch: Partial<Recipe>) => setR((x) => (x ? { ...x, ...patch } : x));
  const addItems = (items: LineItem[], assumptions: string[] = []) => setR((x) => x && { ...x, ingredients: [...x.ingredients, ...items], assumptions: [...x.assumptions, ...assumptions.filter((a) => !x.assumptions.includes(a))] });
  const cuisines = [...new Set([...CUISINES.flatMap((c) => c.items), ...prefs.customCuisines])];

  const onPhoto = async (f?: File) => {
    if (!f) return;
    try {
      const pid = await repo.savePhoto(await compressImage(f));
      tempPhotos.current.push(pid);
      set({ photoId: pid });
    } catch { toast('Impossible de lire cette image.', 'error'); }
  };

  const save = async () => {
    try {
      const toSave: Recipe = {
        ...r,
        manualTotal: totalOnly ? r.manualTotal : null,
        manualPrecision: totalOnly ? r.manualPrecision ?? 'rough' : undefined,
      };
      if (totalOnly && toSave.manualTotal?.kcal == null) {
        if (!(await confirm({ title: 'Enregistrer sans calories ?', text: 'Tu pourras compléter le total plus tard.', confirm: 'Enregistrer' }))) return;
      }
      const saved = await repo.saveRecipe(toSave);
      if (newCuisine.trim() && !prefs.customCuisines.includes(newCuisine.trim())) await repo.savePrefs({ customCuisines: [...prefs.customCuisines, newCuisine.trim()] });
      // Nettoyage des photos remplacées.
      for (const pid of tempPhotos.current) if (pid !== saved.photoId) await repo.deletePhoto(pid);
      if (original?.photoId && original.photoId !== saved.photoId) await repo.deletePhoto(original.photoId);

      if (original) {
        const meals = await repo.mealsUsingRecipe(saved.id);
        const before = recipeNutrition(original).perServing.kcal;
        const after = recipeNutrition(saved).perServing.kcal;
        if (meals.length && Math.round(before) !== Math.round(after)) {
          const update = await confirm({
            title: 'Mettre à jour l’historique ?',
            text: `${meals.length} repas déjà enregistré(s) utilisent cette recette (~${fmtKcal(before)} kcal/portion). La nouvelle version donne ~${fmtKcal(after)} kcal/portion. Par défaut, l’historique reste tel qu’il a été enregistré.`,
            confirm: 'Mettre à jour ces repas',
            cancel: 'Garder l’historique',
          });
          if (update) {
            for (const m of meals) await repo.saveMeal({ ...m, items: refreshRecipeLines(m.items, saved), userCorrected: true });
            toast(`${meals.length} repas mis à jour`);
          }
        }
      }
      toast('Recette enregistrée');
      navigate(`recipe/${saved.id}`, undefined, { replace: true });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const cancel = async () => {
    for (const pid of tempPhotos.current) await repo.deletePhoto(pid);
    goBack('meals');
  };

  return (
    <div className="mx-auto max-w-lg pb-32">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-1 bg-bg/90 px-2 py-2 backdrop-blur">
        <IconButton label="Annuler" onClick={cancel}><IconChevronLeft /></IconButton>
        <h1 className="flex-1 text-lg font-bold">{original ? 'Modifier la recette' : 'Nouvelle recette'}</h1>
      </header>
      <div className="px-4">
        <Field label="Nom de la recette"><TextInput value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. Couscous familial, chorba, salade de pâtes…" autoFocus={!id} /></Field>

        {r.photoId ? (
          <div className="relative mb-4 overflow-hidden rounded-[var(--radius-card)]">
            <PhotoView id={r.photoId} className="h-44 w-full" />
            <IconButton label="Retirer la photo" onClick={() => set({ photoId: undefined })} className="absolute right-2 top-2 bg-surface/90"><IconX /></IconButton>
          </div>
        ) : (
          <Button variant="secondary" block className="mb-4" onClick={() => photoInput.current?.click()}><IconCamera /> Ajouter une photo (facultatif)</Button>
        )}
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Nombre de portions" error={r.servings <= 0 ? 'Doit être positif' : null}><NumberInput value={r.servings} onChange={(v) => set({ servings: v ?? 0 })} /></Field>
          <Field label="Poids total du plat" hint="Facultatif, si tu l’as pesé"><NumberInput value={r.totalWeightG ?? null} onChange={(v) => set({ totalWeightG: v })} suffix="g" /></Field>
        </div>

        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Valeurs nutritionnelles</h2>
            {nutrition.basis !== 'none' && <PrecisionBadge precision={nutrition.precision} />}
          </div>
          <Segmented value={totalOnly ? 'total' : 'ingredients'} onChange={(v) => setTotalOnly(v === 'total')} options={[{ value: 'ingredients', label: 'Par ingrédients' }, { value: 'total', label: 'Total estimé' }]} className="mb-3" />
          {totalOnly ? (
            <>
              <p className="mb-3 text-[13px] text-muted">Tu ne connais pas le détail ? Indique une estimation pour tout le plat : elle sera répartie entre les portions.{r.ingredients.length > 0 && ' Les ingrédients déjà saisis sont conservés mais ce total les remplace pour le calcul.'}</p>
              <Field label="Calories du plat entier"><NumberInput value={r.manualTotal?.kcal ?? null} onChange={(kcal) => set({ manualTotal: { kcal, protein: r.manualTotal?.protein ?? null, carbs: r.manualTotal?.carbs ?? null, fat: r.manualTotal?.fat ?? null } })} suffix="kcal" inputMode="numeric" /></Field>
              <Field label="Cette estimation est…">
                <Segmented<Precision> value={r.manualPrecision ?? 'rough'} onChange={(manualPrecision) => set({ manualPrecision })} options={[{ value: 'exact', label: 'Calculée' }, { value: 'approx', label: 'Approximative' }, { value: 'rough', label: 'Très incertaine' }]} />
              </Field>
            </>
          ) : (
            <>
              {r.ingredients.length > 0 && (
                <ul className="-mx-4 mb-3 divide-y divide-line border-y border-line">
                  {r.ingredients.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => setEditing(i)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-bg">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{i.name}</div>
                          <div className="flex items-center gap-1.5 text-[12.5px] text-muted">{quantityText(i)} <PrecisionBadge precision={i.precision} /></div>
                          {i.note && <div className="text-[12px] text-warn">{i.note}</div>}
                        </div>
                        <span className="text-[13.5px] tabular-nums">{i.nutrients.kcal == null ? <span className="text-warn">?</span> : fmtKcal(i.nutrients.kcal)} kcal</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="soft" size="sm" onClick={() => setSheet('search')}><IconSearch size={17} /> Aliment</Button>
                <Button variant="soft" size="sm" onClick={() => setSheet('manual')}><IconEdit size={17} /> Saisie libre</Button>
                <Button variant="soft" size="sm" onClick={() => setSheet('import')}><IconText size={17} /> Coller un texte</Button>
                <Button variant="soft" size="sm" onClick={() => setSheet('family')}><IconFamily size={17} /> Plat familial</Button>
              </div>
            </>
          )}
          {nutrition.basis !== 'none' && (
            <div className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
              <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold">Par portion</span><span className="text-xl font-extrabold tabular-nums">~{fmtKcal(nutrition.perServing.kcal)} kcal</span></div>
              <div className="text-right text-[12.5px]">total ~{fmtKcal(nutrition.total.kcal)} kcal{nutrition.precision !== 'exact' ? ` (${fmtKcal(nutrition.total.kcalRange.min)}–${fmtKcal(nutrition.total.kcalRange.max)})` : ''}</div>
            </div>
          )}
          {nutrition.missingQuantities > 0 && !totalOnly && <Notice tone="warn" className="mt-3">{nutrition.missingQuantities} ingrédient(s) sans valeurs : touche-les pour compléter, sinon ils ne sont pas comptés.</Notice>}
        </Card>

        <Field label="Cuisine">
          <select value={r.cuisine ?? ''} onChange={(e) => set({ cuisine: e.target.value || undefined })} className="min-h-12 w-full rounded-xl border border-line bg-surface px-3">
            <option value="">Non précisée</option>
            {CUISINES.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((c) => <option key={c}>{c}</option>)}</optgroup>)}
            {prefs.customCuisines.length > 0 && <optgroup label="Mes catégories">{prefs.customCuisines.map((c) => <option key={c}>{c}</option>)}</optgroup>}
            {r.cuisine && !cuisines.includes(r.cuisine) && <option>{r.cuisine}</option>}
          </select>
          <div className="mt-2 flex gap-2">
            <TextInput value={newCuisine} onChange={(e) => setNewCuisine(e.target.value)} placeholder="Ou une autre (ex. Kabyle, Sénégalaise…)" />
            <Button variant="secondary" disabled={!newCuisine.trim()} onClick={() => set({ cuisine: newCuisine.trim() })}>OK</Button>
          </div>
        </Field>
        <Field label="Catégories">
          <div className="flex flex-wrap gap-2">
            {[...new Set([...CATEGORIES, ...r.categories])].map((c) => (
              <Chip key={c} active={r.categories.includes(c)} onClick={() => set({ categories: r.categories.includes(c) ? r.categories.filter((x) => x !== c) : [...r.categories, c] })}>{c}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Description (facultatif)"><TextArea value={r.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} rows={2} /></Field>
        <Field label="Préparation (facultatif)"><TextArea value={r.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value || undefined })} rows={4} /></Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Temps de préparation"><NumberInput value={r.prepTimeMin ?? null} onChange={(v) => set({ prepTimeMin: v })} suffix="min" inputMode="numeric" /></Field>
        </div>
        <Field label="Notes personnelles"><TextArea value={r.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} rows={2} /></Field>
        <Toggle checked={r.favorite} onChange={(favorite) => set({ favorite })} label="Recette favorite" desc="Affichée dans l’ajout rapide du tableau de bord." />
        {original && <p className="text-[12.5px] text-muted">Les repas déjà enregistrés gardent leurs valeurs. Si les calories changent, l’application te demandera si tu veux les mettre à jour.</p>}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3"><Button block size="lg" disabled={!r.name.trim() || r.servings <= 0} onClick={save}>Enregistrer la recette</Button></div>
      </div>

      <FoodPickerSheet open={sheet === 'search'} onClose={() => setSheet(null)} onAdd={(it) => addItems([it])} />
      <ManualSheet open={sheet === 'manual'} onClose={() => setSheet(null)} onAdd={(it) => addItems([it])} />
      <GuidedSheet open={sheet === 'family'} onClose={() => setSheet(null)} title={`Plat familial · ${r.servings} portions`} multiplier={r.servings} multiplierLabel={`Plat familial : estimation d’une assiette multipliée par ${r.servings} portions.`} onAdd={(items, a) => addItems(items, a)} />
      <ImportTextSheet open={sheet === 'import'} onClose={() => setSheet(null)} onImport={(title, items) => { if (title && !r.name) set({ name: title }); addItems(items); }} />
      <ItemEditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onDelete={() => { setR((x) => x && { ...x, ingredients: x.ingredients.filter((i) => i.id !== editing?.id) }); setEditing(null); }}
        onSave={(it) => { setR((x) => x && { ...x, ingredients: x.ingredients.map((i) => (i.id === it.id ? it : i)) }); setEditing(null); }}
      />
    </div>
  );
}

function ImportTextSheet({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (title: string | null, items: LineItem[]) => void }) {
  const [text, setText] = useState('');
  const foods = useMemo(() => REFERENCE_FOODS, []);
  const [mine, setMine] = useState<typeof REFERENCE_FOODS>([]);
  useEffect(() => { if (open) db.foods.toArray().then(setMine); else setText(''); }, [open]);
  const parsed = useMemo(() => {
    const p = parseRecipeText(text);
    const all = [...mine, ...foods];
    return { title: p.title, rows: p.lines.map((l) => lineFromParsed(all, l, newId('li'))) };
  }, [text, foods, mine]);
  const ok = parsed.rows.filter((r) => r.converted).length;
  return (
    <Sheet open={open} onClose={onClose} title="Importer depuis un texte" footer={<Button block disabled={!parsed.rows.length} onClick={() => { onImport(parsed.title, parsed.rows.map((r) => r.item)); onClose(); }}>Importer {parsed.rows.length} ingrédient(s)</Button>}>
      <p className="mb-2 text-[13.5px] text-muted">Colle une liste d’ingrédients, une ligne par ingrédient. Exemple :</p>
      <pre className="mb-3 rounded-xl bg-surface p-3 text-[12.5px] text-muted">Chorba{'\n'}500 g d'agneau{'\n'}2 oignons{'\n'}3 c. à soupe d'huile d'olive{'\n'}100 g de pois chiches cuits{'\n'}1 c. à soupe de concentré de tomate</pre>
      <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Colle ta recette ici…" />
      {parsed.rows.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[13px] font-semibold">{ok}/{parsed.rows.length} ligne(s) reconnue(s) automatiquement</p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface text-[13.5px]">
            {parsed.rows.map((r) => (
              <li key={r.item.id} className="px-3 py-2">
                <div className="flex justify-between gap-2"><span className="truncate">{r.item.name}</span><span className="tabular-nums">{r.converted ? `${fmtKcal(r.item.nutrients.kcal)} kcal` : <span className="text-warn">à compléter</span>}</span></div>
                {r.converted ? <div className="text-[12px] text-muted">→ {r.matched?.name} ({quantityText(r.item)})</div> : <div className="text-[12px] text-warn">{r.item.note}</div>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">Les correspondances utilisent la table de référence (valeurs moyennes) et tes aliments. Vérifie-les : tu pourras corriger chaque ligne.</p>
        </div>
      )}
    </Sheet>
  );
}
