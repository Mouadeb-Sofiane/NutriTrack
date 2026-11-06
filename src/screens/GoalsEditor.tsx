import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Goals, MealEntry, Profile, WeightEntry } from '../domain/types';
import { db } from '../data/db';
import { addDays, today } from '../domain/dates';
import { describeGoalGap, observedExpenditure } from '../domain/adaptive';
import { suggestMacros, type EnergyPlan } from '../domain/energy';
import { Button, Field, Notice, NumberInput, Toggle } from '../ui/kit';
import { fmtKcal } from '../domain/nutrition';

/** Édition de l'objectif calorique et des macros. Toute modification est explicite. */
export function GoalsEditor({ goals, setGoals, plan, profile }: { goals: Goals; setGoals: (g: Goals) => void; plan: EnergyPlan; profile: Profile }) {
  const suggested = plan.suggestedKcal;
  const recomputeMacros = (kcal: number) => {
    const m = suggestMacros(kcal, plan.effectiveGoal, profile.weightKg, profile.heightCm);
    return { protein: m.protein, carbs: m.carbs, fat: m.fat };
  };
  const macroKcal = (goals.protein ?? 0) * 4 + (goals.carbs ?? 0) * 4 + (goals.fat ?? 0) * 9;
  const macroInfo = suggestMacros(goals.kcal || 2000, plan.effectiveGoal, profile.weightKg, profile.heightCm).explanation;
  return (
    <div>
      <Field
        label="Objectif calorique quotidien"
        hint={suggested ? (goals.kcal === suggested ? 'Valeur proposée à partir de ton profil. Tu peux la modifier.' : `Valeur personnalisée (proposition : ${fmtKcal(suggested)} kcal).`) : 'Saisis l’objectif de ton choix.'}
      >
        <NumberInput value={goals.kcal || null} onChange={(v) => setGoals({ ...goals, kcal: v ?? 0, manual: v !== suggested })} suffix="kcal" inputMode="numeric" />
      </Field>
      {suggested != null && goals.kcal !== suggested && (
        <Button variant="ghost" size="sm" className="-mt-2 mb-3" onClick={() => setGoals({ ...goals, kcal: suggested, manual: false, ...recomputeMacros(suggested) })}>
          Revenir à la proposition ({fmtKcal(suggested)} kcal)
        </Button>
      )}
      {plan.tdee != null && goals.kcal > 0 && (
        <div className="mb-3 rounded-2xl bg-surface p-3.5 text-[13.5px]">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-[12px] font-medium text-muted">Recommandé par NutriTrack</div><div className="text-lg font-bold tabular-nums">{fmtKcal(suggested)} kcal</div></div>
            <div><div className="text-[12px] font-medium text-muted">{goals.manual ? 'Ton objectif personnalisé' : 'Ton objectif'}</div><div className={`text-lg font-bold tabular-nums ${goals.manual ? 'text-accent' : ''}`}>{fmtKcal(goals.kcal)} kcal</div></div>
          </div>
          <p className="mt-2 leading-snug text-muted">
            Calcul : métabolisme de base {fmtKcal(plan.bmr?.value)} kcal (formule de Mifflin-St Jeor) × activité {plan.factor.toLocaleString('fr-FR')} = dépense estimée {fmtKcal(plan.tdee)} kcal{plan.adjustmentPct ? `, puis ${plan.adjustmentPct > 0 ? '+' : ''}${Math.round(plan.adjustmentPct * 100)} % pour ton objectif` : ''}.
            {' '}Ton objectif représente un {describeGoalGap(goals.kcal, plan.tdee).text}.
          </p>
          <p className="mt-1 text-[12px] text-muted">La formule est une estimation de population (souvent ±10 %). Ton évolution réelle sur plusieurs semaines est le meilleur juge.</p>
        </div>
      )}
      <Reevaluation plan={plan} onUse={(kcal) => setGoals({ ...goals, kcal, manual: kcal !== suggested, ...recomputeMacros(kcal) })} />
      {goals.kcal > 0 && plan.bmr && goals.kcal < plan.bmr.value * 0.9 && (
        <Notice tone="warn" className="mb-3">Cet objectif est nettement inférieur à ton métabolisme de base estimé. Un objectif trop bas est difficile à tenir et peut être néfaste ; n’hésite pas à demander conseil à un professionnel.</Notice>
      )}
      <Toggle checked={goals.trackMacros} onChange={(trackMacros) => setGoals({ ...goals, trackMacros })} label="Suivre les macronutriments" />
      {goals.trackMacros && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protéines"><NumberInput value={goals.protein} onChange={(protein) => setGoals({ ...goals, protein })} suffix="g" inputMode="numeric" /></Field>
            <Field label="Glucides"><NumberInput value={goals.carbs} onChange={(carbs) => setGoals({ ...goals, carbs })} suffix="g" inputMode="numeric" /></Field>
            <Field label="Lipides"><NumberInput value={goals.fat} onChange={(fat) => setGoals({ ...goals, fat })} suffix="g" inputMode="numeric" /></Field>
          </div>
          <p className="-mt-2 mb-2 text-[12.5px] text-muted">
            {macroInfo} Ces macros représentent ~{fmtKcal(macroKcal)} kcal. Repères indicatifs, non médicaux.
          </p>
          {goals.kcal > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setGoals({ ...goals, ...recomputeMacros(goals.kcal) })}>Recalculer les macros pour {fmtKcal(goals.kcal)} kcal</Button>
          )}
        </>
      )}
    </div>
  );
}

/** Vérification à la demande : dépense observée à partir des repas notés et des pesées. */
function Reevaluation({ plan, onUse }: { plan: EnergyPlan; onUse: (kcal: number) => void }) {
  const [open, setOpen] = useState(false);
  const meals = useLiveQuery(() => (open ? db.meals.where('date').between(addDays(today(), -27), today(), true, true).toArray() : Promise.resolve([] as MealEntry[])), [open]);
  const weights = useLiveQuery(() => (open ? db.weights.toArray() : Promise.resolve([] as WeightEntry[])), [open]);
  if (!open) return <Button variant="soft" size="sm" className="mb-3" onClick={() => setOpen(true)}>Vérifier avec mon évolution réelle</Button>;
  if (!meals || !weights) return null;
  const r = observedExpenditure(meals, weights, today());
  const proposed = r.observed != null ? Math.round((r.observed * (1 + plan.adjustmentPct)) / 10) * 10 : null;
  return (
    <div className="mb-3 rounded-2xl bg-surface p-3.5 text-[13.5px]">
      <div className="font-semibold">Réévaluation sur les 4 dernières semaines</div>
      {!r.ok ? <p className="mt-1 text-muted">{r.reason} Continue à noter tes repas et à te peser, puis reviens ici.</p> : (
        <>
          <p className="mt-1 leading-snug">
            Apport moyen {fmtKcal(r.avgIntake)} kcal sur {r.loggedDays} jours notés · tendance du poids {r.weeklyTrendKg! > 0 ? '+' : ''}{r.weeklyTrendKg!.toLocaleString('fr-FR')} kg/semaine ({r.weighIns} pesées).
            {' '}Dépense observée ≈ <b>{fmtKcal(r.observed)} kcal/jour</b> (estimée par la formule : {fmtKcal(plan.tdee)} kcal). Fiabilité {r.confidence}.
          </p>
          {proposed != null && <Button variant="secondary" size="sm" className="mt-2" onClick={() => onUse(proposed)}>Utiliser {fmtKcal(proposed)} kcal comme objectif</Button>}
          <p className="mt-2 text-[12px] leading-snug text-muted">Hypothèses : les jours notés sont complets ; la tendance du poids sur 4 semaines reflète surtout la masse grasse (l’eau, le glycogène et la digestion font varier les pesées d’un jour à l’autre). Rien n’est modifié sans ton accord.</p>
        </>
      )}
    </div>
  );
}
