/// <reference lib="webworker" />
/**
 * Calcul du modèle en arrière-plan (ne bloque pas l'interface).
 * Moteur : ONNX Runtime Web (licence MIT), en WebAssembly sur le processeur du téléphone.
 */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
// Sans isolation d'origine (cas de GitHub Pages), un seul fil d'exécution est possible.
ort.env.wasm.numThreads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let session: ort.InferenceSession | null = null;

type Msg =
  | { type: 'load'; model: ArrayBuffer }
  | { type: 'embed'; pixels: Float32Array; count: number; size: number };

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      const t0 = performance.now();
      session = await ort.InferenceSession.create(new Uint8Array(m.model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      self.postMessage({ type: 'loaded', ms: performance.now() - t0 });
    } else if (m.type === 'embed') {
      if (!session) throw new Error('Modèle non chargé.');
      const t0 = performance.now();
      const input = new ort.Tensor('float32', m.pixels, [m.count, 3, m.size, m.size]);
      const out = await session.run({ [session.inputNames[0]]: input });
      const emb = out[session.outputNames[0]].data as Float32Array;
      self.postMessage({ type: 'embedded', embeddings: emb, ms: performance.now() - t0 }, [emb.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: (e as Error).message || String(e) });
  }
};
