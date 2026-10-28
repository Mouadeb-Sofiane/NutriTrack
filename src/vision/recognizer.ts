/**
 * Reconnaissance locale d'une photo de repas : tout se passe sur l'appareil.
 * Aucune photo n'est envoyée ; aucun coût par analyse.
 */
import { proposalsFromZones, scoreZones, zoneRects, type RecognitionResult } from '../domain/recognition';
import { estimatePlateMass, type MassModel, type MassRange } from '../domain/photoMass';
import massModel from './massModel.json';
import { loadModelFiles, type VisionManifest } from './modelStore';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

/** Fichiers du moteur à pré-télécharger pour un fonctionnement hors ligne. */
export const RUNTIME_URLS = [wasmUrl, mjsUrl];

interface Engine {
  worker: Worker;
  manifest: VisionManifest;
  labels: Float32Array;
  loadMs: number;
}

let engine: Promise<Engine> | null = null;

function call<T>(worker: Worker, msg: unknown, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent) => {
      worker.removeEventListener('message', onMsg);
      if (ev.data?.type === 'error') reject(new Error(ev.data.message));
      else resolve(ev.data as T);
    };
    worker.addEventListener('message', onMsg);
    worker.postMessage(msg, transfer);
  });
}

async function start(): Promise<Engine> {
  const files = await loadModelFiles();
  if (!files) throw new Error('Modèle non installé.');
  const worker = new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' });
  const r = await call<{ ms: number }>(worker, { type: 'load', model: files.model }, [files.model]);
  return { worker, manifest: files.manifest, labels: files.labels, loadMs: r.ms };
}

export function getEngine(): Promise<Engine> {
  if (!engine) engine = start().catch((e) => { engine = null; throw e; });
  return engine;
}

export function disposeEngine() {
  engine?.then((e) => e.worker.terminate()).catch(() => undefined);
  engine = null;
}

/** Image → tenseur NCHW normalisé (redimensionnement du petit côté à 224 puis recadrage central). */
async function pixelsFor(photo: Blob, m: VisionManifest, fast: boolean): Promise<{ data: Float32Array; count: number }> {
  const bmp = await createImageBitmap(photo);
  const size = m.input.size;
  const rects = zoneRects(bmp.width, bmp.height).slice(0, fast ? 1 : 5);
  const data = new Float32Array(rects.length * 3 * size * size);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  rects.forEach((r, i) => {
    const s = size / Math.min(r.w, r.h);
    const sw = size / s;
    const sx = r.x + (r.w - sw) / 2;
    const sy = r.y + (r.h - sw) / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bmp, sx, sy, sw, sw, 0, 0, size, size);
    const px = ctx.getImageData(0, 0, size, size).data;
    const plane = size * size;
    const base = i * 3 * plane;
    for (let k = 0; k < plane; k++) {
      data[base + k] = (px[k * 4] / 255 - m.input.mean[0]) / m.input.std[0];
      data[base + plane + k] = (px[k * 4 + 1] / 255 - m.input.mean[1]) / m.input.std[1];
      data[base + 2 * plane + k] = (px[k * 4 + 2] / 255 - m.input.mean[2]) / m.input.std[2];
    }
  });
  bmp.close();
  return { data, count: rects.length };
}

export interface LocalRecognition extends RecognitionResult {
  ms: number;
  zones: number;
  /** Poids estimé de l'assiette (normal / haut / bas), null si non calculable. */
  mass: MassRange | null;
}

/**
 * Analyse une photo. `fast` : image entière seulement (1 passage au lieu de 5), pour les
 * téléphones lents ; on repère alors moins bien plusieurs aliments sur la même photo.
 */
export async function recognize(photo: Blob, opts: { fast?: boolean } = {}): Promise<LocalRecognition> {
  const e = await getEngine();
  const t0 = performance.now();
  const { data, count } = await pixelsFor(photo, e.manifest, !!opts.fast);
  const r = await call<{ embeddings: Float32Array }>(e.worker, { type: 'embed', pixels: data, count, size: e.manifest.input.size }, [data.buffer]);
  const zones = scoreZones(r.embeddings, count, e.labels, e.manifest.labels.ids, e.manifest.logitScale);
  const mass = estimatePlateMass(r.embeddings, count, massModel as unknown as MassModel);
  return { ...proposalsFromZones(zones), ms: performance.now() - t0, zones: count, mass };
}
