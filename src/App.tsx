import { lazy, Suspense, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useApp } from './state/app';
import { href, navigate, useRoute } from './state/router';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { MealComposer } from './screens/MealComposer';
import { Library } from './screens/Library';
import { RecipeDetail } from './screens/RecipeDetail';
import { RecipeEditor } from './screens/RecipeEditor';
import { Advice } from './screens/Advice';
import { IconBulb, IconChart, IconMeals, IconToday, IconUser } from './ui/icons';
import { cx } from './ui/kit';

// Écrans plus lourds (graphiques, validation des sauvegardes) chargés à la demande.
const Progress = lazy(() => import('./screens/Progress').then((m) => ({ default: m.Progress })));
const ProfileScreen = lazy(() => import('./screens/Profile').then((m) => ({ default: m.ProfileScreen })));

const TABS = [
  { id: 'today', label: 'Aujourd’hui', icon: IconToday },
  { id: 'meals', label: 'Repas', icon: IconMeals },
  { id: 'progress', label: 'Progression', icon: IconChart },
  { id: 'advice', label: 'Conseils', icon: IconBulb },
  { id: 'profile', label: 'Profil', icon: IconUser },
];

export function App() {
  const { loaded, prefs, profile } = useApp();
  const route = useRoute();
  const [section] = route.path;

  useEffect(() => {
    if (!loaded) return;
    if (!prefs.onboarded && section !== 'onboarding') navigate('onboarding', undefined, { replace: true });
    if (prefs.onboarded && (section === 'onboarding' || !section)) navigate('today', undefined, { replace: true });
  }, [loaded, prefs.onboarded, section]);

  if (!loaded) return <Splash />;
  if (!prefs.onboarded || section === 'onboarding') return <><Onboarding /><UpdatePrompt /></>;
  if (!profile) return <Splash />;

  let screen: React.ReactNode;
  let tabbed = true;
  switch (section) {
    case 'add':
    case 'meal':
      screen = <MealComposer key={route.path.join('/')} route={route} />;
      tabbed = false;
      break;
    case 'recipe': {
      const [, id, action] = route.path;
      tabbed = false;
      screen = id === 'new' ? <RecipeEditor key="new" id={null} route={route} /> : action === 'edit' ? <RecipeEditor key={`e-${id}`} id={id} route={route} /> : <RecipeDetail key={id} id={id} />;
      break;
    }
    case 'meals': screen = <Library route={route} />; break;
    case 'progress': screen = <Progress route={route} />; break;
    case 'advice': screen = <Advice />; break;
    case 'profile': screen = <ProfileScreen />; break;
    default: screen = <Today route={route} />;
  }

  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<Splash />}>{screen}</Suspense>
      {tabbed && <BottomNav active={section || 'today'} />}
      <UpdatePrompt />
    </>
  );
}

function BottomNav({ active }: { active: string }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur" aria-label="Navigation principale">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = active === id;
          return (
            <a key={id} href={href(id)} aria-current={on ? 'page' : undefined} className={cx('flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', on ? 'text-brand' : 'text-muted')}>
              <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', on && 'bg-brand-soft')}><Icon size={21} /></span>
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center text-muted">Chargement…</div>;
}

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="safe-top bg-ink px-4 py-1.5 text-center text-[12.5px] font-medium text-white">Hors ligne · tes données restent accessibles ; la recherche de produits en ligne est indisponible.</div>;
}

function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-4 top-4 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
      <span className="flex-1">Une nouvelle version est disponible.</span>
      <button className="font-semibold text-[#9be3c4]" onClick={() => updateServiceWorker(true)}>Mettre à jour</button>
      <button className="text-white/70" onClick={() => setNeedRefresh(false)}>Plus tard</button>
    </div>
  );
}
