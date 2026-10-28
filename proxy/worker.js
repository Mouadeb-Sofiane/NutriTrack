/**
 * NutriTrack — relais d'analyse photo (Cloudflare Worker, offre gratuite).
 *
 * Rôle : recevoir une photo de l'application, l'envoyer au modèle de vision Gemini avec
 * la clé API stockée ICI (secret Cloudflare), et renvoyer une analyse structurée.
 * La clé n'est jamais envoyée au navigateur ni écrite dans le dépôt.
 *
 * Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
 *   GEMINI_API_KEY   (secret, obligatoire)  clé créée sur Google AI Studio
 *   ACCESS_CODE      (secret, obligatoire)  code long et aléatoire, recopié dans l'application
 *   ALLOWED_ORIGINS  (facultatif)           ex. https://moncompte.github.io (plusieurs : séparés par des virgules)
 *   GEMINI_MODEL     (facultatif)           ex. gemini-2.5-flash ; sinon le modèle « Flash » le plus récent est choisi
 *
 * Confidentialité : aucune photo ni aucune réponse n'est enregistrée par ce relais
 * (pas de stockage, pas de journalisation du contenu).
 * Fichier autonome, sans dépendance : il peut être collé tel quel dans l'éditeur Cloudflare.
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com';

export const SYSTEM_PROMPT = `Tu es l'assistant d'analyse photo de NutriTrack, une application personnelle de suivi alimentaire.
Analyse UNIQUEMENT ce que montre la photo. Réponds en français, au format JSON demandé.

Règles impératives :
- Liste chaque élément du repas séparément (plat, accompagnement, sauce, garniture, boisson, dessert).
- Pour un plat servi comme un tout (kebab, burger, sandwich, tacos, pizza, wrap, crêpe), décris-le comme UN élément nommé simplement (« Kebab », « Burger », « Pizza »). Les frites, boissons et sauces servies à part sont des éléments distincts.
- Pour une assiette composée (couscous, riz et viande, salade, plat en sauce), liste les composants visibles (« Semoule », « Poulet », « Pois chiches »…).
- Noms courts et courants en français, sans marque.
- visibility : "visible" si clairement visible, "partial" si en partie caché, "assumed" si seulement probable (ex. sauce sous la viande). N'invente pas d'ingrédients non identifiables : signale-les dans hidden_unknowns.
- Portions : estime une fourchette en grammes (grams_low, grams_mean, grams_high) à partir de repères visuels (taille de l'assiette, des couverts, de l'emballage). Tu ne connais PAS le poids exact : la fourchette doit refléter l'incertitude. size = small / medium / large.
- grams_high est une portion plus généreuse mais plausible, pas le pire cas imaginable.
- kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g : valeurs typiques pour 100 g de cet aliment tel que préparé, ou null si tu ne sais pas.
- hidden_unknowns : ce qu'une photo ne permet pas de savoir (quantité d'huile ou de beurre, sauce cachée, garniture intérieure, recette exacte…).
- questions : au plus 2 questions courtes et utiles à l'utilisateur, avec 2 à 4 réponses possibles. Liste vide si inutile.
- confidence : "high" seulement si les aliments ET les portions sont clairs.
- Si la photo ne montre pas de nourriture : is_food = false et items vide.
- Aucun jugement sur la qualité des aliments, aucun conseil.`;

/** Schéma de sortie (sous-ensemble OpenAPI accepté par l'API Gemini). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN' },
    dish_name: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          category: { type: 'STRING', enum: ['main', 'side', 'sauce', 'topping', 'drink', 'dessert', 'snack', 'other'] },
          visibility: { type: 'STRING', enum: ['visible', 'partial', 'assumed'] },
          evidence: { type: 'STRING' },
          size: { type: 'STRING', enum: ['small', 'medium', 'large'] },
          grams_low: { type: 'NUMBER' },
          grams_mean: { type: 'NUMBER' },
          grams_high: { type: 'NUMBER' },
          kcal_per_100g: { type: 'NUMBER', nullable: true },
          protein_per_100g: { type: 'NUMBER', nullable: true },
          carbs_per_100g: { type: 'NUMBER', nullable: true },
          fat_per_100g: { type: 'NUMBER', nullable: true },
        },
        required: ['name', 'category', 'visibility', 'evidence', 'size', 'grams_low', 'grams_mean', 'grams_high'],
      },
    },
    hidden_unknowns: { type: 'ARRAY', items: { type: 'STRING' } },
    questions: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['text', 'options'] },
    },
    notes: { type: 'STRING' },
  },
  required: ['is_food', 'dish_name', 'confidence', 'items', 'hidden_unknowns', 'questions'],
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(request, env) } });
}

/** Comparaison en temps constant (évite de deviner le code caractère par caractère). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Choisit le modèle « Flash » stable le plus récent qui accepte generateContent. */
export function pickModel(models) {
  const usable = (models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  const version = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  const byVersion = (a, b) => version(b) - version(a);
  const stableFlash = usable.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort(byVersion);
  if (stableFlash.length) return stableFlash[0];
  const anyFlash = usable.filter((n) => /^gemini-\d+(\.\d+)?-flash/.test(n) && !/lite|image|tts|live|audio|thinking|exp/.test(n)).sort(byVersion);
  if (anyFlash.length) return anyFlash[0];
  const lite = usable.filter((n) => /flash-lite/.test(n)).sort(byVersion);
  return lite[0] || null;
}

let cachedModel = null;
/** Pour les tests. */
export function resetModelCache() {
  cachedModel = null;
}

async function resolveModel(env, fetchImpl) {
  if (env.GEMINI_MODEL) return env.GEMINI_MODEL;
  if (cachedModel) return cachedModel;
  const base = env.GEMINI_API_BASE || DEFAULT_API_BASE;
  const res = await fetchImpl(`${base}/v1beta/models?pageSize=1000`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  if (!res.ok) throw upstreamError(res.status);
  const data = await res.json();
  const model = pickModel(data.models);
  if (!model) throw Object.assign(new Error('Aucun modèle de vision « Flash » disponible pour cette clé. Définis GEMINI_MODEL.'), { status: 502 });
  cachedModel = model;
  return model;
}

function upstreamError(status) {
  const map = {
    400: 'Requête refusée par le service d’IA (modèle ou format non pris en charge).',
    401: 'Clé API Gemini invalide (vérifie GEMINI_API_KEY dans Cloudflare).',
    403: 'Clé API Gemini refusée ou API non activée pour ce projet.',
    404: 'Modèle introuvable : vérifie GEMINI_MODEL.',
    429: 'Quota du service d’IA atteint. Réessaie plus tard (ou active la facturation sur Google AI Studio).',
  };
  return Object.assign(new Error(map[status] || `Le service d’IA a répondu avec une erreur (${status}).`), { status: status === 429 ? 429 : 502 });
}

function buildUserText(body) {
  const parts = ['Analyse cette photo de repas.'];
  if (body.hint && String(body.hint).trim()) parts.push(`Précisions données par l'utilisateur (prioritaires sur ce que tu supposes) : ${String(body.hint).slice(0, 600)}`);
  return parts.join('\n');
}

async function callGemini(env, body, fetchImpl, withSchema = true) {
  const model = await resolveModel(env, fetchImpl);
  const base = env.GEMINI_API_BASE || DEFAULT_API_BASE;
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: body.mime, data: body.image } }, { text: buildUserText(body) }] }],
    generationConfig: withSchema
      ? { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
      : { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  };
  if (!withSchema) payload.contents[0].parts.push({ text: `Réponds uniquement avec un objet JSON respectant ce schéma : ${JSON.stringify(RESPONSE_SCHEMA)}` });
  const res = await fetchImpl(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(payload),
  });
  if (res.status === 400 && withSchema) return callGemini(env, body, fetchImpl, false); // schéma non pris en charge par ce modèle
  if (!res.ok) throw upstreamError(res.status);
  const data = await res.json();
  if (data.promptFeedback && data.promptFeedback.blockReason) throw Object.assign(new Error('Photo refusée par le filtre du service d’IA.'), { status: 422 });
  const cand = (data.candidates || [])[0];
  const text = ((cand && cand.content && cand.content.parts) || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text) throw Object.assign(new Error(`Réponse vide du service d’IA${cand && cand.finishReason ? ` (${cand.finishReason})` : ''}.`), { status: 502 });
  let analysis;
  try {
    analysis = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw Object.assign(new Error('Réponse de l’IA illisible (JSON invalide).'), { status: 502 });
  }
  return { analysis, model, usage: data.usageMetadata || null };
}

export async function handle(request, env, fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  const url = new URL(request.url);
  if (!env.ACCESS_CODE || !env.GEMINI_API_KEY) return json({ ok: false, error: 'Relais mal configuré : ACCESS_CODE et GEMINI_API_KEY sont obligatoires.' }, 500, request, env);
  const auth = request.headers.get('Authorization') || '';
  if (!safeEqual(auth.replace(/^Bearer\s+/i, ''), env.ACCESS_CODE)) return json({ ok: false, error: 'Code d’accès incorrect.' }, 401, request, env);

  try {
    if (request.method === 'GET' && url.pathname.replace(/\/$/, '') === '/health') {
      const model = await resolveModel(env, fetchImpl);
      return json({ ok: true, provider: 'gemini', model }, 200, request, env);
    }
    if (request.method === 'POST' && url.pathname.replace(/\/$/, '') === '/analyze') {
      const len = Number(request.headers.get('Content-Length') || 0);
      if (len > MAX_IMAGE_BYTES * 1.4) return json({ ok: false, error: 'Photo trop lourde.' }, 413, request, env);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'Requête invalide.' }, 400, request, env); }
      if (!body || typeof body.image !== 'string' || !/^image\/(jpeg|png|webp)$/.test(body.mime || '')) return json({ ok: false, error: 'Image manquante ou format non pris en charge (JPEG, PNG, WebP).' }, 400, request, env);
      if (body.image.length > MAX_IMAGE_BYTES * 1.37) return json({ ok: false, error: 'Photo trop lourde.' }, 413, request, env);
      const r = await callGemini(env, body, fetchImpl);
      return json({ ok: true, provider: 'gemini', model: r.model, analysis: r.analysis, usage: r.usage }, 200, request, env);
    }
    return json({ ok: false, error: 'Adresse inconnue.' }, 404, request, env);
  } catch (e) {
    return json({ ok: false, error: e.message || 'Erreur du relais.' }, e.status || 500, request, env);
  }
}

export default { fetch: (request, env) => handle(request, env) };
