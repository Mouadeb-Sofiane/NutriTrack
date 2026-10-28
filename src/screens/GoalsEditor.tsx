import type { Goals, Profile } from '../domain/types';
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
