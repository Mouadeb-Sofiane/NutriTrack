/**
 * Téléchargement unique et stockage local du modèle de reconnaissance.
 *
 * Les fichiers sont servis par l'application elle-même (dossier public/models, hébergé
 * avec le site) : aucun service tiers, aucun compte, aucun quota. Chaque morceau est
 * vérifié (SHA-256) avant d'être gardé dans le cache du navigateur (Cache Storage).
 */
const CACHE = 'nutritrack-vision-v1';
export const MODEL_DIR = 'models/food-clip-v1/';
const MODEL_KEY = `${MODEL_DIR}model.onnx`;
const LABELS_KEY = `${MODEL_DIR}labels.f32`;
const MANIFEST_KEY = `${MODEL_DIR}manifest.json`;

export interface VisionManifest {
  id: string;
  version: number;
  model: string;
  license: string;
  source: string;
  input: { size: number; mean: number[]; std: number[] };
  logitScale: number;
  embeddingSize: number;
  size: number;
  sha256: string;
  parts: { path: string; size: number; sha256: string }[];
  labels: { path: string; ids: string[]; sha256: string };
}

export interface ModelFiles {
  manifest: VisionManifest;
  model: ArrayBuffer;
  labels: Float32Array;
}

function url(path: string): string {
  return new URL(path, document.baseURI).toString();
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function cacheSupported(): boolean {
  return typeof caches !== 'undefined' && typeof crypto?.subtle !== 'undefined';
}

export async function fetchManifest(): Promise<VisionManifest> {
  const r = await fetch(url(`${MODEL_DIR}manifest.json`), { cache: 'no-cache' });
  if (!r.ok) throw new Error('Manifeste du modèle introuvable.');
  return r.json();
}

export async function installedManifest(): Promise<VisionManifest | null> {
  if (!cacheSupported()) return null;
  const c = await caches.open(CACHE);
  const [m, model, labels] = await Promise.all([c.match(url(MANIFEST_KEY)), c.match(url(MODEL_KEY)), c.match(url(LABELS_KEY))]);
  if (!m || !model || !labels) return null;
  return m.json();
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

async function readWithProgress(res: Response, onChunk: (n: number) => void): Promise<ArrayBuffer> {
  if (!res.body) {
    const b = await res.arrayBuffer();
    onChunk(b.byteLength);
    return b;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    onChunk(value.byteLength);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out.buffer;
}

/** Télécharge, vérifie et stocke le modèle. Peut être relancé : rien n'est gardé si une vérification échoue. */
export async function downloadModel(onProgress: (p: DownloadProgress) => void, signal?: AbortSignal, warmUp: string[] = []): Promise<VisionManifest> {
  if (!cacheSupported()) throw new Error('Ce navigateur ne permet pas de stocker le modèle.');
  const manifest = await fetchManifest();
  const total = manifest.size + 170_000; // modèle + libellés
  let loaded = 0;
  const tick = (n: number) => { loaded += n; onProgress({ loaded: Math.min(loaded, total), total }); };
  const parts: ArrayBuffer[] = [];
  for (const p of manifest.parts) {
    const res = await fetch(url(`${MODEL_DIR}${p.path}`), { signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`Téléchargement interrompu (${res.status}).`);
    const buf = await readWithProgress(res, tick);
    if (buf.byteLength !== p.size || (await sha256(buf)) !== p.sha256) throw new Error('Fichier du modèle corrompu : réessaie le téléchargement.');
    parts.push(buf);
  }
  const labelsRes = await fetch(url(`${MODEL_DIR}${manifest.labels.path}`), { signal, cache: 'no-cache' });
  const labelsBuf = await labelsRes.arrayBuffer();
  if ((await sha256(labelsBuf)) !== manifest.labels.sha256) throw new Error('Libellés du modèle corrompus : réessaie.');
  // Le moteur d'exécution (WebAssembly) est mis en cache par le service worker au premier usage ;
  // on le télécharge maintenant pour que la reconnaissance fonctionne ensuite hors ligne.
  for (const u of warmUp) await fetch(u, { signal }).catch(() => undefined);
  const model = new Blob(parts, { type: 'application/octet-stream' });
  const c = await caches.open(CACHE);
  await c.put(url(MODEL_KEY), new Response(model));
  await c.put(url(LABELS_KEY), new Response(labelsBuf));
  await c.put(url(MANIFEST_KEY), new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
  onProgress({ loaded: total, total });
  try { await navigator.storage?.persist?.(); } catch { /* facultatif */ }
  return manifest;
}

export async function loadModelFiles(): Promise<ModelFiles | null> {
  if (!cacheSupported()) return null;
  const c = await caches.open(CACHE);
  const [m, model, labels] = await Promise.all([c.match(url(MANIFEST_KEY)), c.match(url(MODEL_KEY)), c.match(url(LABELS_KEY))]);
  if (!m || !model || !labels) return null;
  return { manifest: await m.json(), model: await model.arrayBuffer(), labels: new Float32Array(await labels.arrayBuffer()) };
}

export async function deleteModel(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(CACHE);
}

/** Compatibilité de l'appareil : indicative, la vraie preuve est un premier essai. */
export function deviceCheck(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let ok = true;
  if (typeof WebAssembly !== 'object') { ok = false; warnings.push('WebAssembly indisponible sur ce navigateur.'); }
  if (!cacheSupported()) { ok = false; warnings.push('Stockage local des fichiers indisponible (navigation privée ?).'); }
  if (typeof Worker === 'undefined') { ok = false; warnings.push('Calcul en arrière-plan indisponible.'); }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem != null && mem < 3) warnings.push(`Mémoire limitée (${mem} Go annoncés) : l’analyse peut échouer ou être lente.`);
  return { ok, warnings };
}
