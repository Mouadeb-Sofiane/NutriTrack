"""
Prépare le modèle de reconnaissance locale de NutriTrack (exécuté une fois, sur ordinateur).

Modèle : OpenCLIP ViT-B/32 entraîné sur LAION-2B (laion2b_s34b_b79k), licence MIT,
conversion ONNX publiée par le projet open source Jina « clip-as-service ».

Étapes :
1. télécharge l'encodeur d'image et l'encodeur de texte ONNX (une seule fois) ;
2. calcule les vecteurs des libellés de src/domain/foodLabels.json (encodeur de texte) ;
3. quantifie l'encodeur d'image en entiers 8 bits (≈ 96 Mo au lieu de 351 Mo) ;
4. découpe le fichier en morceaux de 24 Mo pour l'hébergement statique (GitHub Pages) ;
5. écrit public/models/food-clip-v1/manifest.json (tailles + empreintes SHA-256).

Dépendances : pip install onnxruntime onnx numpy pillow ftfy regex
              pip install --no-deps open_clip_torch   (pour le tokenizer uniquement)
Usage : python tools/vision/build_model.py <dossier_de_travail>
"""
import hashlib, json, os, sys, types, importlib.util, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = sys.argv[1] if len(sys.argv) > 1 else 'vision-work'
MODEL = 'ViT-B-32-laion2b-s34b-b79k'
SOURCE = f'https://clip-as-service.s3.us-east-2.amazonaws.com/models-436c69702d61732d53657276696365/onnx/{MODEL}'
OUT = os.path.join(ROOT, 'public', 'models', 'food-clip-v1')
CHUNK = 24 * 1024 * 1024

def fetch(name):
    path = os.path.join(WORK, MODEL, name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print('Téléchargement', name, '…'); urllib.request.urlretrieve(f'{SOURCE}/{name}', path)
    return path

def load_tokenizer():
    import site
    for base in site.getsitepackages():
        p = os.path.join(base, 'open_clip', 'tokenizer.py')
        if os.path.exists(p):
            _t = types.ModuleType('torch'); _t.LongTensor = _t.Tensor = object; sys.modules['torch'] = _t
            spec = importlib.util.spec_from_file_location('oc_tok', p); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
            return m.SimpleTokenizer()
    raise SystemExit('open_clip_torch introuvable : pip install --no-deps open_clip_torch')

def main():
    import onnxruntime as ort
    from onnxruntime.quantization import quantize_dynamic, QuantType
    from onnxruntime.quantization.shape_inference import quant_pre_process
    labels = json.load(open(os.path.join(ROOT, 'src', 'domain', 'foodLabels.json')))
    T = load_tokenizer(); sot, eot = T.encoder['<start_of_text>'], T.encoder['<end_of_text>']
    text = ort.InferenceSession(fetch('textual.onnx'), providers=['CPUExecutionProvider'])
    ids, vecs = [], []
    for lab in labels['labels'] + labels['background']:
        texts = [tpl.format(p) for p in lab['prompts'] for tpl in labels['templates']]
        tok = np.zeros((len(texts), 77), np.int32)
        for i, t in enumerate(texts):
            x = [sot] + T.encode(t)[:75] + [eot]; tok[i, :len(x)] = x
        e = text.run(None, {'input_ids': tok, 'attention_mask': (tok > 0).astype(np.int32)})[0]
        e = e / np.linalg.norm(e, axis=1, keepdims=True); m = e.mean(0)
        ids.append(lab['id']); vecs.append(m / np.linalg.norm(m))
    os.makedirs(OUT, exist_ok=True)
    np.stack(vecs).astype('<f4').tofile(os.path.join(OUT, 'labels.f32'))

    q = os.path.join(WORK, MODEL, 'visual_int8.onnx')
    if not os.path.exists(q):
        pre = os.path.join(WORK, MODEL, 'visual_pre.onnx')
        quant_pre_process(fetch('visual.onnx'), pre, skip_symbolic_shape=True)
        quantize_dynamic(pre, q, weight_type=QuantType.QUInt8, op_types_to_quantize=['MatMul', 'Gemm'])
    data = open(q, 'rb').read()
    for f in os.listdir(OUT):
        if f.startswith('part-'): os.remove(os.path.join(OUT, f))
    parts = []
    for i in range(0, len(data), CHUNK):
        name = f'part-{i // CHUNK:02d}.bin'; chunk = data[i:i + CHUNK]
        open(os.path.join(OUT, name), 'wb').write(chunk)
        parts.append({'path': name, 'size': len(chunk), 'sha256': hashlib.sha256(chunk).hexdigest()})
    lab_bytes = open(os.path.join(OUT, 'labels.f32'), 'rb').read()
    manifest = {
        'id': 'food-clip-v1', 'version': 1,
        'model': 'OpenCLIP ViT-B/32 laion2b_s34b_b79k (encodeur d’image, quantifié int8)',
        'license': 'MIT (OpenCLIP)', 'source': SOURCE,
        'input': {'size': 224, 'mean': [0.48145466, 0.4578275, 0.40821073], 'std': [0.26862954, 0.26130258, 0.27577711]},
        'logitScale': 100, 'embeddingSize': 512,
        'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts,
        'labels': {'path': 'labels.f32', 'ids': ids, 'sha256': hashlib.sha256(lab_bytes).hexdigest()},
    }
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'OK : {len(parts)} morceaux, {len(data) / 1e6:.1f} Mo, {len(ids)} libellés → {OUT}')

if __name__ == '__main__':
    main()
