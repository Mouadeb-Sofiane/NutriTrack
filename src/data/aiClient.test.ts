import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { checkAiConnection, createRelayAnalyzer, generateAccessCode, isAiReady, loadAiConfig, saveAiConfig, type AiConfig } from './aiClient';
import { analyzePhoto } from '../domain/photoAnalysis';
import { NutriDB } from './db';
import { exportAll } from './backup';
import { KEBAB_ANALYSIS } from '../test/aiFixtures';

const cfg: AiConfig = { enabled: true, endpoint: 'https://relais.example.workers.dev', accessCode: 'a'.repeat(32), consent: true };
const photo = new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' });
const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('configuration', () => {
  it('prête seulement si activée, consentie, HTTPS et code assez long', () => {
    expect(isAiReady(cfg)).toBe(true);
    expect(isAiReady({ ...cfg, consent: false })).toBe(false);
    expect(isAiReady({ ...cfg, endpoint: 'http://relais.example' })).toBe(false);
    expect(isAiReady({ ...cfg, accessCode: 'court' })).toBe(false);
    expect(generateAccessCode()).toMatch(/^[0-9a-f]{48}$/);
  });
  it('stockée sur l’appareil mais jamais exportée dans les sauvegardes', async () => {
    const db = new NutriDB('ai-cfg');
    await saveAiConfig(db, { ...cfg, endpoint: ' https://relais.example.workers.dev/ ' });
    expect((await loadAiConfig(db)).endpoint).toBe('https://relais.example.workers.dev');
    const backup = JSON.stringify(await exportAll(db, { includePhotos: false }));
    expect(backup).not.toContain(cfg.accessCode);
  });
});

describe('analyse via le relais', () => {
  it('envoie la photo avec le code d’accès, valide et renvoie l’analyse', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      sent = { url, init: init! };
      return new Response(JSON.stringify({ ok: true, provider: 'gemini', model: 'gemini-x-flash', analysis: KEBAB_ANALYSIS }), { status: 200 });
    };
    const r = await analyzePhoto(photo, createRelayAnalyzer(cfg, fetchImpl), 'sans oignons');
    expect(r.status).toBe('ok');
    expect(r.analysis!.items).toHaveLength(4);
    expect(r.provider).toBe('gemini · gemini-x-flash');
    expect(r.unknown).toEqual(KEBAB_ANALYSIS.hidden_unknowns);
    expect(sent!.url).toBe('https://relais.example.workers.dev/analyze');
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${cfg.accessCode}`);
    const body = JSON.parse(String(sent!.init.body));
    expect(body).toMatchObject({ image: '/9j/', mime: 'image/jpeg', hint: 'sans oignons' });
  });
  it('erreur du relais (code incorrect, quota…) → message, sans résultat inventé', async () => {
    const r = await analyzePhoto(photo, createRelayAnalyzer(cfg, respond(401, { ok: false, error: 'Code d’accès incorrect.' })));
    expect(r).toMatchObject({ status: 'error', message: 'Code d’accès incorrect.' });
    expect(r.analysis).toBeUndefined();
  });
  it('réponse mal formée → erreur', async () => {
    const r = await analyzePhoto(photo, createRelayAnalyzer(cfg, respond(200, { ok: true, analysis: { foo: 1 } })));
    expect(r.status).toBe('error');
    expect(r.analysis).toBeUndefined();
  });
  it('réseau indisponible → erreur gérée', async () => {
    const r = await analyzePhoto(photo, createRelayAnalyzer(cfg, async () => { throw new TypeError('Failed to fetch'); }));
    expect(r.status).toBe('error');
  });
  it('délai dépassé → erreur gérée', async () => {
    const slow = (_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const r = await analyzePhoto(photo, createRelayAnalyzer(cfg, slow, 20));
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/trop de temps/);
  });
  it('test de connexion', async () => {
    expect(await checkAiConnection(cfg, respond(200, { ok: true, provider: 'gemini', model: 'm' }))).toMatchObject({ ok: true, model: 'm' });
    expect(await checkAiConnection(cfg, respond(401, { ok: false, error: 'Code d’accès incorrect.' }))).toMatchObject({ ok: false, error: 'Code d’accès incorrect.' });
  });
});
