/**
 * Brouillon du repas en cours de composition (conservé en sessionStorage pour
 * ne rien perdre si l'on change d'onglet ou si le navigateur recharge la page).
 */
import { useSyncExternalStore } from 'react';
import type { EstimationMethod, LineItem, MealEntry, MealPlace, MealType } from '../domain/types';
import { today } from '../domain/dates';

export interface MealDraft {
  editingId?: string;
  createdAt?: string;
  date: string;
  mealType: MealType;
  name: string;
  place: MealPlace;
  restaurantName: string;
  items: LineItem[];
  methods: EstimationMethod[];
  assumptions: string[];
  photoId?: string;
  notes: string;
  userCorrected: boolean;
}

const KEY = 'nutritrack.draft';

export function defaultMealType(d = new Date()): MealType {
  const h = d.getHours();
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

export function emptyDraft(date = today(), mealType: MealType = defaultMealType()): MealDraft {
  return { date, mealType, name: '', place: 'home', restaurantName: '', items: [], methods: [], assumptions: [], notes: '', userCorrected: false };
}

function load(): MealDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MealDraft) : null;
  } catch {
    return null;
  }
}

let current: MealDraft | null = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    if (current) sessionStorage.setItem(KEY, JSON.stringify(current));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : le brouillon reste en mémoire */
  }
  listeners.forEach((l) => l());
}

export const draftStore = {
  get: () => current,
  set(d: MealDraft | null) {
    current = d;
    emit();
  },
  update(fn: (d: MealDraft) => MealDraft) {
    current = fn(current ?? emptyDraft());
    emit();
  },
  addItems(items: LineItem[], method: EstimationMethod, assumptions: string[] = []) {
    draftStore.update((d) => ({
      ...d,
      items: [...d.items, ...items],
      methods: d.methods.includes(method) ? d.methods : [...d.methods, method],
      assumptions: [...d.assumptions, ...assumptions.filter((a) => !d.assumptions.includes(a))],
    }));
  },
  fromMeal(m: MealEntry) {
    current = {
      editingId: m.id, createdAt: m.createdAt, date: m.date, mealType: m.mealType, name: m.name ?? '', place: m.place,
      restaurantName: m.restaurantName ?? '', items: m.items, methods: [m.method], assumptions: m.assumptions,
      photoId: m.photoId, notes: m.notes ?? '', userCorrected: m.userCorrected,
    };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useDraft(): MealDraft | null {
  return useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);
}

export function finalMethod(methods: EstimationMethod[]): EstimationMethod {
  const u = [...new Set(methods)];
  return u.length === 1 ? u[0] : u.length === 0 ? 'manual' : 'mixed';
}
