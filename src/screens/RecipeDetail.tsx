import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { repo } from '../state/app';
import { goBack, navigate } from '../state/router';
import { makeVariant, recipeNutrition } from '../domain/recipes';
import { fmtG, fmtKcal, PRECISION_LABEL } from '../domain/nutrition';
import { formatDayLabel, nowISO } from '../domain/dates';
import { draftStore, emptyDraft } from '../state/draft';
import { newId } from '../data/ids';
import { Button, Card, Field, IconButton, Notice, NumberInput, PrecisionBadge, SectionTitle, TextInput } from '../ui/kit';
import { IconChevronLeft, IconCopy, IconEdit, IconPlus, IconStar, IconTrash } from '../ui/icons';
import { useFeedback } from '../ui/feedback';
import { PhotoView } from '../ui/PhotoView';
import { Sheet } from '../ui/Sheet';
import { quantityText } from './MealComposer';

export function RecipeDetail({ id }: { id: string }) {
  const recipe = useLiveQuery(() => db.recipes.get(id), [id]);
  const meals = useLiveQuery(() => db.meals.where('recipeIds').equals(id).toArray(), [id]) ?? [];
  const variants = useLiveQuery(() => db.recipes.where('parentId').equals(id).toArray(), [id]) ?? [];
  const { confirm, toast } = useFeedback();
  const [portionOpen, setPortionOpen] = useState(false);
  if (recipe === undefined) return null;
  if (!recipe) return <div className="p-6 text-center">Recette introuvable. <button className="text-brand" onClick={() => navigate('meals')}>Retour</button></div>;

  const n = recipeNutrition(recipe);
  const lastDates = [...new Set(meals.map((m) => m.date))].sort().reverse().slice(0, 5);

  const duplicate = async (variant: boolean) => {
    const now = nowISO();
    let label = 'copie';
    if (variant) {
      const l = window.prompt('Nom de la variante (ex. « moins d’huile », « version légère »)', 'variante');
      if (!l) return;
      label = l;
    }
    const copy = makeVariant(recipe, newId('rec'), label, now);
    if (!variant) { delete copy.parentId; delete copy.variantLabel; copy.name = `${recipe.name} (copie)`; }
    copy.ingredients = copy.ingredients.map((i) => ({ ...i, id: newId('li') }));
    await repo.saveRecipe(copy);
    toast(variant ? 'Variante créée : modifie-la librement' : 'Recette dupliquée');
    navigate(`recipe/${copy.id}/edit`);
  };

  const remove = async () => {
    if (!(await confirm({ title: `Supprimer « ${recipe.name} » ?`, text: meals.length ? `${meals.length} repas l’utilisent : ils gardent leurs valeurs enregistrées.` : 'Cette action est définitive.', confirm: 'Supprimer', danger: true }))) return;
    await repo.deleteRecipe(recipe.id);
    if (recipe.photoId) await repo.deletePhoto(recipe.photoId);
    toast('Recette supprimée');
    navigate('meals', undefined, { replace: true });
  };

  const addToMeal = () => {
    draftStore.set(emptyDraft());
    navigate('add', { recipe: recipe.id });
  };

  return (
    <div className="mx-auto max-w-lg pb-32">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-1 bg-bg/90 px-2 py-2 backdrop-blur">
        <IconButton label="Retour" onClick={() => goBack('meals')}><IconChevronLeft /></IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{recipe.name}</h1>
        <IconButton label={recipe.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} className={recipe.favorite ? 'text-accent' : ''} onClick={() => repo.saveRecipe({ ...recipe, favorite: !recipe.favorite }, { bumpVersion: false })}><IconStar filled={recipe.favorite} /></IconButton>
        <IconButton label="Modifier" onClick={() => navigate(`recipe/${recipe.id}/edit`)}><IconEdit /></IconButton>
      </header>
      <div className="px-4">
        {recipe.photoId && <PhotoView id={recipe.photoId} className="mb-3 h-52 w-full rounded-[var(--radius-card)]" />}
        <div className="mb-3 flex flex-wrap gap-1.5 text-[12.5px]">
          {[recipe.cuisine, ...recipe.categories].filter(Boolean).map((c) => <span key={c} className="rounded-full bg-surface px-2.5 py-1 font-medium">{c}</span>)}
          {recipe.prepTimeMin ? <span className="rounded-full bg-surface px-2.5 py-1">⏱ {recipe.prepTimeMin} min</span> : null}
          {recipe.variantLabel && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand-strong">Variante : {recipe.variantLabel}</span>}
        </div>
        {recipe.description && <p className="mb-3 text-[15px] leading-relaxed">{recipe.description}</p>}

        <Card>
          {n.basis === 'none' ? (
            <Notice tone="warn">Pas encore de valeurs nutritionnelles. Ajoute des ingrédients ou un total estimé dans « Modifier ».</Notice>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-muted">Par portion</span>
                <span className="text-2xl font-extrabold tabular-nums">~{fmtKcal(n.perServing.kcal)} kcal</span>
              </div>
              {n.precision !== 'exact' && <div className="text-right text-[12.5px] text-muted">fourchette plausible : {fmtKcal(n.perServing.kcalRange.min)} – {fmtKcal(n.perServing.kcalRange.max)} kcal</div>}
              {n.basis === 'ingredients' && (
                <div className="mt-2 flex justify-between text-[13.5px] tabular-nums">
                  <span><span className="text-protein">●</span> P {fmtG(n.perServing.protein)} g</span>
                  <span><span className="text-carbs">●</span> G {fmtG(n.perServing.carbs)} g</span>
                  <span><span className="text-fat">●</span> L {fmtG(n.perServing.fat)} g</span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px] text-muted">
                <span>Total : ~{fmtKcal(n.total.kcal)} kcal · {recipe.servings} portion{recipe.servings > 1 ? 's' : ''}{recipe.totalWeightG ? ` · ${fmtG(recipe.totalWeightG)} g` : ''}</span>
                <PrecisionBadge precision={n.precision} />
              </div>
              <p className="mt-1 text-[12.5px] text-muted">
                {n.basis === 'manual' ? 'Total estimé saisi directement (ingrédients non détaillés).' : `Somme des ingrédients. ${PRECISION_LABEL[n.precision]} pour au moins un ingrédient.`}
                {n.missingQuantities > 0 && ` ${n.missingQuantities} ingrédient(s) sans quantité ne sont pas comptés.`}
              </p>
            </>
          )}
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setPortionOpen(true)}><IconPlus size={18} /> Ma portion</Button>
          <Button variant="secondary" onClick={() => duplicate(true)}><IconCopy size={18} /> Variante</Button>
        </div>

        {recipe.ingredients.length > 0 && (
          <>
            <SectionTitle>Ingrédients</SectionTitle>
            <Card className="!p-0">
              <ul className="divide-y divide-line">
                {recipe.ingredients.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{i.name}</div>
                      <div className="text-[12.5px] text-muted">{quantityText(i)}</div>
                    </div>
                    <span className="text-[13.5px] tabular-nums text-muted">{i.nutrients.kcal == null ? '?' : fmtKcal(i.nutrients.kcal)} kcal</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
        {recipe.instructions && (<><SectionTitle>Préparation</SectionTitle><Card><p className="whitespace-pre-line text-[15px] leading-relaxed">{recipe.instructions}</p></Card></>)}
        {recipe.notes && (<><SectionTitle>Notes</SectionTitle><Card><p className="whitespace-pre-line text-[15px]">{recipe.notes}</p></Card></>)}
        {recipe.assumptions.length > 0 && (
          <details className="mt-3 rounded-2xl bg-surface px-4 py-3 text-[13.5px]">
            <summary className="cursor-pointer font-semibold">Hypothèses d’estimation</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{recipe.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
        )}
        {variants.length > 0 && (
          <>
            <SectionTitle>Variantes</SectionTitle>
            <div className="space-y-2">{variants.map((v) => <Card key={v.id} onClick={() => navigate(`recipe/${v.id}`)} className="!py-3"><span className="font-medium">{v.variantLabel ?? v.name}</span> <span className="text-[13px] text-muted">· ~{fmtKcal(recipeNutrition(v).perServing.kcal)} kcal/portion</span></Card>)}</div>
          </>
        )}
        <SectionTitle>Historique</SectionTitle>
        <Card>
          {lastDates.length ? (
            <p className="text-[14px]">Consommée {meals.length} fois. Dernières fois : {lastDates.map((d) => formatDayLabel(d).toLowerCase()).join(', ')}.</p>
          ) : <p className="text-[14px] text-muted">Pas encore consommée.</p>}
          <p className="mt-1 text-[12px] text-muted">Version {recipe.version} · modifiée le {new Date(recipe.updatedAt).toLocaleDateString('fr-FR')}</p>
        </Card>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => duplicate(false)}><IconCopy size={16} /> Dupliquer</Button>
          <Button variant="ghost" size="sm" className="!text-danger" onClick={remove}><IconTrash size={16} /> Supprimer</Button>
        </div>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3"><Button block size="lg" onClick={addToMeal}>Ajouter à un repas</Button></div>
      </div>
      <PortionSheet open={portionOpen} onClose={() => setPortionOpen(false)} recipeId={recipe.id} hasWeight={!!recipe.totalWeightG} />
    </div>
  );
}

function PortionSheet({ open, onClose, recipeId, hasWeight }: { open: boolean; onClose: () => void; recipeId: string; hasWeight: boolean }) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState<number | null>(1);
  const [grams, setGrams] = useState<number | null>(null);
  const { toast } = useFeedback();
  const save = async () => {
    try {
      await repo.savePortion({ name, recipeId, servings: grams ? null : servings, amount: grams, unit: grams ? 'g' : undefined });
      toast('Portion enregistrée');
      setName(''); onClose();
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Portion habituelle" footer={<Button block disabled={!name.trim() || (!servings && !grams)} onClick={save}>Enregistrer</Button>}>
      <Field label="Nom" hint="Ex. « Mon bol habituel », « Assiette du soir »"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Correspond à combien de portions de la recette ?"><NumberInput value={servings} onChange={setServings} suffix="portion(s)" /></Field>
      {hasWeight && <Field label="… ou à un poids (si tu l’as pesé une fois)"><NumberInput value={grams} onChange={setGrams} suffix="g" /></Field>}
      <p className="text-[12.5px] text-muted">Le nom seul ne permet pas de connaître le poids réel : c’est ta correspondance qui sert au calcul.</p>
    </Sheet>
  );
}
