/** Tableau de bord quotidien. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../data/db';
import { useApp, repo } from '../state/app';
import { href, navigate, type Route } from '../state/router';
import { addDays, formatDayLabel, isISODate, today } from '../domain/dates';
import { fmtKcal, hasMeaningfulRange, mergeTotals } from '../domain/nutrition';
import { mealTotals, sortWeights } from '../domain/stats';
import { dailyBudget } from '../domain/energy';
import { recipeNutrition } from '../domain/recipes';
import { scenarioTotals } from '../domain/estimates';
import type { MealType } from '../domain/types';
import { draftStore, emptyDraft } from '../state/draft';
import { MEAL_EMOJI, MEAL_LABEL, MEAL_ORDER } from './labels';
import { Button, Card, Field, IconButton, Notice, NumberInput, SectionTitle, TextInput } from '../ui/kit';
import { MacroBar, Ring } from '../ui/charts';
import { IconChevronLeft, IconChevronRight, IconFlame, IconPlus, IconScale, IconStar, IconTrash } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { useFeedback } from '../ui/feedback';
import { PhotoView } from '../ui/PhotoView';

export function Today({ route }: { route: Route }) {
  const { goals, profile } = useApp();
  const qd = route.query.get('date');
  const date = qd && isISODate(qd) ? qd : today();
  const setDate = (d: string) => navigate('today', { date: d === today() ? undefined : d }, { replace: true });

  const meals = useLiveQuery(() => db.meals.where('date').equals(date).sortBy('createdAt'), [date]) ?? [];
  const exercises = useLiveQuery(() => db.exercises.where('date').equals(date).toArray(), [date]) ?? [];
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? [];
  const favorites = useLiveQuery(() => db.recipes.filter((r) => r.favorite).toArray(), []) ?? [];
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);

  const totals = mergeTotals(meals.map(mealTotals));
  const scen = scenarioTotals(meals.flatMap((m) => m.items));
  const exerciseKcal = exercises.reduce((s, e) => s + e.kcal, 0);
  const method = profile?.energyMethod ?? 'included';
  const budget = goals ? dailyBudget(goals.kcal, exerciseKcal, method, profile?.exerciseCredit ?? 0) : 0;
  const remaining = budget - totals.kcal;
  const lastWeight = sortWeights(weights).at(-1);

  const startMeal = (type?: MealType, query: Record<string, string> = {}) => {
    draftStore.set(emptyDraft(date, type));
    navigate('add', { date, type, ...query });
  };

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top flex items-center justify-between pt-2">
        <IconButton label="Jour précédent" onClick={() => setDate(addDays(date, -1))}><IconChevronLeft /></IconButton>
        <button type="button" onClick={() => setDate(today())} className="min-h-11 px-2 text-center">
          <div className="text-lg font-extrabold first-letter:uppercase">{formatDayLabel(date)}</div>
          {date !== today() && <div className="text-[12px] font-medium text-brand">Revenir à aujourd’hui</div>}
        </button>
        <IconButton label="Jour suivant" onClick={() => setDate(addDays(date, 1))}><IconChevronRight /></IconButton>
      </header>

      <Card className="mt-2">
        {goals ? (
          <div className="flex items-center gap-4">
            <Ring value={totals.kcal} max={budget}>
              <div className="text-[12px] font-medium text-muted">{remaining >= 0 ? 'Encore' : 'Au-delà de'}</div>
              <div className="text-3xl font-extrabold tabular-nums leading-tight">{fmtKcal(Math.abs(remaining))}</div>
              <div className="text-[12px] text-muted">kcal</div>
            </Ring>
            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <div className="text-[12px] font-medium text-muted">Objectif</div>
                <div className="text-lg font-bold tabular-nums">{fmtKcal(budget)} <span className="text-sm font-medium text-muted">kcal</span></div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-muted">Consommé</div>
                <div className="text-lg font-bold tabular-nums">{hasMeaningfulRange(totals) ? '~' : ''}{fmtKcal(totals.kcal)} <span className="text-sm font-medium text-muted">kcal</span></div>
                {hasMeaningfulRange(totals) && <div className="text-[12px] text-muted">entre {fmtKcal(totals.kcalRange.min)} et {fmtKcal(totals.kcalRange.max)}</div>}
              </div>
              {method === 'separate' && (
                <button type="button" onClick={() => setExerciseOpen(true)} className="flex items-center gap-1 text-left text-[13px] font-medium text-accent">
                  <IconFlame size={16} /> {exerciseKcal ? `${fmtKcal(exerciseKcal)} kcal d’activité` : 'Ajouter une activité'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <Notice>Aucun objectif défini. <a className="font-semibold text-brand" href={href('profile')}>Configurer mon profil</a></Notice>
        )}
        {goals?.trackMacros && (
          <div className="mt-4 flex gap-4 border-t border-line pt-4">
            <MacroBar kind="protein" value={totals.protein} target={goals.protein} missing={totals.missing.protein} />
            <MacroBar kind="carbs" value={totals.carbs} target={goals.carbs} missing={totals.missing.carbs} />
            <MacroBar kind="fat" value={totals.fat} target={goals.fat} missing={totals.missing.fat} />
          </div>
        )}
        {scen.uncertainCount > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <button type="button" onClick={() => setShowScenarios(!showScenarios)} aria-expanded={showScenarios} className="flex w-full items-center justify-between text-left text-[13.5px]">
              <span className="font-semibold">Scénarios du jour</span>
              <span className="tabular-nums text-muted">moyen {fmtKcal(scen.mean)} · <span className="text-accent">haut {fmtKcal(scen.high)}</span></span>
            </button>
            {showScenarios && (
              <div className="anim-fade mt-2 space-y-1 text-[13px]">
                <div className="flex justify-between"><span>Total retenu (tes choix)</span><b className="tabular-nums">{fmtKcal(scen.retained)} kcal</b></div>
                <div className="flex justify-between"><span>Scénario moyen</span><span className="tabular-nums">{fmtKcal(scen.mean)} kcal</span></div>
                <div className="flex justify-between"><span>Scénario haut</span><span className="tabular-nums">{fmtKcal(scen.high)} kcal</span></div>
                <p className="pt-1 text-[12px] leading-snug text-muted">
                  {scen.uncertainCount} élément(s) estimé(s) sans pesée. Le scénario haut additionne leurs estimations hautes : c’est un scénario de prudence, pas une mesure de ce que tu as mangé.
                  {scen.highChosenCount > 0 && ` Tu as retenu l’estimation haute pour ${scen.highChosenCount} élément(s).`}
                  {scen.customCount > 0 && ` ${scen.customCount} valeur(s) personnalisée(s) s’appliquent aux deux scénarios.`}
                </p>
              </div>
            )}
          </div>
        )}
        {totals.missing.kcal > 0 && <p className="mt-3 text-[12.5px] text-warn">* {totals.missing.kcal} aliment(s) sans calories connues ne sont pas comptés.</p>}
        {goals && remaining < 0 && <p className="mt-3 text-[12.5px] text-muted">Un jour au-dessus de l’objectif n’a rien de grave : c’est la tendance sur plusieurs semaines qui compte.</p>}
      </Card>

      {favorites.length > 0 && (
        <>
          <SectionTitle>Ajout rapide</SectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {favorites.slice(0, 10).map((r) => (
              <button key={r.id} type="button" onClick={() => startMeal(undefined, { recipe: r.id })} className="flex min-h-14 shrink-0 items-center gap-2 rounded-2xl bg-surface px-3.5 text-left shadow-[0_1px_2px_rgba(16,40,30,0.06)] active:bg-bg">
                <IconStar filled size={15} className="text-accent" />
                <span>
                  <span className="block max-w-[10rem] truncate text-[14px] font-semibold">{r.name}</span>
                  <span className="block text-[12px] text-muted">{recipeNutrition(r).basis === 'none' ? '—' : `~${fmtKcal(recipeNutrition(r).perServing.kcal)} kcal/portion`}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Repas</SectionTitle>
      <div className="space-y-2.5">
        {MEAL_ORDER.map((type) => {
          const list = meals.filter((m) => m.mealType === type);
          if (!list.length && type === 'other') return null;
          const t = mergeTotals(list.map(mealTotals));
          return (
            <Card key={type} className="!p-0">
              <div className="flex items-center gap-3 px-4 pb-1 pt-3">
                <span className="text-lg" aria-hidden>{MEAL_EMOJI[type]}</span>
                <span className="flex-1 font-bold">{MEAL_LABEL[type]}</span>
                {list.length > 0 && <span className="text-[14px] font-semibold tabular-nums text-muted">{fmtKcal(t.kcal)} kcal</span>}
                <IconButton label={`Ajouter au ${MEAL_LABEL[type].toLowerCase()}`} onClick={() => startMeal(type)} className="bg-brand-soft text-brand !h-9 !w-9"><IconPlus size={20} /></IconButton>
              </div>
              {list.length > 0 ? (
                <ul className="pb-1">
                  {list.map((m) => (
                    <li key={m.id}>
                      <a href={href(`meal/${m.id}`)} className="flex items-center gap-3 px-4 py-2.5 active:bg-bg">
                        {m.photoId && <PhotoView id={m.photoId} className="h-10 w-10 shrink-0 rounded-xl" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px]">{m.name || m.items.map((i) => i.name).join(', ')}</span>
                          <span className="block text-[12px] text-muted">
                            {m.place === 'restaurant' ? `Restaurant${m.restaurantName ? ` · ${m.restaurantName}` : ''} · ` : ''}
                            {m.items.length} élément{m.items.length > 1 ? 's' : ''}{['guided', 'quick', 'mixed'].includes(m.method) || m.items.some((i) => i.precision === 'rough') ? ' · estimation' : ''}
                            {(() => { const s = scenarioTotals(m.items); return s.uncertainCount > 0 && s.high > s.retained + 10 ? ` · haute ${fmtKcal(s.high)}` : ''; })()}
                          </span>
                        </span>
                        <span className="text-[14px] font-semibold tabular-nums">{fmtKcal(mealTotals(m).kcal)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-3 text-[13px] text-muted">Rien de noté</p>
              )}
            </Card>
          );
        })}
      </div>

      <SectionTitle>Poids</SectionTitle>
      <Card onClick={() => navigate('progress')}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand"><IconScale /></span>
          <div className="flex-1">
            {lastWeight ? (
              <>
                <div className="font-bold tabular-nums">{String(lastWeight.kg).replace('.', ',')} kg</div>
                <div className="text-[12.5px] text-muted">Dernière pesée : {formatDayLabel(lastWeight.date).toLowerCase()}{profile?.targetWeightKg ? ` · cible ${String(profile.targetWeightKg).replace('.', ',')} kg` : ''}</div>
              </>
            ) : (
              <div className="font-medium">Noter mon poids</div>
            )}
          </div>
          <IconChevronRight className="text-muted" />
        </div>
      </Card>

      <button type="button" aria-label="Ajouter un repas" onClick={() => startMeal()} className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-white shadow-lg shadow-brand/30 active:scale-95">
        <IconPlus /> Repas
      </button>

      <ExerciseSheet open={exerciseOpen} onClose={() => setExerciseOpen(false)} date={date} exercises={exercises} credit={profile?.exerciseCredit ?? 0} />
    </div>
  );
}

function ExerciseSheet({ open, onClose, date, exercises, credit }: { open: boolean; onClose: () => void; date: string; exercises: { id: string; label: string; kcal: number }[]; credit: number }) {
  const [label, setLabel] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const { toast, confirm } = useFeedback();
  const add = async () => {
    try {
      await repo.addExercise({ date, label, kcal: kcal ?? 0, minutes: null });
      setLabel(''); setKcal(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Activité physique">
      <Notice className="mb-4">
        Saisis l’estimation de dépense de ta séance (montre, application ou tableau). {credit === 0 ? 'Selon tes réglages, elle n’est pas ajoutée à ton budget du jour : elle reste informative.' : `${credit * 100} % de cette dépense est ajoutée à ton budget du jour.`} Les estimations des appareils sont souvent généreuses.
      </Notice>
      <Field label="Activité"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Course, musculation, vélo…" /></Field>
      <Field label="Dépense estimée"><NumberInput value={kcal} onChange={setKcal} suffix="kcal" inputMode="numeric" /></Field>
      <Button block disabled={!kcal || kcal <= 0} onClick={add}>Ajouter</Button>
      {exercises.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {exercises.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-4 py-2">
              <span className="flex-1">{e.label}</span>
              <span className="tabular-nums text-muted">{fmtKcal(e.kcal)} kcal</span>
              <IconButton label="Supprimer" onClick={async () => (await confirm({ title: 'Supprimer cette activité ?', confirm: 'Supprimer', danger: true })) && repo.deleteExercise(e.id)}><IconTrash size={18} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

