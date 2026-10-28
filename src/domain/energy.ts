/**
 * Estimations énergétiques. Toutes les valeurs sont des APPROXIMATIONS :
 * les besoins réels varient d'une personne à l'autre (±10 % ou plus).
 */
import type { ActivityLevel, EnergyMethod, Goals, GoalMode, JobType, Pace, Profile, Sex } from './types';

export interface BmrResult {
  value: number;
  /** Fourchette lorsque le sexe n'est pas renseigné (formule femme → formule homme). */
  range: { min: number; max: number } | null;
  precise: boolean;
  formula: string;
}

/**
 * Métabolisme de base — formule de Mifflin-St Jeor (1990), validée chez l'adulte.
 * Homme : 10 × kg + 6,25 × cm − 5 × âge + 5
 * Femme : 10 × kg + 6,25 × cm − 5 × âge − 161
 * Sexe non renseigné : on ne choisit pas arbitrairement une formule ; on renvoie la
 * moyenne des deux, explicitement moins précise, avec la fourchette correspondante.
 */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: Sex | null): BmrResult {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'male') return { value: base + 5, range: null, precise: true, formula: 'Mifflin-St Jeor (homme)' };
  if (sex === 'female') return { value: base - 161, range: null, precise: true, formula: 'Mifflin-St Jeor (femme)' };
  return {
    value: base - 78,
    range: { min: base - 161, max: base + 5 },
    precise: false,
    formula: 'Mifflin-St Jeor (moyenne des formules homme/femme, moins précise)',
  };
}

/**
 * Coefficients d'activité couramment utilisés (dérivés des tables de la FAO/OMS et
 * de la littérature sur la dépense énergétique). Ce sont des approximations.
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; included: string; separate: string }> = {
  sedentary: {
    label: 'Sédentaire',
    included: 'Travail assis, peu ou pas de sport',
    separate: 'Travail assis, peu de marche au quotidien',
  },
  light: {
    label: 'Légèrement actif',
    included: 'Sport léger 1 à 3 fois par semaine, ou travail debout',
    separate: 'Travail debout ou marche régulière au quotidien',
  },
  moderate: {
    label: 'Modérément actif',
    included: 'Sport 3 à 5 fois par semaine',
    separate: 'Travail physique modéré (manutention légère, beaucoup de déplacements)',
  },
  active: {
    label: 'Très actif',
    included: 'Sport intense 6 à 7 fois par semaine',
    separate: 'Travail physique soutenu toute la journée',
  },
  very_active: {
    label: 'Extrêmement actif',
    included: 'Travail physique + entraînement quotidien',
    separate: 'Travail physique très intense (BTP, agriculture…)',
  },
};

/** Propose un niveau d'activité à partir du métier et des entraînements (pré-remplissage). */
export function suggestActivityLevel(job: JobType | null, trainingPerWeek: number | null, method: EnergyMethod): ActivityLevel {
  const jobScore = job === 'physical' ? 2 : job === 'standing' ? 1 : 0;
  const sessions = method === 'included' ? Math.max(0, trainingPerWeek ?? 0) : 0;
  const sportScore = sessions >= 6 ? 3 : sessions >= 3 ? 2 : sessions >= 1 ? 1 : 0;
  const levels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
  return levels[Math.min(4, jobScore + sportScore)];
}

/** Ajustement par rapport aux dépenses estimées, en fraction (−0,15 = −15 %). */
export const PACE_ADJUSTMENT: Record<'lose' | 'gain', Record<Pace, number>> = {
  // Déficits modérés : on évite les objectifs extrêmes.
  lose: { gentle: -0.1, moderate: -0.15, ambitious: -0.2 },
  // Surplus modérés pour limiter le gain de masse grasse.
  gain: { gentle: 0.05, moderate: 0.1, ambitious: 0.15 },
};

/** ~7700 kcal ≈ 1 kg de masse grasse : ordre de grandeur théorique, la réalité est moins linéaire. */
export const KCAL_PER_KG = 7700;

export type Warning = { level: 'info' | 'caution'; text: string };

export interface EnergyPlan {
  bmr: BmrResult | null;
  factor: number;
  tdee: number | null;
  tdeeRange: { min: number; max: number } | null;
  /** Objectif proposé (null si les données sont insuffisantes). */
  suggestedKcal: number | null;
  adjustmentPct: number;
  effectiveGoal: GoalMode;
  /** Variation de poids théorique par semaine (kg), purement indicative. */
  weeklyChangeKg: number | null;
  /** Présence d'une situation où l'on ne prescrit pas de déficit automatiquement. */
  cautionMode: boolean;
  warnings: Warning[];
  missing: string[];
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export function computeEnergyPlan(p: Pick<Profile, 'age' | 'heightCm' | 'weightKg' | 'targetWeightKg' | 'sex' | 'activityLevel' | 'goal' | 'pace' | 'caution'>): EnergyPlan {
  const warnings: Warning[] = [];
  const missing: string[] = [];
  if (!isPositive(p.age)) missing.push('âge');
  if (!isPositive(p.heightCm)) missing.push('taille');
  if (!isPositive(p.weightKg)) missing.push('poids');

  const factor = ACTIVITY_FACTORS[p.activityLevel];
  const minor = isPositive(p.age) && p.age! < 18;
  const cautionMode = minor || p.caution.pregnant || p.caution.breastfeeding || p.caution.edHistory;

  if (minor) {
    warnings.push({
      level: 'caution',
      text: "Moins de 18 ans : la formule utilisée est conçue pour les adultes et aucun déficit calorique n'est proposé. Un médecin ou un(e) diététicien(ne) pourra t'accompagner.",
    });
  }
  if (p.caution.pregnant || p.caution.breastfeeding) {
    warnings.push({
      level: 'caution',
      text: "Grossesse ou allaitement : les besoins sont spécifiques et augmentent. Aucun déficit n'est proposé ; demande conseil à une sage-femme, un médecin ou un(e) diététicien(ne).",
    });
  }
  if (p.caution.edHistory) {
    warnings.push({
      level: 'caution',
      text: "Tu as signalé des antécédents de troubles alimentaires : aucun déficit n'est proposé automatiquement. Un accompagnement par un professionnel de santé est recommandé. Tu peux masquer les chiffres qui te gênent.",
    });
  }

  if (missing.length) {
    return {
      bmr: null, factor, tdee: null, tdeeRange: null, suggestedKcal: null, adjustmentPct: 0,
      effectiveGoal: p.goal, weeklyChangeKg: null, cautionMode, warnings, missing,
    };
  }

  const bmr = mifflinStJeor(p.weightKg!, p.heightCm!, p.age!, p.sex);
  if (!bmr.precise) {
    warnings.push({
      level: 'info',
      text: "Sexe non renseigné : l'estimation utilise la moyenne des deux formules (écart d'environ ±83 kcal sur le métabolisme de base).",
    });
  }
  const tdee = bmr.value * factor;
  const tdeeRange = bmr.range ? { min: round10(bmr.range.min * factor), max: round10(bmr.range.max * factor) } : null;

  let effectiveGoal: GoalMode = p.goal;
  let adjustmentPct = 0;
  if (cautionMode && (p.goal === 'lose' || p.goal === 'gain')) {
    effectiveGoal = 'maintain';
  } else if (p.goal === 'lose' || p.goal === 'gain') {
    adjustmentPct = PACE_ADJUSTMENT[p.goal][p.pace];
  }

  const suggestedKcal = round10(tdee * (1 + adjustmentPct));
  const weeklyChangeKg = adjustmentPct === 0 ? 0 : Math.round(((tdee * adjustmentPct * 7) / KCAL_PER_KG) * 100) / 100;

  if (suggestedKcal < bmr.value && effectiveGoal === 'lose') {
    warnings.push({
      level: 'caution',
      text: "L'objectif proposé est inférieur à ton métabolisme de base estimé. Un rythme plus doux est sans doute plus facile à tenir.",
    });
  }
  const currentBmi = bmi(p.weightKg!, p.heightCm!);
  if (p.goal === 'lose' && currentBmi < 18.5) {
    warnings.push({ level: 'caution', text: 'Ton IMC estimé est déjà inférieur à 18,5. Une perte de poids est déconseillée sans avis médical.' });
  }
  if (isPositive(p.targetWeightKg) && bmi(p.targetWeightKg!, p.heightCm!) < 18.5) {
    warnings.push({ level: 'caution', text: 'Le poids cible correspond à un IMC inférieur à 18,5. Parles-en à un professionnel de santé.' });
  }

  return { bmr, factor, tdee, tdeeRange, suggestedKcal, adjustmentPct, effectiveGoal, weeklyChangeKg, cautionMode, warnings, missing };
}

export interface MacroTargets {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  explanation: string;
}

/**
 * Repères de macronutriments prudents (non médicaux) :
 * - Protéines : 1,6 g/kg en perte ou prise de masse, 1,2 g/kg en maintien.
 *   Au-delà d'un IMC de 25, on utilise le poids correspondant à un IMC de 25
 *   pour ne pas surestimer les besoins.
 * - Lipides : ~30 % des calories.
 * - Glucides : le reste.
 */
export function suggestMacros(kcal: number, goal: GoalMode, weightKg: number | null, heightCm: number | null): MacroTargets {
  const fat = Math.round((kcal * 0.3) / 9);
  if (!isPositive(weightKg)) {
    const protein = Math.round((kcal * 0.2) / 4);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { protein, carbs, fat, explanation: 'Répartition par défaut : 20 % protéines, 30 % lipides, 50 % glucides.' };
  }
  let refWeight = weightKg!;
  if (isPositive(heightCm)) {
    const capped = 25 * (heightCm! / 100) ** 2;
    refWeight = Math.min(weightKg!, capped);
  }
  const perKg = goal === 'maintain' ? 1.2 : 1.6;
  const protein = Math.round(refWeight * perKg);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    protein,
    carbs,
    fat,
    explanation: `Protéines : ${perKg.toString().replace('.', ',')} g par kg de poids de référence (${Math.round(refWeight)} kg). Lipides : environ 30 % des calories. Glucides : le reste.`,
  };
}

export function goalsFromPlan(plan: EnergyPlan, profile: Pick<Profile, 'goal' | 'weightKg' | 'heightCm'>, trackMacros: boolean, now: string): Goals | null {
  if (plan.suggestedKcal == null) return null;
  const macros = suggestMacros(plan.suggestedKcal, plan.effectiveGoal, profile.weightKg, profile.heightCm);
  return {
    kcal: plan.suggestedKcal,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    trackMacros,
    manual: false,
    basis: { bmr: plan.bmr ? Math.round(plan.bmr.value) : null, tdee: plan.tdee ? Math.round(plan.tdee) : null, factor: plan.factor, adjustmentPct: plan.adjustmentPct },
    updatedAt: now,
  };
}

/** Budget du jour : objectif + éventuel crédit d'exercice (mode « séparé » uniquement). */
export function dailyBudget(goalKcal: number, exerciseKcal: number, method: EnergyMethod, credit: 0 | 0.5 | 1): number {
  if (method !== 'separate') return goalKcal;
  return goalKcal + Math.max(0, exerciseKcal) * credit;
}

function isPositive(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}
