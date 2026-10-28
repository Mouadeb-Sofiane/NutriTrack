import { beforeEach, describe, expect, it } from 'vitest';
import { handle, pickModel, resetModelCache, safeEqual } from './worker.js';
import { geminiResponse, KEBAB_ANALYSIS } from '../src/test/aiFixtures';

const env = { GEMINI_API_KEY: 'cle-secrete', ACCESS_CODE: 'code-acces-tres-long-1234567890', ALLOWED_ORIGINS: 'https://moi.github.io', GEMINI_MODEL: 'gemini-test-flash' };
const req = (path, init = {}) => new Request(`https://relais.example${path}`, { ...init, headers: { Origin: 'https://moi.github.io', Authorization: `Bearer ${env.ACCESS_CODE}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const analyzeBody = JSON.stringify({ image: '/9j/AAAA', mime: 'image/jpeg', hint: 'deux sauces' });

function mockUpstream(handler) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls.length); };
  return { f, calls };
}

beforeEach(() => resetModelCache());

describe('sécurité du relais', () => {
  it('refuse sans code d’accès correct, sans appeler le fournisseur', async () => {
    const up = mockUpstream(() => new Response('{}'));
    const r = await handle(req('/analyze', { method: 'POST', body: analyzeBody, headers: { Authorization: 'Bearer faux' } }), env, up.f);
    expect(r.status).toBe(401);
    expect(up.calls).toHaveLength(0);
  });
  it('refuse si mal configuré', async () => {
    const r = await handle(req('/health'), { ...env, GEMINI_API_KEY: '' });
    expect(r.status).toBe(500);
  });
  it('CORS : pré-vol et origine autorisée', async () => {
    const r = await handle(new Request('https://relais.example/analyze', { method: 'OPTIONS', headers: { Origin: 'https://moi.github.io' } }), env);
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://moi.github.io');
  });
  it('n’envoie jamais la clé au navigateur', async () => {
    const up = mockUpstream(() => new Response(JSON.stringify(geminiResponse(KEBAB_ANALYSIS))));
    const r = await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, up.f);
    expect(await r.text()).not.toContain(env.GEMINI_API_KEY);
    expect(up.calls[0].init.headers['x-goog-api-key']).toBe(env.GEMINI_API_KEY);
  });
  it('refuse les formats et les photos trop lourdes', async () => {
    expect((await handle(req('/analyze', { method: 'POST', body: JSON.stringify({ image: 'x', mime: 'text/plain' }) }), env)).status).toBe(400);
    expect((await handle(req('/analyze', { method: 'POST', body: JSON.stringify({ image: 'A'.repeat(6_000_000), mime: 'image/jpeg' }) }), env)).status).toBe(413);
  });
  it('comparaison du code', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('appel au modèle de vision', () => {
  it('envoie photo, consignes et schéma ; renvoie l’analyse', async () => {
    const up = mockUpstream(() => new Response(JSON.stringify(geminiResponse(KEBAB_ANALYSIS))));
    const r = await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, up.f);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body).toMatchObject({ ok: true, provider: 'gemini', model: 'gemini-test-flash' });
    expect(body.analysis.items).toHaveLength(4);
    expect(up.calls[0].url).toContain('/v1beta/models/gemini-test-flash:generateContent');
    const payload = JSON.parse(up.calls[0].init.body);
    expect(payload.contents[0].parts[0].inline_data).toEqual({ mime_type: 'image/jpeg', data: '/9j/AAAA' });
    expect(payload.contents[0].parts[1].text).toContain('deux sauces');
    expect(payload.generationConfig.responseSchema.required).toContain('items');
    expect(payload.systemInstruction.parts[0].text).toMatch(/Tu ne connais PAS le poids exact/);
  });
  it('si le modèle refuse le schéma (400), réessaie sans schéma', async () => {
    const up = mockUpstream((_u, _i, n) => (n === 1 ? new Response('{}', { status: 400 }) : new Response(JSON.stringify(geminiResponse(KEBAB_ANALYSIS)))));
    const r = await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, up.f);
    expect(r.status).toBe(200);
    expect(JSON.parse(up.calls[1].init.body).generationConfig.responseSchema).toBeUndefined();
  });
  it.each([[429, 429, /Quota/], [401, 502, /Clé API/], [500, 502, /erreur/]])('erreur du fournisseur %i → %i', async (upstream, expected, msg) => {
    const up = mockUpstream(() => new Response('{}', { status: upstream }));
    const r = await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, up.f);
    expect(r.status).toBe(expected);
    expect((await r.json()).error).toMatch(msg);
  });
  it('réponse illisible ou bloquée', async () => {
    const bad = mockUpstream(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'pas du json' }] } }] })));
    expect((await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, bad.f)).status).toBe(502);
    const blocked = mockUpstream(() => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
    expect((await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, blocked.f)).status).toBe(422);
  });
  it('ignore les parties « pensée » et les blocs de code', async () => {
    const up = mockUpstream(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'réflexion…', thought: true }, { text: '```json\n' + JSON.stringify(KEBAB_ANALYSIS) + '\n```' }] } }] })));
    const r = await handle(req('/analyze', { method: 'POST', body: analyzeBody }), env, up.f);
    expect((await r.json()).analysis.dish_name).toBe('Kebab avec frites');
  });
});

describe('choix automatique du modèle', () => {
  const m = (name, methods = ['generateContent']) => ({ name: `models/${name}`, supportedGenerationMethods: methods });
  it('préfère le Flash stable le plus récent', () => {
    expect(pickModel([m('gemini-2.5-flash'), m('gemini-3.5-flash'), m('gemini-3.5-flash-lite'), m('gemini-3.8-flash-preview-09'), m('gemini-3.5-pro'), m('text-embedding-004', ['embedContent'])])).toBe('gemini-3.5-flash');
  });
  it('se rabat sur une préversion ou un Flash-Lite', () => {
    expect(pickModel([m('gemini-4-flash-preview'), m('gemini-2.0-flash-image')])).toBe('gemini-4-flash-preview');
    expect(pickModel([m('gemini-3.5-flash-lite')])).toBe('gemini-3.5-flash-lite');
    expect(pickModel([])).toBeNull();
  });
  it('/health interroge la liste des modèles quand GEMINI_MODEL est vide', async () => {
    const up = mockUpstream(() => new Response(JSON.stringify({ models: [m('gemini-2.5-flash'), m('gemini-3-flash')] })));
    const r = await handle(req('/health'), { ...env, GEMINI_MODEL: '' }, up.f);
    expect(await r.json()).toMatchObject({ ok: true, model: 'gemini-3-flash' });
    expect(up.calls[0].url).toContain('/v1beta/models');
  });
});
