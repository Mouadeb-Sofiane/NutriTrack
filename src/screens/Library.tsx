/** Onglet « Repas » : recettes, aliments personnels et portions habituelles. */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { repo, useApp } from '../state/app';
import { href, navigate, type Route } from '../state/router';
import { normalize } from '../domain/referenceFoods';
import { recipeNutrition } from '../domain/recipes';
import { checkPer100, fmtG, fmtKcal } from '../domain/nutrition';
import type { Food, Nutrients } from '../domain/types';
import { newId } from '../data/ids';
import { CUISINES } from './labels';
import { Button, Card, Chip, EmptyState, Field, IconButton, Notice, NumberInput, PrecisionBadge, Segmented, SourceBadge, TextInput } from '../ui/kit';
import { IconBook, IconPlus, IconSearch, IconStar, IconText, IconTrash } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { useFeedback } from '../ui/feedback';
import { PhotoView } from '../ui/PhotoView';

type Tab = 'recipes' | 'foods' | 'portions';

export function Library({ route }: { route: Route }) {
  const tab = (route.query.get('tab') as Tab) || 'recipes';
  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pt-4">
        <h1 className="mb-3 text-2xl font-extrabold">Repas & recettes</h1>
        <Segmented<Tab> value={tab} onChange={(t) => navigate('meals', { tab: t }, { replace: true })} options={[{ value: 'recipes', label: 'Recettes' }, { value: 'foods', label: 'Mes aliments' }, { value: 'portions', label: 'Portions' }]} />
      </header>
      {tab === 'recipes' && <Recipes />}
      {tab === 'foods' && <MyFoods />}
      {tab === 'portions' && <Portions />}
    </div>
  );
}

function Recipes() {
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const { prefs } = useApp();
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [maxKcal, setMaxKcal] = useState<number | null>(null);
  const used = useMemo(() => [...new Set((recipes ?? []).flatMap((r) => [r.cuisine, ...r.categories]).filter(Boolean) as string[])].sort(), [recipes]);

  const list = useMemo(() => {
    const nq = normalize(q);
    return (recipes ?? [])
      .filter((r) => !favOnly || r.favorite)
      .filter((r) => !cuisine || r.cuisine === cuisine || r.categories.includes(cuisine))
      .filter((r) => {
        if (!maxKcal) return true;
        const n = recipeNutrition(r);
        return n.basis !== 'none' && n.perServing.kcal <= maxKcal;
      })
      .filter((r) => !nq || normalize(`${r.name} ${r.description ?? ''} ${r.cuisine ?? ''} ${r.categories.join(' ')} ${r.ingredients.map((i) => i.name).join(' ')}`).includes(nq))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'fr'));
  }, [recipes, q, cuisine, favOnly, maxKcal]);

  if (!recipes) return null;
  return (
    <div className="mt-4">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button onClick={() => navigate('recipe/new')}><IconPlus /> Nouvelle recette</Button>
        <Button variant="secondary" onClick={() => navigate('recipe/new', { import: 1 })}><IconText /> Depuis un texte</Button>
      </div>
      {recipes.length === 0 ? (
        <EmptyState icon={<IconBook />} title="Ton carnet de recettes est vide" text="Ajoute tes plats habituels — couscous familial, soupe, salade… Même un nom et un total approximatif suffisent pour commencer." />
      ) : (
        <>
          <div className="relative mb-2">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={20} />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ingrédient, cuisine…" className="pl-11" />
          </div>
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <Chip active={favOnly} onClick={() => setFavOnly(!favOnly)}><IconStar size={15} filled={favOnly} /> Favoris</Chip>
            <Chip active={maxKcal === 500} onClick={() => setMaxKcal(maxKcal === 500 ? null : 500)}>≤ 500 kcal/portion</Chip>
            {[...new Set([...used, ...prefs.customCuisines])].map((c) => <Chip key={c} active={cuisine === c} onClick={() => setCuisine(cuisine === c ? null : c)}>{c}</Chip>)}
          </div>
          <div className="space-y-2">
            {list.map((r) => {
              const n = recipeNutrition(r);
              return (
                <Card key={r.id} onClick={() => navigate(`recipe/${r.id}`)} className="!p-3">
                  <div className="flex items-center gap-3">
                    {r.photoId ? <PhotoView id={r.photoId} className="h-14 w-14 shrink-0 rounded-2xl" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-xl">🍲</div>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.name}{r.favorite && <IconStar filled size={14} className="ml-1 inline text-accent" />}</div>
                      <div className="truncate text-[12.5px] text-muted">{[r.cuisine, ...r.categories].filter(Boolean).join(' · ') || `${r.servings} portion${r.servings > 1 ? 's' : ''}`}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[13px]">
                        {n.basis === 'none' ? <span className="text-warn">Valeurs à compléter</span> : <><span className="font-semibold tabular-nums">~{fmtKcal(n.perServing.kcal)} kcal</span><span className="text-muted">/ portion</span><PrecisionBadge precision={n.precision} /></>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            {!list.length && <p className="py-6 text-center text-sm text-muted">Aucune recette ne correspond aux filtres.</p>}
          </div>
        </>
      )}
      <p className="mt-6 text-center text-[12.5px] text-muted">Cuisines proposées : {CUISINES.map((c) => c.group).join(', ')}… et les tiennes.</p>
    </div>
  );
}

function MyFoods() {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const { confirm, toast } = useFeedback();
  if (!foods) return null;
  const sorted = [...foods].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'fr'));
  return (
    <div className="mt-4">
      <Button block onClick={() => setEditing('new')}><IconPlus /> Nouvel aliment</Button>
      <p className="mb-3 mt-2 text-[12.5px] text-muted">Tes produits et aliments favoris, disponibles hors ligne. La table de référence intégrée (~100 aliments courants) est toujours accessible via la recherche.</p>
      {sorted.length === 0 ? (
        <EmptyState title="Aucun aliment personnel" text="Ajoute ici les produits que tu consommes souvent (valeurs lues sur l’étiquette), ou marque des aliments comme favoris depuis la recherche." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {sorted.map((f) => (
            <li key={f.id} className="flex items-center gap-1 pl-4">
              <button type="button" className="min-w-0 flex-1 py-3 text-left" onClick={() => setEditing(f)}>
                <div className="truncate font-medium">{f.name}{f.brand && <span className="text-muted"> · {f.brand}</span>}</div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-muted">{fmtKcal(f.per100.kcal)} kcal / 100 {f.basis} <SourceBadge source={f.source} /></div>
              </button>
              <IconButton label={f.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => repo.saveFood({ ...f, favorite: !f.favorite })} className={f.favorite ? 'text-accent' : 'text-muted'}><IconStar filled={f.favorite} size={20} /></IconButton>
              <IconButton label="Supprimer" className="text-muted" onClick={async () => {
                if (await confirm({ title: `Supprimer « ${f.name} » ?`, text: 'Les repas déjà enregistrés gardent leurs valeurs.', confirm: 'Supprimer', danger: true })) { await repo.deleteFood(f.id); toast('Aliment supprimé'); }
              }}><IconTrash size={19} /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <FoodEditor food={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function FoodEditor({ food, onClose }: { food: Food | 'new' | null; onClose: () => void }) {
  const initial = food === 'new' || !food ? null : food;
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [basis, setBasis] = useState<'g' | 'ml'>('g');
  const [n, setN] = useState<Nutrients>({ kcal: null, protein: null, carbs: null, fat: null });
  const [serving, setServing] = useState<number | null>(null);
  const [key, setKey] = useState<unknown>(null);
  const { toast } = useFeedback();
  if (food !== key) {
    setKey(food);
    setName(initial?.name ?? ''); setBrand(initial?.brand ?? ''); setBasis(initial?.basis ?? 'g');
    setN(initial?.per100 ?? { kcal: null, protein: null, carbs: null, fat: null });
    setServing(initial?.servings.find((s) => s.label.startsWith('1 portion'))?.amount ?? null);
  }
  const check = checkPer100(n, basis);
  const save = async () => {
    try {
      const servings = [...(initial?.servings.filter((s) => !s.label.startsWith('1 portion')) ?? [])];
      if (serving && serving > 0) servings.unshift({ id: 'sp', label: `1 portion (${fmtG(serving)} ${basis})`, amount: serving, precision: 'exact' });
      await repo.saveFood({
        id: initial?.id ?? newId('food'), name, brand: brand.trim() || undefined, basis, per100: n, servings,
        source: initial && initial.source.kind !== 'manual' ? { ...initial.source, label: `${initial.source.label ?? ''} (modifié)` } : { kind: 'manual', label: 'Saisi par moi' },
        favorite: initial?.favorite ?? true, barcode: initial?.barcode, density: initial?.density, createdAt: initial?.createdAt,
      });
      toast('Aliment enregistré');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const setK = (k: keyof Nutrients) => (v: number | null) => setN((x) => ({ ...x, [k]: v }));
  return (
    <Sheet open={!!food} onClose={onClose} title={initial ? 'Modifier l’aliment' : 'Nouvel aliment'} footer={<Button block disabled={!name.trim() || !check.ok || n.kcal == null} onClick={save}>Enregistrer</Button>}>
      <Field label="Nom"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Pain complet de ma boulangerie" /></Field>
      <Field label="Marque (facultatif)"><TextInput value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
      <Field label="Valeurs indiquées pour"><Segmented value={basis} onChange={setBasis} options={[{ value: 'g', label: '100 g' }, { value: 'ml', label: '100 ml' }]} /></Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Calories"><NumberInput value={n.kcal} onChange={setK('kcal')} suffix="kcal" /></Field>
        <Field label="Protéines"><NumberInput value={n.protein} onChange={setK('protein')} suffix="g" /></Field>
        <Field label="Glucides"><NumberInput value={n.carbs} onChange={setK('carbs')} suffix="g" /></Field>
        <Field label="Lipides"><NumberInput value={n.fat} onChange={setK('fat')} suffix="g" /></Field>
      </div>
      <Field label="Portion habituelle (facultatif)" hint="Ex. 1 pot = 125 g, 1 tranche = 35 g."><NumberInput value={serving} onChange={setServing} suffix={basis} /></Field>
      {check.errors.map((e) => <Notice key={e} tone="warn" className="mb-2">{e}</Notice>)}
      {check.warnings.map((e) => <Notice key={e} className="mb-2">{e}</Notice>)}
      {initial && <p className="text-[12.5px] text-muted">Modifier cet aliment ne change pas les repas déjà enregistrés.</p>}
    </Sheet>
  );
}

function Portions() {
  const portions = useLiveQuery(() => db.portions.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const { confirm } = useFeedback();
  if (!portions) return null;
  return (
    <div className="mt-4">
      <Notice className="mb-3">Une portion habituelle, c’est par exemple « mon bol de soupe de lentilles » = 1,5 portion de la recette. Crée-les depuis la fiche d’une recette (bouton « Portion habituelle »).</Notice>
      {portions.length === 0 ? (
        <EmptyState title="Aucune portion habituelle" text="Elles apparaîtront ici et dans le choix de la quantité quand tu ajoutes une recette." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {portions.map((p) => {
            const r = recipes.find((x) => x.id === p.recipeId);
            return (
              <li key={p.id} className="flex items-center gap-2 pl-4">
                <a href={r ? href(`recipe/${r.id}`) : undefined} className="min-w-0 flex-1 py-3">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-[12.5px] text-muted">{r?.name ?? 'Recette supprimée'} · {p.amount ? `${fmtG(p.amount)} g` : `${fmtG(p.servings ?? 1, 2)} portion(s)`}</div>
                </a>
                <IconButton label="Supprimer" className="text-muted" onClick={async () => (await confirm({ title: `Supprimer « ${p.name} » ?`, confirm: 'Supprimer', danger: true })) && repo.deletePortion(p.id)}><IconTrash size={19} /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

