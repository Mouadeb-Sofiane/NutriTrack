/**
 * Client de l'analyse photo par IA.
 *
 * L'application n'appelle JAMAIS directement le fournisseur d'IA et ne contient aucune clé :
 * elle envoie la photo à TON relais (Cloudflare Worker, voir proxy/worker.js), protégé par
 * un code d'accès. Ce code ne donne accès qu'à ton relais et peut être changé à tout moment.
 * La configuration est stockée sur l'appareil et n'est PAS incluse dans les sauvegardes JSON.
 */
import type { NutriDB } from './db';
import type { PhotoAnalysisResult, PhotoAnalyzer } from '../domain/photoAnalysis';
import { parseAnalysis } from '../domain/aiAnalysis';

export interface AiConfig {
  enabled: boolean;
  endpoint: string;
  accessCode: string;
  /** L'utilisateur a lu et accepté l'envoi des photos analysées au service externe. */
  consent: boolean;
  lastCheck?: { ok: boolean; provider?: string; model?: string; at: string; error?: string };
}

export const DEFAULT_AI_CONFIG: AiConfig = { enabled: false, endpoint: '', accessCode: '', consent: false };
const KEY = 'ai';

export async function loadAiConfig(db: NutriDB): Promise<AiConfig> {
  return { ...DEFAULT_AI_CONFIG, ...((await db.kv.get(KEY))?.value as Partial<AiConfig> | undefined) };
}

export async function saveAiConfig(db: NutriDB, c: AiConfig) {
  await db.kv.put({ key: KEY, value: { ...c, endpoint: c.endpoint.trim().replace(/\/+$/, ''), accessCode: c.accessCode.trim() } });
}

export function isAiReady(c: AiConfig): boolean {
  return c.enabled && c.consent && /^https:\/\//.test(c.endpoint) && c.accessCode.length >= 16;
}

/** Code d'accès aléatoire (à recopier dans le secret ACCESS_CODE du relais). */
export function generateAccessCode(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function call(c: AiConfig, path: string, init: RequestInit, fetchImpl: FetchLike, timeoutMs: number): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${c.endpoint}${path}`, { ...init, signal: ctrl.signal, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${c.accessCode}` } });
    let body: Record<string, unknown> | null = null;
    try { body = (await res.json()) as Record<string, unknown>; } catch { body = null; }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

function errorMessage(e: unknown): string {
  if ((e as Error)?.name === 'AbortError') return 'Le service d’IA met trop de temps à répondre. Réessaie, ou identifie le plat manuellement.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Pas de connexion Internet : l’analyse IA est indisponible. Identifie le plat manuellement.';
  return 'Impossible de joindre le relais d’analyse. Vérifie l’adresse dans Profil → Analyse photo par IA.';
}

export async function checkAiConnection(c: AiConfig, fetchImpl: FetchLike = fetch): Promise<NonNullable<AiConfig['lastCheck']>> {
  const at = new Date().toISOString();
  try {
    const r = await call(c, '/health', { method: 'GET' }, fetchImpl, 15000);
    if (r.status === 200 && r.body?.ok) return { ok: true, provider: String(r.body.provider ?? ''), model: String(r.body.model ?? ''), at };
    return { ok: false, at, error: String(r.body?.error ?? `Erreur ${r.status}`) };
  } catch (e) {
    return { ok: false, at, error: errorMessage(e) };
  }
}

/** Analyseur réel : envoie la photo au relais, valide la réponse avant de l'utiliser. */
export function createRelayAnalyzer(c: AiConfig, fetchImpl: FetchLike = fetch, timeoutMs = 60000): PhotoAnalyzer {
  return {
    id: 'relay',
    label: 'Analyse photo par IA (relais personnel)',
    async analyze(photo: Blob, hint?: string): Promise<PhotoAnalysisResult> {
      let r: Awaited<ReturnType<typeof call>>;
      try {
        r = await call(c, '/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: await blobToBase64(photo), mime: photo.type || 'image/jpeg', hint: hint?.slice(0, 600) }),
        }, fetchImpl, timeoutMs);
      } catch (e) {
        return { status: 'error', message: errorMessage(e) };
      }
      if (r.status !== 200 || !r.body?.ok) {
        return { status: 'error', message: String(r.body?.error ?? `Le relais a répondu avec une erreur (${r.status}).`) };
      }
      const parsed = parseAnalysis(r.body.analysis);
      if (!parsed.ok) return { status: 'error', message: `${parsed.error} Identifie le plat manuellement.` };
      const provider = [r.body.provider, r.body.model].filter(Boolean).join(' · ');
      return {
        status: 'ok',
        analysis: parsed.analysis,
        provider,
        visible: parsed.analysis.items.filter((i) => i.visibility === 'visible').map((i) => i.name),
        assumed: parsed.analysis.items.filter((i) => i.visibility !== 'visible').map((i) => i.name),
        unknown: parsed.analysis.hidden_unknowns,
        description: [parsed.analysis.dish_name, ...parsed.analysis.items.map((i) => i.name)].filter(Boolean).join(', '),
        message: `Analyse réalisée par ${provider || 'le service d’IA'}.`,
      };
    },
  };
}
