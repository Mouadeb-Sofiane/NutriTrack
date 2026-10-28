import { createContext, useContext, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { createRepo, DEFAULT_PREFS } from '../data/repo';
import type { Goals, Preferences, Profile } from '../domain/types';

export const repo = createRepo(db);

interface AppState {
  loaded: boolean;
  profile: Profile | null;
  goals: Goals | null;
  prefs: Preferences;
}

const Ctx = createContext<AppState>({ loaded: false, profile: null, goals: null, prefs: DEFAULT_PREFS });

export function AppProvider({ children }: { children: ReactNode }) {
  const state = useLiveQuery(async () => {
    const rows = await db.kv.bulkGet(['profile', 'goals', 'prefs']);
    return {
      loaded: true,
      profile: (rows[0]?.value as Profile) ?? null,
      goals: (rows[1]?.value as Goals) ?? null,
      prefs: { ...DEFAULT_PREFS, ...((rows[2]?.value as Preferences) ?? {}) },
    };
  }, []);
  return <Ctx.Provider value={state ?? { loaded: false, profile: null, goals: null, prefs: DEFAULT_PREFS }}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
