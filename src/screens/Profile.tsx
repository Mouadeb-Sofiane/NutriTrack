/** Profil, objectifs, données (sauvegarde / restauration) et informations. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { repo, useApp } from '../state/app';
import { navigate } from '../state/router';
import { computeEnergyPlan, goalsFromPlan } from '../domain/energy';
import type { Goals, Profile as ProfileT } from '../domain/types';
import { nowISO, today } from '../domain/dates';
import { fmtKcal } from '../domain/nutrition';
import { exportAll, importBackup, parseBackup, wipeAll, type Backup } from '../data/backup';
import { Button, Card, IconButton, Notice, SectionTitle, Stat, Toggle } from '../ui/kit';
import { IconChevronLeft, IconDownload, IconUpload } from '../ui/icons';
import { useFeedback } from '../ui/feedback';
import { Sheet } from '../ui/Sheet';
import { ActivitySection, BodySection, GoalSection, PlanSummary, PrefsSection, profileErrors } from './profileSections';
import { GoalsEditor } from './GoalsEditor';

export function ProfileScreen() {
  const { profile, goals, prefs } = useApp();
  const [editProfile, setEditProfile] = useState(false);
  const [editGoals, setEditGoals] = useState(false);
  const plan = useMemo(() => (profile ? computeEnergyPlan(profile) : null), [profile]);
  if (!profile || !plan) return null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pt-4"><h1 className="text-2xl font-extrabold">Profil</h1></header>

      <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setEditProfile(true)}>Modifier</Button>}>Mes estimations</SectionTitle>
      <Card><PlanSummary plan={plan} /></Card>

      <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setEditGoals(true)}>Modifier</Button>}>Mes objectifs</SectionTitle>
      <Card>
        {goals ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Objectif calorique" value={`${fmtKcal(goals.kcal)} kcal`} sub={goals.manual ? 'fixé manuellement' : 'proposition calculée'} />
            {goals.trackMacros ? <Stat label="Macros (P / G / L)" value={`${goals.protein ?? '—'} / ${goals.carbs ?? '—'} / ${goals.fat ?? '—'} g`} /> : <Stat label="Macros" value="Non suivies" />}
            <Stat label="Poids cible" value={profile.targetWeightKg ? `${String(profile.targetWeightKg).replace('.', ',')} kg` : '—'} />
            <Stat label="Sport" value={profile.energyMethod === 'included' ? 'Inclus' : 'Saisi à part'} />
          </div>
        ) : <Notice tone="warn">Aucun objectif. Touche « Modifier » pour en définir un.</Notice>}
        {goals && plan.suggestedKcal != null && !goals.manual && goals.kcal !== plan.suggestedKcal && (
          <Notice className="mt-3">Ton profil donne désormais une proposition de {fmtKcal(plan.suggestedKcal)} kcal. Ton objectif n’a pas été modifié : touche « Modifier » pour l’appliquer si tu le souhaites.</Notice>
        )}
      </Card>

      <DataSection lastBackupAt={prefs.lastBackupAt} />
      <About />

      {editProfile && <ProfileEditor profile={profile} goals={goals} onClose={() => setEditProfile(false)} />}
      {editGoals && <GoalsSheet profile={profile} goals={goals} onClose={() => setEditGoals(false)} />}
    </div>
  );
}

function ProfileEditor({ profile, goals, onClose }: { profile: ProfileT; goals: Goals | null; onClose: () => void }) {
  const [p, setP] = useState(profile);
  const [trackMacros, setTrackMacros] = useState(goals?.trackMacros ?? true);
  const { confirm, toast } = useFeedback();
  const set = (patch: Partial<ProfileT>) => setP((x) => ({ ...x, ...patch }));
  const errors = profileErrors(p);
  const save = async () => {
    await repo.saveProfile(p);
    const plan = computeEnergyPlan(p);
    const suggested = goalsFromPlan(plan, p, trackMacros, nowISO());
    if (goals && trackMacros !== goals.trackMacros) await repo.saveGoals({ ...goals, trackMacros });
    // Jamais de changement silencieux : on demande avant d'appliquer une nouvelle proposition.
    if (suggested && (!goals || suggested.kcal !== goals.kcal)) {
      const ok = await confirm({
        title: 'Nouvelle proposition d’objectif',
        text: `Avec ces informations, l’objectif proposé est de ${fmtKcal(suggested.kcal)} kcal/jour${goals ? ` (actuellement ${fmtKcal(goals.kcal)} kcal)` : ''}. Veux-tu l’appliquer ?`,
        confirm: 'Appliquer',
        cancel: 'Garder mon objectif actuel',
      });
      if (ok) await repo.saveGoals(suggested);
    }
    toast('Profil enregistré');
    onClose();
  };
  return (
    <FullScreen title="Modifier mon profil" onClose={onClose} footer={<Button block size="lg" disabled={errors.length > 0} onClick={save}>Enregistrer</Button>}>
      <h2 className="mb-3 mt-2 text-lg font-bold">Corps</h2>
      <BodySection p={p} set={set} />
      <h2 className="mb-3 mt-6 text-lg font-bold">Activité</h2>
      <ActivitySection p={p} set={set} />
      <h2 className="mb-3 mt-6 text-lg font-bold">Objectif</h2>
      <GoalSection p={p} set={set} />
      <h2 className="mb-3 mt-6 text-lg font-bold">Préférences</h2>
      <PrefsSection p={p} set={set} trackMacros={trackMacros} setTrackMacros={setTrackMacros} />
      {errors.length > 0 && <Notice tone="warn">{errors[0]}</Notice>}
    </FullScreen>
  );
}

function GoalsSheet({ profile, goals, onClose }: { profile: ProfileT; goals: Goals | null; onClose: () => void }) {
  const plan = useMemo(() => computeEnergyPlan(profile), [profile]);
  const [g, setG] = useState<Goals>(goals ?? goalsFromPlan(plan, profile, true, nowISO()) ?? { kcal: 2000, protein: null, carbs: null, fat: null, trackMacros: true, manual: true, updatedAt: nowISO() });
  const { toast } = useFeedback();
  const save = async () => {
    if (!g.kcal || g.kcal < 500 || g.kcal > 10000) { toast('Indique un objectif entre 500 et 10 000 kcal.', 'error'); return; }
    await repo.saveGoals({ ...g, basis: plan.bmr ? { bmr: Math.round(plan.bmr.value), tdee: Math.round(plan.tdee ?? 0), factor: plan.factor, adjustmentPct: plan.adjustmentPct } : g.basis });
    toast('Objectifs enregistrés');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Mes objectifs" footer={<Button block onClick={save}>Enregistrer</Button>}>
      <GoalsEditor goals={g} setGoals={setG} plan={plan} profile={profile} />
    </Sheet>
  );
}

function FullScreen({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-lg pb-32">
        <header className="safe-top sticky top-0 z-10 flex items-center gap-1 bg-bg/90 px-2 py-2 backdrop-blur">
          <IconButton label="Fermer" onClick={onClose}><IconChevronLeft /></IconButton>
          <h1 className="text-lg font-bold">{title}</h1>
        </header>
        <div className="px-4">{children}</div>
      </div>
      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur"><div className="mx-auto max-w-lg px-4 py-3">{footer}</div></div>
    </div>
  );
}

function DataSection({ lastBackupAt }: { lastBackupAt?: string }) {
  const { confirm, toast } = useFeedback();
  const [withPhotos, setWithPhotos] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; counts: Record<string, number> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const counts = useLiveQuery(async () => ({ meals: await db.meals.count(), recipes: await db.recipes.count(), weights: await db.weights.count(), photos: await db.photos.count() }), []);

  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)); }, []);

  const doExport = async () => {
    try {
      const data = await exportAll(db, { includePhotos: withPhotos });
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const name = `nutritrack-sauvegarde-${today()}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      // Sur mobile, le partage natif permet d'enregistrer dans Fichiers / Drive / e-mail.
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Sauvegarde NutriTrack' }); } catch (e) { if ((e as Error).name === 'AbortError') return; download(blob, name); }
      } else download(blob, name);
      await repo.savePrefs({ lastBackupAt: nowISO() });
      toast('Sauvegarde exportée');
    } catch {
      toast('Export impossible.', 'error');
    }
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    const res = parseBackup(await f.text());
    if (!res.ok) { toast(res.error!, 'error'); return; }
    setPending({ backup: res.backup!, counts: res.counts! });
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace' && !(await confirm({ title: 'Remplacer toutes les données ?', text: 'Toutes les données actuelles de cet appareil seront effacées puis remplacées par la sauvegarde. Pense à exporter d’abord si besoin.', confirm: 'Tout remplacer', danger: true }))) return;
    try {
      const rep = await importBackup(db, pending.backup, mode);
      const added = Object.entries(rep.added).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ');
      const skipped = Object.values(rep.skipped).reduce((a, b) => a + b, 0);
      toast(`Restauration terminée${added ? ` : ${added}` : ''}${skipped ? ` (${skipped} doublon(s) ignoré(s))` : ''}`);
      setPending(null);
    } catch {
      toast('La restauration a échoué : aucune donnée n’a été modifiée.', 'error');
    }
  };

  const wipe = async () => {
    if (!(await confirm({ title: 'Effacer toutes les données ?', text: 'Repas, recettes, pesées, photos et profil seront définitivement supprimés de cet appareil.', confirm: 'Continuer', danger: true }))) return;
    if (!(await confirm({ title: 'Dernière confirmation', text: 'Cette action est irréversible. As-tu exporté une sauvegarde ?', confirm: 'Tout effacer', danger: true }))) return;
    await wipeAll(db);
    try { sessionStorage.clear(); } catch { /* ignoré */ }
    navigate('onboarding', undefined, { replace: true });
  };

  return (
    <>
      <SectionTitle>Mes données</SectionTitle>
      <Card>
        <p className="text-[14px] leading-snug">
          Tout est stocké <b>uniquement sur cet appareil</b> ({counts ? `${counts.meals} repas, ${counts.recipes} recettes, ${counts.weights} pesées, ${counts.photos} photos` : '…'}). Si les données du site sont effacées ou le navigateur réinitialisé, elles sont perdues : <b>exporte régulièrement une sauvegarde</b>. Il n’y a pas de sauvegarde automatique.
        </p>
        <p className="mt-2 text-[13px] text-muted">Dernière sauvegarde : {lastBackupAt ? new Date(lastBackupAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'jamais'}</p>
        {persisted === false && (
          <Button variant="ghost" size="sm" className="mt-1 !px-0" onClick={async () => { const ok = await navigator.storage?.persist?.(); setPersisted(!!ok); toast(ok ? 'Stockage protégé contre le nettoyage automatique' : 'Le navigateur a refusé (installe l’application sur l’écran d’accueil puis réessaie)'); }}>
            Protéger le stockage contre le nettoyage automatique
          </Button>
        )}
        {persisted && <p className="mt-1 text-[13px] text-brand">✓ Stockage protégé contre le nettoyage automatique du navigateur.</p>}
        <div className="mt-3"><Toggle checked={withPhotos} onChange={setWithPhotos} label="Inclure les photos" desc="Fichier plus volumineux." /></div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={doExport}><IconDownload size={19} /> Exporter</Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}><IconUpload size={19} /> Restaurer</Button>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <Button variant="ghost" size="sm" block className="mt-3 !text-danger" onClick={wipe}>Effacer toutes les données</Button>
      </Card>
      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restaurer une sauvegarde">
        {pending && (
          <>
            <p className="mb-3 text-[14px]">Sauvegarde du {new Date(pending.backup.exportedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} : {Object.entries(pending.counts).map(([k, n]) => `${n} ${k}`).join(', ')}.</p>
            <Button block className="mb-2" onClick={() => doImport('merge')}>Fusionner avec mes données</Button>
            <p className="mb-4 text-[12.5px] text-muted">Ajoute seulement ce qui manque. Les éléments déjà présents (même identifiant) ne sont pas dupliqués ; ton profil et tes objectifs actuels sont conservés.</p>
            <Button block variant="danger" onClick={() => doImport('replace')}>Tout remplacer par la sauvegarde</Button>
          </>
        )}
      </Sheet>
    </>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function About() {
  return (
    <>
      <SectionTitle>À propos</SectionTitle>
      <Card>
        <ul className="space-y-2 text-[13.5px] leading-snug text-muted">
          <li><b className="text-ink">Outil d’information, pas un dispositif médical.</b> Les besoins caloriques et les valeurs des repas sont des estimations. Pour une situation médicale particulière, consulte un professionnel de santé.</li>
          <li><b className="text-ink">Sources :</b> table de référence intégrée (valeurs moyennes indicatives, ordre de grandeur des tables CIQUAL/ANSES et USDA) ; produits : <a className="text-brand" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (licence ODbL, données collaboratives) ; formule de Mifflin-St Jeor.</li>
          <li><b className="text-ink">Confidentialité :</b> aucune donnée personnelle n’est envoyée. Seule la recherche en ligne de produits transmet le texte recherché ou le code-barres à Open Food Facts.</li>
          <li><b className="text-ink">Analyse photo par IA :</b> pas encore disponible. Les photos restent sur l’appareil.</li>
          <li>NutriTrack v{__APP_VERSION__} · gratuit, sans publicité.</li>
        </ul>
      </Card>
    </>
  );
}
