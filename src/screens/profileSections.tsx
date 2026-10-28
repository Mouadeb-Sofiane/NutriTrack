/** Sections du profil, partagées entre l'assistant de démarrage et l'écran « Profil ». */
import type { ActivityLevel, EnergyMethod, GoalMode, JobType, Pace, Profile } from '../domain/types';
import { ACTIVITY_LABELS, PACE_ADJUSTMENT, suggestActivityLevel, type EnergyPlan } from '../domain/energy';
import { Field, Notice, NumberInput, OptionCard, Segmented, Stat, TextInput, Toggle, cx } from '../ui/kit';
import { fmtKcal } from '../domain/nutrition';
import { nowISO } from '../domain/dates';

export type ProfileDraft = Profile;

export function defaultProfile(): Profile {
  const now = nowISO();
  return {
    age: null, heightCm: null, weightKg: null, targetWeightKg: null, sex: null,
    activityLevel: 'sedentary', jobType: null, trainingPerWeek: null, trainingType: '',
    goal: 'lose', pace: 'moderate', energyMethod: 'included', exerciseCredit: 0,
    caution: { pregnant: false, breastfeeding: false, edHistory: false },
    dietPrefs: '', allergies: '', createdAt: now, updatedAt: now,
  };
}

type SP = { p: Profile; set: (patch: Partial<Profile>) => void };

export function rangeError(v: number | null, min: number, max: number, label: string): string | null {
  if (v == null) return null;
  return v < min || v > max ? `${label} : valeur attendue entre ${min} et ${max}.` : null;
}

export function profileErrors(p: Profile): string[] {
  return [
    rangeError(p.age, 10, 110, 'Âge'),
    rangeError(p.heightCm, 100, 250, 'Taille'),
    rangeError(p.weightKg, 25, 350, 'Poids'),
    rangeError(p.targetWeightKg, 25, 350, 'Poids cible'),
    rangeError(p.trainingPerWeek, 0, 21, 'Entraînements'),
  ].filter((x): x is string => !!x);
}

export function BodySection({ p, set }: SP) {
  return (
    <div>
      <Notice className="mb-4">Ces informations servent uniquement à estimer tes besoins énergétiques. Elles restent sur ton téléphone.</Notice>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Âge" error={rangeError(p.age, 10, 110, 'Âge')}>
          <NumberInput value={p.age} onChange={(age) => set({ age })} suffix="ans" placeholder="30" />
        </Field>
        <Field label="Taille" error={rangeError(p.heightCm, 100, 250, 'Taille')}>
          <NumberInput value={p.heightCm} onChange={(heightCm) => set({ heightCm })} suffix="cm" placeholder="175" />
        </Field>
        <Field label="Poids actuel" error={rangeError(p.weightKg, 25, 350, 'Poids')}>
          <NumberInput value={p.weightKg} onChange={(weightKg) => set({ weightKg })} suffix="kg" placeholder="80" />
        </Field>
        <Field label="Poids cible" error={rangeError(p.targetWeightKg, 25, 350, 'Poids cible')} hint="Facultatif">
          <NumberInput value={p.targetWeightKg} onChange={(targetWeightKg) => set({ targetWeightKg })} suffix="kg" placeholder="75" />
        </Field>
      </div>
      <Field label="Sexe utilisé par la formule" hint="La formule de Mifflin-St Jeor diffère selon le sexe physiologique. Sans réponse, l'estimation est moins précise (moyenne des deux formules).">
        <Segmented
          value={p.sex ?? 'none'}
          onChange={(v) => set({ sex: v === 'none' ? null : v })}
          options={[{ value: 'male', label: 'Homme' }, { value: 'female', label: 'Femme' }, { value: 'none', label: 'Ne pas préciser' }]}
        />
      </Field>
    </div>
  );
}

const JOBS: { value: JobType; label: string }[] = [
  { value: 'seated', label: 'Assis' },
  { value: 'standing', label: 'Debout' },
  { value: 'physical', label: 'Physique' },
];

export function ActivitySection({ p, set }: SP) {
  const apply = (patch: Partial<Profile>) => {
    const next = { ...p, ...patch };
    set({ ...patch, activityLevel: suggestActivityLevel(next.jobType, next.trainingPerWeek, next.energyMethod) });
  };
  return (
    <div>
      <Field label="Activité professionnelle / quotidienne" hint="Aide à pré-sélectionner ton niveau d'activité.">
        <Segmented value={p.jobType ?? ('none' as never)} onChange={(v) => apply({ jobType: v })} options={JOBS} />
      </Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Entraînements / semaine">
          <NumberInput value={p.trainingPerWeek} onChange={(trainingPerWeek) => apply({ trainingPerWeek })} placeholder="0" inputMode="numeric" />
        </Field>
        <Field label="Type (facultatif)">
          <TextInput value={p.trainingType ?? ''} onChange={(e) => set({ trainingType: e.target.value })} placeholder="Muscu, course…" />
        </Field>
      </div>
      <Field label="Comment compter le sport ?" hint={p.energyMethod === 'included'
        ? 'Ton niveau d’activité inclut déjà tes séances : tu n’as rien à saisir au quotidien (recommandé si ton rythme est régulier).'
        : 'Ton niveau d’activité décrit ta journée HORS sport ; tu notes tes séances à part. Elles ne sont pas ajoutées automatiquement à ton budget.'}>
        <Segmented<EnergyMethod>
          value={p.energyMethod}
          onChange={(energyMethod) => apply({ energyMethod })}
          options={[{ value: 'included', label: 'Inclus dans l’activité' }, { value: 'separate', label: 'Séances à part' }]}
        />
      </Field>
      <div className="mb-1.5 text-sm font-semibold">Niveau d’activité {p.energyMethod === 'separate' && '(hors sport)'}</div>
      {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((lvl) => (
        <OptionCard key={lvl} selected={p.activityLevel === lvl} onClick={() => set({ activityLevel: lvl })} title={ACTIVITY_LABELS[lvl].label} desc={p.energyMethod === 'included' ? ACTIVITY_LABELS[lvl].included : ACTIVITY_LABELS[lvl].separate} />
      ))}
      {p.energyMethod === 'separate' && (
        <Field label="Calories d’exercice ajoutées au budget" hint="Les dépenses des appareils et applications sont souvent surestimées. Par prudence, 0 % par défaut.">
          <Segmented<'0' | '0.5' | '1'>
            value={String(p.exerciseCredit) as '0' | '0.5' | '1'}
            onChange={(v) => set({ exerciseCredit: Number(v) as 0 | 0.5 | 1 })}
            options={[{ value: '0', label: '0 %' }, { value: '0.5', label: '50 %' }, { value: '1', label: '100 %' }]}
          />
        </Field>
      )}
    </div>
  );
}

const GOALS: { value: GoalMode; title: string; desc: string }[] = [
  { value: 'lose', title: 'Perte de poids', desc: 'Déficit modéré et ajustable' },
  { value: 'maintain', title: 'Maintien', desc: 'Objectif proche de tes dépenses estimées' },
  { value: 'gain', title: 'Prise de masse', desc: 'Surplus modéré, sans prise de poids rapide' },
  { value: 'custom', title: 'Objectif personnalisé', desc: 'Tu fixes toi-même ton objectif calorique' },
];

const PACE_LABEL: Record<Pace, string> = { gentle: 'Doux', moderate: 'Modéré', ambitious: 'Soutenu' };

export function GoalSection({ p, set }: SP) {
  return (
    <div>
      {GOALS.map((g) => (
        <OptionCard key={g.value} selected={p.goal === g.value} onClick={() => set({ goal: g.value })} title={g.title} desc={g.desc} />
      ))}
      {(p.goal === 'lose' || p.goal === 'gain') && (
        <Field label="Rythme" hint={`${p.goal === 'lose' ? 'Déficit' : 'Surplus'} de ${Math.abs(PACE_ADJUSTMENT[p.goal][p.pace] * 100)} % par rapport à tes dépenses estimées. Un rythme modéré est généralement plus facile à tenir.`}>
          <Segmented<Pace> value={p.pace} onChange={(pace) => set({ pace })} options={(['gentle', 'moderate', 'ambitious'] as Pace[]).map((v) => ({ value: v, label: PACE_LABEL[v] }))} />
        </Field>
      )}
      <div className="mb-2 mt-5 text-sm font-semibold">Situations particulières (facultatif)</div>
      <p className="mb-3 text-[13px] text-muted">Si l’une d’elles te concerne, l’application ne proposera pas de déficit automatiquement.</p>
      <Toggle checked={p.caution.pregnant} onChange={(v) => set({ caution: { ...p.caution, pregnant: v } })} label="Grossesse" />
      <Toggle checked={p.caution.breastfeeding} onChange={(v) => set({ caution: { ...p.caution, breastfeeding: v } })} label="Allaitement" />
      <Toggle checked={p.caution.edHistory} onChange={(v) => set({ caution: { ...p.caution, edHistory: v } })} label="Antécédents de troubles alimentaires" />
    </div>
  );
}

export function PrefsSection({ p, set, trackMacros, setTrackMacros }: SP & { trackMacros: boolean; setTrackMacros: (v: boolean) => void }) {
  return (
    <div>
      <Field label="Préférences alimentaires" hint="Facultatif — ex. végétarien, halal, pas de porc, cuisine maghrébine…">
        <TextInput value={p.dietPrefs ?? ''} onChange={(e) => set({ dietPrefs: e.target.value })} placeholder="Facultatif" />
      </Field>
      <Field label="Allergies ou intolérances" hint="Facultatif — utilisé pour les conseils.">
        <TextInput value={p.allergies ?? ''} onChange={(e) => set({ allergies: e.target.value })} placeholder="Facultatif" />
      </Field>
      <Toggle checked={trackMacros} onChange={setTrackMacros} label="Suivre les macronutriments" desc="Protéines, glucides, lipides. Désactive pour ne compter que les calories." />
      <p className="text-[13px] text-muted">Unités : kilogrammes, centimètres, grammes et millilitres.</p>
    </div>
  );
}

export function PlanSummary({ plan, className }: { plan: EnergyPlan; className?: string }) {
  if (plan.missing.length) {
    return <Notice tone="warn" className={className}>Pour estimer tes besoins, il manque : {plan.missing.join(', ')}. Tu peux quand même fixer un objectif manuellement.</Notice>;
  }
  const adj = plan.adjustmentPct;
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Métabolisme de base" value={`${fmtKcal(plan.bmr?.value)} kcal`} sub={plan.bmr?.precise ? 'estimé au repos' : 'estimation moins précise'} />
        <Stat label="Dépenses quotidiennes" value={`${fmtKcal(plan.tdee)} kcal`} sub={plan.tdeeRange ? `entre ${fmtKcal(plan.tdeeRange.min)} et ${fmtKcal(plan.tdeeRange.max)}` : `× ${String(plan.factor).replace('.', ',')} (activité)`} />
        <Stat label="Objectif proposé" value={<span className="text-brand">{fmtKcal(plan.suggestedKcal)} kcal</span>} sub={adj === 0 ? 'maintien' : `${adj < 0 ? 'déficit' : 'surplus'} de ${fmtKcal(Math.abs((plan.tdee ?? 0) * adj))} kcal/j`} />
        <Stat label="Variation théorique" value={plan.weeklyChangeKg ? `${plan.weeklyChangeKg > 0 ? '+' : ''}${String(plan.weeklyChangeKg).replace('.', ',')} kg/sem.` : '—'} sub="ordre de grandeur" />
      </div>
      {plan.warnings.map((w, i) => (
        <Notice key={i} tone={w.level === 'caution' ? 'warn' : 'info'} className={cx('mt-3')}>{w.text}</Notice>
      ))}
      <p className="mt-3 text-[12.5px] leading-snug text-muted">
        Ces chiffres sont des estimations (formule de Mifflin-St Jeor × coefficient d’activité). Les besoins réels varient d’une personne à l’autre ; la tendance de ton poids sur plusieurs semaines est le meilleur indicateur.
      </p>
    </div>
  );
}
