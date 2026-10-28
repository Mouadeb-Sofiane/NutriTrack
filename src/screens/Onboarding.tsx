import { useMemo, useState } from 'react';
import { computeEnergyPlan, goalsFromPlan } from '../domain/energy';
import type { Goals } from '../domain/types';
import { nowISO, today } from '../domain/dates';
import { repo } from '../state/app';
import { navigate } from '../state/router';
import { Button, Card, IconButton, Notice } from '../ui/kit';
import { IconChevronLeft } from '../ui/icons';
import { useFeedback } from '../ui/feedback';
import { ActivitySection, BodySection, defaultProfile, GoalSection, PlanSummary, PrefsSection, profileErrors } from './profileSections';
import { GoalsEditor } from './GoalsEditor';

const STEPS = ['Bienvenue', 'Ton corps', 'Ton activité', 'Ton objectif', 'Préférences', 'Révision'];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState(defaultProfile);
  const [trackMacros, setTrackMacros] = useState(true);
  const [goals, setGoals] = useState<Goals | null>(null);
  const { toast } = useFeedback();
  const set = (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch }));
  const plan = useMemo(() => computeEnergyPlan(p), [p]);
  const errors = profileErrors(p);

  const next = () => {
    if (step === 4) {
      const g = goalsFromPlan(plan, p, trackMacros, nowISO()) ?? { kcal: 0, protein: null, carbs: null, fat: null, trackMacros, manual: true, updatedAt: nowISO() };
      setGoals(g);
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = async () => {
    if (!goals || !goals.kcal || goals.kcal < 500 || goals.kcal > 10000) {
      toast('Indique un objectif calorique entre 500 et 10 000 kcal.', 'error');
      return;
    }
    await repo.saveProfile(p);
    await repo.saveGoals(goals);
    if (p.weightKg) await repo.addWeight(today(), p.weightKg, 'Poids de départ');
    await repo.savePrefs({ onboarded: true });
    navigate('today', undefined, { replace: true });
  };

  return (
    <div className="safe-top mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-6">
      <div className="flex items-center gap-2 pt-3">
        {step > 0 ? <IconButton label="Retour" onClick={() => setStep(step - 1)}><IconChevronLeft /></IconButton> : <div className="h-11 w-11" />}
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />)}
        </div>
        <div className="h-11 w-11" />
      </div>
      <h1 className="mb-4 mt-4 text-2xl font-extrabold">{STEPS[step]}</h1>
      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-3">
            <Card>
              <p className="text-[15px] leading-relaxed">
                <b>NutriTrack</b> t’aide à suivre ton alimentation, tes calories et ta progression — sans abonnement, sans publicité, sans compte.
              </p>
            </Card>
            <Card>
              <ul className="space-y-2 text-[14.5px] leading-snug">
                <li>🔒 <b>Tes données restent sur ton téléphone.</b> Rien n’est envoyé à un serveur.</li>
                <li>💾 Pense à <b>exporter une sauvegarde</b> de temps en temps (Profil → Données) : effacer les données du navigateur efface aussi l’application.</li>
                <li>📏 Les calories sont des <b>estimations</b>. L’application indique toujours leur niveau de précision.</li>
                <li>🩺 Ce n’est pas un dispositif médical. Pour une situation particulière, un professionnel de santé reste la meilleure aide.</li>
              </ul>
            </Card>
            <p className="px-1 text-[13px] text-muted">Quelques questions pour personnaliser les calculs (2 minutes). Tout est modifiable plus tard, et aucun champ n’est obligatoire.</p>
          </div>
        )}
        {step === 1 && <BodySection p={p} set={set} />}
        {step === 2 && <ActivitySection p={p} set={set} />}
        {step === 3 && <GoalSection p={p} set={set} />}
        {step === 4 && <PrefsSection p={p} set={set} trackMacros={trackMacros} setTrackMacros={setTrackMacros} />}
        {step === 5 && goals && (
          <div>
            <Card className="mb-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">Ton profil</span>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Modifier</Button>
              </div>
              <p className="text-[14px] leading-relaxed text-muted">
                {[p.age && `${p.age} ans`, p.heightCm && `${p.heightCm} cm`, p.weightKg && `${String(p.weightKg).replace('.', ',')} kg`, p.targetWeightKg && `cible ${String(p.targetWeightKg).replace('.', ',')} kg`, p.sex === 'male' ? 'homme' : p.sex === 'female' ? 'femme' : 'sexe non précisé'].filter(Boolean).join(' · ')}
              </p>
            </Card>
            <Card className="mb-3"><PlanSummary plan={plan} /></Card>
            <Card><GoalsEditor goals={goals} setGoals={setGoals} plan={plan} profile={p} /></Card>
          </div>
        )}
      </div>
      {errors.length > 0 && step >= 1 && step <= 4 && <Notice tone="warn" className="mt-3">{errors[0]}</Notice>}
      <div className="safe-bottom mt-5">
        {step < 5 ? (
          <Button block size="lg" onClick={next} disabled={errors.length > 0 && step >= 1}>
            {step === 0 ? 'Commencer' : 'Continuer'}
          </Button>
        ) : (
          <Button block size="lg" onClick={finish}>Valider et commencer</Button>
        )}
      </div>
    </div>
  );
}
