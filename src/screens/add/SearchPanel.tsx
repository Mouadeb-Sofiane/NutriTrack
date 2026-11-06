/** Champ de recherche unifié avec filtres (aliments, plats, boissons, produits, mes recettes, récents). */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { useSearch, type SearchRef } from '../../data/searchIndex';
import { tokens, type SearchDoc, type SearchKind } from '../../domain/search';
import { recentDistinctItems } from '../../domain/stats';
import { fmtKcal } from '../../domain/nutrition';
import { compositionTotals } from '../../domain/dishes';
import { recipeNutrition } from '../../domain/recipes';
import { Button, Chip, Notice, TextInput, cx } from '../../ui/kit';
import { IconSearch, IconStar } from '../../ui/icons';
import type { MealEntry } from '../../domain/types';
import { useApp } from '../../state/app';
import { itemSignature } from '../../domain/estimates';

export const KIND_LABEL: Record<SearchKind, string> = {
  food: 'Aliment',
  dish: 'Plat',
  drink: 'Boisson',
  product: 'Produit',
  recipe: 'Ma recette',
  catalog: 'Plat',
  recent: 'Récent',
};

type Filter = 'all' | 'food' | 'dish' | 'drink' | 'product' | 'recipe' | 'recent';
const FILTERS: { id: Filter; label: string; kinds?: SearchKind[] }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'food', label: 'Aliments', kinds: ['food'] },
  { id: 'dish', label: 'Plats', kinds: ['dish', 'catalog'] },
  { id: 'drink', label: 'Boissons', kinds: ['drink'] },
  { id: 'product', label: 'Produits', kinds: ['product'] },
  { id: 'recipe', label: 'Mes recettes', kinds: ['recipe'] },
  { id: 'recent', label: 'Récents', kinds: ['recent'] },
];

const NO_MEALS: MealEntry[] = [];

/** Calories d'une portion habituelle (ou pour 100) pour aider à reconnaître un résultat. */
export function docSubtitle(ref: SearchRef): string {
  switch (ref.type) {
    case 'food': return `${fmtKcal(ref.food.per100.kcal)} kcal / 100 ${ref.food.basis}${ref.food.brand ? ` · ${ref.food.brand}` : ''}`;
    case 'dish': {
      const t = compositionTotals(ref.dish.ingredients);
      return `≈ ${fmtKcal(t.nutrients.kcal)} kcal la portion (${Math.round(t.grams)} g) · ${ref.dish.region}`;
    }
    case 'catalog': return 'Portion à choisir (estimation)';
    case 'recipe': {
      const n = recipeNutrition(ref.recipe);
      return n.basis === 'none' ? 'Recette personnelle' : `${fmtKcal(n.perServing.kcal)} kcal / portion`;
    }
    case 'recent': return `${fmtKcal(ref.item.nutrients.kcal)} kcal · déjà mangé`;
  }
}

export function SearchPanel({ onPick, onCombo, onCreate, kinds, initialFilter = 'all', placeholder = 'Pain, couscous, café au lait, bouzelouf…', autoFocus = true, extraActions }: {
  onPick: (ref: SearchRef) => void;
  /** Requête composée (« pain beurre ») : propose d'ajouter les deux éléments. */
  onCombo?: (refs: SearchRef[]) => void;
  /** Restreint les types proposés (ex. ingrédients d'un plat : aliments et boissons). */
  kinds?: SearchKind[];
  initialFilter?: Filter;
  placeholder?: string;
  autoFocus?: boolean;
  extraActions?: React.ReactNode;
  /** Proposé quand rien ne correspond (ou en bas des résultats) : créer le plat soi-même. */
  onCreate?: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const mine = useLiveQuery(() => db.foods.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const meals = useLiveQuery(() => db.meals.orderBy('createdAt').reverse().limit(60).toArray(), []) ?? NO_MEALS;
  const { prefs } = useApp();
  const recent = useMemo(() => {
    const hidden = new Set(prefs.hiddenRecent ?? []);
    return recentDistinctItems(meals, 40).filter(({ item }) => !hidden.has(itemSignature(item))).slice(0, 30);
  }, [meals, prefs.hiddenRecent]);
  const { search, combo, dbLoading, dbError } = useSearch(mine ?? [], recipes ?? [], recent);
  const filters = kinds ? FILTERS.filter((f) => f.id === 'all' || f.kinds?.some((k) => kinds.includes(k))) : FILTERS;
  const activeKinds = filter === 'all' ? kinds : FILTERS.find((f) => f.id === filter)?.kinds;

  const hits = useMemo(() => (q.trim() ? search(q, { kinds: activeKinds, limit: 50 }) : []), [q, search, activeKinds]);
  // Combinaison proposée seulement si aucun résultat ne couvre déjà toute la requête (« pain beurre » → tartine beurrée).
  const comboDocs = useMemo(() => {
    if (!onCombo || filter !== 'all' || tokens(q).length < 2) return null;
    const covered = hits.slice(0, 3).some((h) => { const hay = tokens(`${h.doc.name} ${h.doc.synonyms ?? ''}`); return tokens(q).every((t) => hay.includes(t)); });
    return covered ? null : combo(q);
  }, [q, combo, onCombo, filter, hits]);
  // Sans saisie : favoris puis récents, pour réutiliser en un geste.
  const idle: SearchDoc<SearchRef>[] = useMemo(() => {
    if (q.trim()) return [];
    const favs = (mine ?? []).filter((f) => f.favorite).map((f) => ({ id: f.id, kind: 'food' as const, name: f.name, ref: { type: 'food' as const, food: f } }));
    const favRecipes = (recipes ?? []).filter((r) => r.favorite).map((r) => ({ id: `rec:${r.id}`, kind: 'recipe' as const, name: r.name, ref: { type: 'recipe' as const, recipe: r } }));
    const rec = recent.slice(0, 12).map(({ item, date }) => ({ id: `recent:${item.id}:${date}`, kind: 'recent' as const, name: item.name, ref: { type: 'recent' as const, item, date } }));
    const all = [...favRecipes, ...favs, ...rec];
    return activeKinds ? all.filter((d) => activeKinds.includes(d.kind)) : all;
  }, [q, mine, recipes, recent, activeKinds]);
  const list = q.trim() ? hits.map((h) => h.doc) : idle;

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={20} />
          <TextInput autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-11" enterKeyHint="search" aria-label="Rechercher" />
        </div>
        {filters.length > 2 && (
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {filters.map((f) => <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
            {extraActions}
          </div>
        )}
      </div>
      {dbLoading && q.trim() && <p className="px-1 py-2 text-[12.5px] text-muted">Chargement de la base alimentaire…</p>}
      {dbError && <Notice tone="warn" className="my-2">La base alimentaire n’a pas pu être chargée. Tes aliments, recettes et la table de référence restent disponibles.</Notice>}
      {comboDocs && onCombo && (
        <button type="button" onClick={() => onCombo(comboDocs.map((d) => d.ref))} className="mb-2 mt-1 w-full rounded-2xl border-2 border-dashed border-brand/40 bg-surface px-3.5 py-2.5 text-left active:bg-bg">
          <div className="text-[12px] font-semibold text-brand">Ajouter les deux</div>
          <div className="truncate font-medium">{comboDocs.map((d) => d.name).join(' + ')}</div>
        </button>
      )}
      {!q.trim() && list.length > 0 && <h3 className="mb-1 mt-2 px-1 text-[13px] font-bold uppercase text-muted">Favoris et récents</h3>}
      {list.length > 0 ? (
        <ul className="mt-1 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {list.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onPick(d.ref)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-bg">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {d.name}
                    {((d.ref.type === 'food' && d.ref.food.favorite) || (d.ref.type === 'recipe' && d.ref.recipe.favorite)) && <IconStar filled size={13} className="ml-1 inline text-accent" />}
                  </div>
                  <div className="truncate text-[12.5px] text-muted">{docSubtitle(d.ref)}</div>
                </div>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', d.kind === 'recipe' || d.kind === 'recent' ? 'bg-brand-soft text-brand-strong' : 'bg-line/70 text-muted')}>{KIND_LABEL[d.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim() && !dbLoading ? (
        <p className="px-1 py-3 text-sm text-muted">Rien trouvé pour « {q.trim()} ». Essaie un autre nom ou une autre orthographe{onCreate ? ', ou compose le plat avec ses ingrédients :' : '.'}</p>
      ) : null}
      {onCreate && q.trim() && !dbLoading && (
        <Button variant="soft" block className="mt-2" onClick={() => onCreate(q.trim().replace(/^./, (c) => c.toUpperCase()))}>Composer « {q.trim()} » avec ses ingrédients</Button>
      )}
    </div>
  );
}
