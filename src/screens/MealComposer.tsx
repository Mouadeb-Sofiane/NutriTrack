/** Composition d'un repas : toutes les méthodes d'ajout mènent ici, avec correction avant enregistrement. */
import { useEffect, useRef, useState } from 'react';
import type { EstimationMethod, LineItem, MealEntry, MealType } from '../domain/types';
import { draftStore, emptyDraft, finalMethod, useDraft } from '../state/draft';
import { repo } from '../state/app';
import { goBack, navigate, type Route } from '../state/router';
import { fmtG, fmtKcal, hasMeaningfulRange, sumItems } from '../domain/nutrition';
import { formatDayLabel, isISODate, nowISO, today } from '../domain/dates';
import { newId } from '../data/ids';
import { MEAL_LABEL, MEAL_ORDER } from './labels';
import { Button, Card, Chip, Field, IconButton, Notice, PrecisionBadge, Segmented, TextArea, TextInput, Toggle, cx } from '../ui/kit';
import { IconBolt, IconBook, IconBurger, IconCamera, IconChevronLeft, IconClock, IconCookie, IconEdit, IconSearch, IconText, IconTrash, IconWand, IconX } from '../ui/icons';
import { useFeedback } from '../ui/feedback';
import { compressImage } from '../ui/photo';
import { PhotoView } from '../ui/PhotoView';
import { FoodPickerSheet } from './add/FoodPicker';
import { QuickTextSheet } from './add/QuickTextSheet';
import { CatalogSheet } from './add/CatalogSheet';
import { FastFoodSheet } from './add/FastFoodSheet';
import { PhotoIdentifySheet } from './add/PhotoIdentifySheet';
import { EstimateBadge } from '../ui/EstimatePanel';
import { findDuplicateItem, findRecentDuplicateMeal, scenarioTotals } from '../domain/estimates';
import { getLabel } from '../domain/recognition';
import { ManualSheet } from './add/ManualSheet';
import { GuidedSheet } from './add/GuidedSheet';
import { RecipePickerSheet } from './add/RecipePicker';
import { RecentSheet } from './add/RecentSheet';
import { ItemEditSheet } from './add/ItemEditSheet';

type SheetKind = 'search' | 'recipe' | 'guided' | 'manual' | 'quick' | 'recent' | 'text' | 'catalog' | 'fastfood' | null;

export function MealComposer({ route }: { route: Route }) {
  const draft = useDraft();
  const { confirm, toast } = useFeedback();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editing, setEditing] = useState<LineItem | null>(null);
  const [asRecipe, setAsRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoNotice, setPhotoNotice] = useState(false);
  const [identifyPhoto, setIdentifyPhoto] = useState<string | null>(null);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  /** Plat reconnu sur la photo en cours d'ajout, et ceux déjà ajoutés. */
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [addedLabels, setAddedLabels] = useState<string[]>([]);
  const [initialPick, setInitialPick] = useState<{ catalog?: string; template?: string; food?: string }>({});
  const [quickText, setQuickText] = useState('');
  const [pickRecipe, setPickRecipe] = useState<string | undefined>(undefined);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const originalPhoto = useRef<string | undefined>(undefined);
  const initialRecipe = route.query.get('recipe') ?? undefined;

  // Initialisation : repas existant (#/meal/:id), nouveau brouillon ou brouillon en cours.
  useEffect(() => {
    const id = route.path[0] === 'meal' ? route.path[1] : null;
    if (id) {
      if (draftStore.get()?.editingId !== id) {
        import('../data/db').then(({ db }) => db.meals.get(id)).then((m) => {
          if (m) { draftStore.fromMeal(m); originalPhoto.current = m.photoId; } else navigate('today', undefined, { replace: true });
        });
      }
      return;
    }
    const qDate = route.query.get('date');
    const qType = route.query.get('type') as MealType | null;
    const cur = draftStore.get();
    if (!cur || cur.editingId || route.query.get('fresh')) {
      draftStore.set(emptyDraft(qDate && isISODate(qDate) ? qDate : today(), qType && qType in MEAL_LABEL ? qType : undefined));
    }
    const m = route.query.get('method');
    if (initialRecipe) setSheet('recipe');
    else if (m === 'photo') setTimeout(() => cameraInput.current?.click(), 50);
    else if (m && ['search', 'guided', 'manual', 'quick', 'recent', 'text', 'catalog', 'fastfood'].includes(m)) setSheet(m as SheetKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft) return null;
  const totals = sumItems(draft.items);
  const isEdit = !!draft.editingId;
  const set = (patch: Partial<typeof draft>) => draftStore.update((d) => ({ ...d, ...patch }));
  /** Ajout avec contrôle des doublons : un même aliment n'est jamais compté deux fois sans accord. */
  const add = async (items: LineItem[], method: EstimationMethod, assumptions: string[] = []) => {
    const current = draftStore.get()?.items ?? [];
    const kept: LineItem[] = [];
    for (const it of items) {
      const dup = findDuplicateItem([...current, ...kept], it);
      if (dup && !(await confirm({ title: 'Déjà dans ce repas', text: `« ${dup.name} » (${quantityText(dup)}) est déjà ajouté. L’ajouter une seconde fois ?`, confirm: 'Ajouter quand même', cancel: 'Ne pas l’ajouter' }))) continue;
      kept.push(dup ? { ...it, id: newId('li') } : it);
    }
    if (kept.length) draftStore.addItems(kept, method, assumptions);
  };
  const scen = scenarioTotals(draft.items);

  /** Ajout depuis un plat reconnu sur la photo : on garde la trace de la reconnaissance. */
  const addRecognized = (items: LineItem[], method: EstimationMethod, assumptions: string[] = []) => {
    if (!pendingLabel) return add(items, method, assumptions);
    const label = pendingLabel.startsWith('recipe:') ? null : getLabel(pendingLabel);
    const note = `${label ? `« ${label.fr} » reconnu` : 'Recette proposée'} sur la photo par le modèle local, confirmé par l’utilisateur ; portion choisie par l’utilisateur.`;
    setAddedLabels((l) => [...l, pendingLabel]);
    return add(items, 'ai', [...assumptions, note]);
  };
  /** Fermeture d'un écran de choix : retour aux propositions de la photo si l'on venait de là. */
  const closePicker = () => {
    setSheet(null);
    setInitialPick({});
    if (pendingLabel) { setPendingLabel(null); setPhotoSheetOpen(true); }
  };

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      const blob = await compressImage(f);
      const id = await repo.savePhoto(blob);
      if (draft.photoId && draft.photoId !== originalPhoto.current) await repo.deletePhoto(draft.photoId);
      set({ photoId: id });
      setPhotoNotice(true);
      setAddedLabels([]);
      setIdentifyPhoto(id);
      setPhotoSheetOpen(true);
    } catch {
      toast('Impossible de lire cette image.', 'error');
    }
  };

  const removePhoto = async () => {
    if (draft.photoId && draft.photoId !== originalPhoto.current) await repo.deletePhoto(draft.photoId);
    set({ photoId: undefined });
  };

  const cancel = async () => {
    if (draft.items.length && !isEdit && !(await confirm({ title: 'Abandonner ce repas ?', text: 'Les aliments ajoutés ne seront pas enregistrés.', confirm: 'Abandonner', danger: true }))) return;
    if (!isEdit && draft.photoId) await repo.deletePhoto(draft.photoId);
    draftStore.set(null);
    goBack();
  };

  const save = async () => {
    setSaving(true);
    try {
      const entry: Omit<MealEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string } = {
        id: draft.editingId,
        createdAt: draft.createdAt,
        date: draft.date,
        mealType: draft.mealType,
        name: draft.name.trim() || undefined,
        items: draft.items,
        place: draft.place,
        restaurantName: draft.place === 'restaurant' ? draft.restaurantName.trim() || undefined : undefined,
        method: finalMethod(draft.methods),
        assumptions: draft.assumptions,
        photoId: draft.photoId,
        notes: draft.notes.trim() || undefined,
        userCorrected: draft.userCorrected,
      };
      if (!isEdit) {
        const sameDay = await repo.mealsOn(draft.date);
        const dup = findRecentDuplicateMeal(sameDay, { date: draft.date, mealType: draft.mealType, items: draft.items }, new Date());
        if (dup && !(await confirm({ title: 'Repas déjà enregistré ?', text: `Un repas identique (${MEAL_LABEL[dup.mealType]}) a été enregistré il y a quelques minutes. L’enregistrer une seconde fois ?`, confirm: 'Enregistrer quand même', cancel: 'Annuler' }))) return;
      }
      await repo.saveMeal(entry);
      if (isEdit && originalPhoto.current && originalPhoto.current !== draft.photoId) await repo.deletePhoto(originalPhoto.current);
      if (asRecipe && !isEdit) {
        const now = nowISO();
        await repo.saveRecipe({
          id: newId('rec'), name: draft.name.trim() || draft.items.map((i) => i.name).slice(0, 3).join(', '),
          categories: draft.place === 'restaurant' ? ['Restaurant'] : [], ingredients: draft.items.map((i) => ({ ...i, id: newId('li') })),
          servings: 1, assumptions: draft.assumptions, favorite: false, version: 1, createdAt: now, updatedAt: now,
          photoId: undefined, notes: draft.notes || undefined,
        });
      }
      const date = draft.date;
      draftStore.set(null);
      toast(isEdit ? 'Repas modifié' : asRecipe ? 'Repas et recette enregistrés' : 'Repas enregistré');
      navigate('today', { date: date === today() ? undefined : date }, { replace: true });
    } catch (e) {
      toast((e as Error).message || 'Enregistrement impossible.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.editingId) return;
    if (!(await confirm({ title: 'Supprimer ce repas ?', text: 'Cette action est définitive.', confirm: 'Supprimer', danger: true }))) return;
    await repo.deleteMeal(draft.editingId);
    if (draft.photoId) await repo.deletePhoto(draft.photoId);
    const date = draft.date;
    draftStore.set(null);
    toast('Repas supprimé');
    navigate('today', { date }, { replace: true });
  };

  const methods: { kind: SheetKind | 'photo'; label: string; desc: string; icon: React.ReactNode }[] = [
    { kind: 'text', label: 'Écrire ce que j’ai mangé', desc: '« kebab avec frites et un coca »', icon: <IconText /> },
    { kind: 'catalog', label: 'Snacks & street food', desc: 'Chips, churros, glace…', icon: <IconCookie /> },
    { kind: 'fastfood', label: 'Menu fast-food', desc: 'Plat, frites, sauce, boisson', icon: <IconBurger /> },
    { kind: 'search', label: 'Rechercher', desc: 'Aliment ou produit', icon: <IconSearch /> },
    { kind: 'recipe', label: 'Mes recettes', desc: 'Plats enregistrés', icon: <IconBook /> },
    { kind: 'photo', label: 'Photo', desc: 'Photographier le plat', icon: <IconCamera /> },
    { kind: 'guided', label: 'Plat maison', desc: 'Estimation sans balance', icon: <IconWand /> },
    { kind: 'recent', label: 'Récents', desc: 'Dupliquer un repas', icon: <IconClock /> },
    { kind: 'quick', label: 'Calories rapides', desc: 'Juste un chiffre', icon: <IconBolt /> },
    { kind: 'manual', label: 'Saisie manuelle', desc: 'Valeurs détaillées', icon: <IconEdit /> },
  ];
  const openMethod = (k: SheetKind | 'photo') => {
    if (k === 'text') setQuickText('');
    if (k === 'photo') cameraInput.current?.click();
    else setSheet(k);
  };

  return (
    <div className="mx-auto max-w-lg pb-32">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-1 bg-bg/90 px-2 py-2 backdrop-blur">
        <IconButton label="Retour" onClick={cancel}><IconChevronLeft /></IconButton>
        <h1 className="flex-1 text-lg font-bold">{isEdit ? 'Modifier le repas' : 'Ajouter un repas'}</h1>
        {isEdit && <IconButton label="Supprimer le repas" onClick={remove} className="text-danger"><IconTrash /></IconButton>}
      </header>

      <div className="px-4">
        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {MEAL_ORDER.map((t) => <Chip key={t} active={draft.mealType === t} onClick={() => set({ mealType: t })}>{MEAL_LABEL[t]}</Chip>)}
        </div>
        <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2">
          <Segmented value={draft.place} onChange={(place) => set({ place })} options={[{ value: 'home', label: 'À la maison' }, { value: 'restaurant', label: 'Restaurant / extérieur' }]} />
          <label className="relative">
            <span className="sr-only">Date</span>
            <input type="date" value={draft.date} max="2100-12-31" onChange={(e) => isISODate(e.target.value) && set({ date: e.target.value })} className="h-12 rounded-xl border border-line bg-surface px-2 text-sm" />
          </label>
        </div>
        {draft.date !== today() && <p className="-mt-1 mb-3 px-1 text-[13px] text-muted">Repas du {formatDayLabel(draft.date).toLowerCase()}</p>}
        {draft.place === 'restaurant' && (
          <Field label="Restaurant (facultatif)">
            <TextInput value={draft.restaurantName} onChange={(e) => set({ restaurantName: e.target.value })} placeholder="Nom du restaurant" />
          </Field>
        )}

        {draft.photoId && (
          <div className="relative mb-3 overflow-hidden rounded-[var(--radius-card)]">
            <PhotoView id={draft.photoId} className="h-48 w-full" />
            <IconButton label="Retirer la photo" onClick={removePhoto} className="absolute right-2 top-2 bg-surface/90"><IconX /></IconButton>
          </div>
        )}
        {photoNotice && (
          <Notice className="mb-3">
            📷 Photo gardée sur ton téléphone. <button type="button" className="font-semibold text-brand" onClick={() => { setIdentifyPhoto(draft.photoId ?? null); setPhotoSheetOpen(true); }}>Reconnaître le plat</button>, puis corrige si besoin.
          </Notice>
        )}

        {draft.items.length === 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <button key={m.label} type="button" onClick={() => openMethod(m.kind)} className={cx('flex min-h-24 flex-col items-start justify-between rounded-[var(--radius-card)] bg-surface p-3.5 text-left shadow-[0_1px_2px_rgba(16,40,30,0.06)] active:bg-bg', m.kind === 'text' && 'col-span-2 min-h-16 flex-row items-center gap-3 !justify-start border-2 border-brand/30')}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">{m.icon}</span>
                <span>
                  <span className="block font-semibold">{m.label}</span>
                  <span className="block text-[12.5px] text-muted">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <Card className="mb-3 !p-0">
              <ul className="divide-y divide-line">
                {draft.items.map((it) => (
                  <li key={it.id}>
                    <button type="button" onClick={() => setEditing(it)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-bg">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{it.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                          <span>{quantityText(it)}</span>
                          {it.estimate ? <EstimateBadge estimate={it.estimate} /> : <PrecisionBadge precision={it.precision} />}
                          {it.note && <span className="truncate">· {it.note}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{it.nutrients.kcal == null ? <span className="text-warn">? kcal</span> : `${fmtKcal(it.nutrients.kcal)} kcal`}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
              {methods.map((m) => <Chip key={m.label} onClick={() => openMethod(m.kind)}><span className="text-brand">{m.icon}</span>{m.label}</Chip>)}
            </div>
            <Card className="mb-3">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-muted">Total du repas</span>
                <span className="text-2xl font-extrabold tabular-nums">{hasMeaningfulRange(totals) ? '~' : ''}{fmtKcal(totals.kcal)} kcal</span>
              </div>
              {hasMeaningfulRange(totals) && <div className="text-right text-[13px] text-muted">fourchette plausible : {fmtKcal(totals.kcalRange.min)} – {fmtKcal(totals.kcalRange.max)} kcal</div>}
              <div className="mt-2 flex justify-between text-[13.5px] tabular-nums">
                <span><span className="text-protein">●</span> P {fmtG(totals.protein)} g</span>
                <span><span className="text-carbs">●</span> G {fmtG(totals.carbs)} g</span>
                <span><span className="text-fat">●</span> L {fmtG(totals.fat)} g</span>
              </div>
              {scen.uncertainCount > 0 && (
                <div className="mt-3 rounded-xl bg-bg px-3 py-2 text-[13px]">
                  <div className="flex justify-between"><span className="text-muted">Estimation moyenne</span><span className="font-semibold tabular-nums">{fmtKcal(scen.mean)} kcal</span></div>
                  <div className="flex justify-between"><span className="text-accent">Estimation haute</span><span className="font-semibold tabular-nums">{fmtKcal(scen.high)} kcal</span></div>
                  <p className="mt-1 text-[12px] text-muted">Le total retenu utilise {scen.highChosenCount || scen.customCount ? 'tes choix élément par élément' : 'l’estimation moyenne'}. Touche un élément pour retenir son estimation haute ou une autre valeur.</p>
                </div>
              )}
              {totals.missing.kcal > 0 && <Notice tone="warn" className="mt-3">{totals.missing.kcal} aliment(s) sans calories : le total est incomplet. Touche-les pour compléter.</Notice>}
            </Card>
            {draft.assumptions.length > 0 && (
              <details className="mb-3 rounded-2xl bg-surface px-4 py-3 text-[13.5px]">
                <summary className="cursor-pointer font-semibold">Hypothèses de l’estimation ({draft.assumptions.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{draft.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              </details>
            )}
            <Field label="Nom du repas (facultatif)">
              <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={draft.place === 'restaurant' ? 'Ex. Burger au resto' : 'Ex. Couscous du vendredi'} />
            </Field>
            <Field label="Notes (facultatif)">
              <TextArea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
            </Field>
            {!isEdit && <Toggle checked={asRecipe} onChange={setAsRecipe} label="Enregistrer aussi comme recette" desc="Pour réutiliser ce plat en un geste la prochaine fois." />}
          </>
        )}
      </div>

      {draft.items.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-lg gap-2 px-4 py-3">
            <Button className="flex-1" size="lg" disabled={saving} onClick={save}>{isEdit ? 'Enregistrer les modifications' : `Enregistrer · ${fmtKcal(totals.kcal)} kcal`}</Button>
          </div>
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      {!draft.photoId && draft.items.length === 0 && (
        <p className="mt-3 text-center text-[13px] text-muted">
          ou <button type="button" className="font-semibold text-brand" onClick={() => galleryInput.current?.click()}>importer une photo depuis la galerie</button>
        </p>
      )}

      <FoodPickerSheet open={sheet === 'search'} initialFoodId={initialPick.food} onClose={closePicker} onAdd={(it) => addRecognized([it], 'database')} />
      <RecipePickerSheet open={sheet === 'recipe'} initialRecipeId={pickRecipe ?? initialRecipe} onClose={() => { setPickRecipe(undefined); closePicker(); }} onAdd={(it) => addRecognized([it], 'recipe')} />
      <GuidedSheet open={sheet === 'guided'} initialTemplate={initialPick.template} onClose={closePicker} onAdd={(items, a) => addRecognized(items, 'guided', a)} />
      <ManualSheet open={sheet === 'manual'} onClose={() => setSheet(null)} onAdd={(it) => add([it], 'manual')} />
      <ManualSheet open={sheet === 'quick'} quick onClose={() => setSheet(null)} onAdd={(it) => add([it], 'quick')} />
      <QuickTextSheet open={sheet === 'text'} initialText={quickText} onClose={() => setSheet(null)} onAdd={(items, name) => { add(items, 'guided'); if (!draftStore.get()?.name && name) set({ name }); }} />
      <CatalogSheet open={sheet === 'catalog'} initialEntryId={initialPick.catalog} onClose={closePicker} onAdd={(it) => addRecognized([it], 'guided')} />
      <FastFoodSheet open={sheet === 'fastfood'} onClose={() => setSheet(null)} onAdd={(items, name) => { add(items, 'guided'); if (!draftStore.get()?.name && name) set({ name }); if (draft.place === 'home') set({ place: 'restaurant' }); }} />
      <PhotoIdentifySheet photoId={identifyPhoto} open={photoSheetOpen} added={addedLabels}
        onClose={() => { setPhotoSheetOpen(false); if (addedLabels.length) setPhotoNotice(false); }}
        onText={(t) => { setPhotoSheetOpen(false); setQuickText(t); setSheet('text'); }}
        onHomeDish={() => { setPhotoSheetOpen(false); setInitialPick({}); setSheet('guided'); }}
        onPick={(labelId, target) => {
          setPhotoSheetOpen(false);
          setPendingLabel(labelId);
          if (target.kind === 'catalog') { setInitialPick({ catalog: target.id }); setSheet('catalog'); }
          else if (target.kind === 'template') { setInitialPick({ template: target.id }); setSheet('guided'); }
          else { setInitialPick({ food: target.id }); setSheet('search'); }
        }}
        onPickRecipe={(r) => { setPhotoSheetOpen(false); setPendingLabel(`recipe:${r.id}`); setPickRecipe(r.id); setSheet('recipe'); }} />
      <RecentSheet open={sheet === 'recent'} onClose={() => setSheet(null)}
        onPickItem={(it) => add([{ ...it, id: newId('li') }], it.estimate ? 'guided' : it.recipeId ? 'recipe' : it.source.kind === 'manual' ? 'manual' : 'database')}
        onPick={(m) => {
        add(m.items.map((i) => ({ ...i, id: newId('li') })), m.method, m.assumptions);
        if (!draft.name && m.name) set({ name: m.name });
      }} />
      <ItemEditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onDelete={() => { draftStore.update((d) => ({ ...d, items: d.items.filter((i) => i.id !== editing?.id) })); setEditing(null); }}
        onReplace={(items) => { draftStore.update((d) => ({ ...d, name: d.name || (d.items.length === 1 ? editing?.name ?? '' : d.name), items: d.items.flatMap((i) => (i.id === editing?.id ? items : [i])), userCorrected: true, methods: d.methods.includes('mixed') ? d.methods : [...d.methods, 'mixed'] })); setEditing(null); }}
        onSave={(it, corrected) => { draftStore.update((d) => ({ ...d, items: d.items.map((i) => (i.id === it.id ? it : i)), userCorrected: d.userCorrected || corrected })); setEditing(null); }}
      />
    </div>
  );
}

export function quantityText(it: LineItem): string {
  if (it.unit === 'g' || it.unit === 'ml') return `${fmtG(it.quantity, 1)} ${it.unit}`;
  if (it.unit === 'serving' && it.unitLabel) {
    const l = it.unitLabel.replace(/^1 /, '');
    return it.quantity === 1 ? `1 ${l}` : `${fmtG(it.quantity, 2)} × ${l}`;
  }
  if (it.unitLabel) return it.unitLabel;
  if (it.baseAmount != null && it.baseUnit) return `${fmtG(it.baseAmount)} ${it.baseUnit}`;
  return 'quantité non précisée';
}
