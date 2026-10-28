"""
Évaluation de la reconnaissance sur de vraies photos (Open Images, licence CC BY 2.0).

Usage : python tools/vision/evaluate.py <dossier_de_travail> <testset.json> <dossier_photos> <ok.json>
  testset.json : { "ImageID": ["Pizza", ...] }  (classes Open Images présentes, vérifiées par des humains)
  ok.json      : { "Pizza": ["pizza"], ... }    (libellés NutriTrack acceptés pour chaque classe)
Reproduit exactement la règle de l'application (src/domain/recognition.ts) :
image entière + 4 quarts ; top-3 de l'image entière + top-2 de chaque quart au-delà de 20 %.
"""
import json, os, sys, numpy as np, onnxruntime as ort
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK, TEST, PHOTOS, OKF = sys.argv[1:5]
man = json.load(open(os.path.join(ROOT, 'public/models/food-clip-v1/manifest.json')))
ids = man['labels']['ids']
L = np.fromfile(os.path.join(ROOT, 'public/models/food-clip-v1/labels.f32'), '<f4').reshape(len(ids), -1)
vis = ort.InferenceSession(os.path.join(WORK, 'ViT-B-32-laion2b-s34b-b79k', 'visual_int8.onnx'), providers=['CPUExecutionProvider'])
MEAN, STD = np.array(man['input']['mean'], np.float32), np.array(man['input']['std'], np.float32)

def prep(img):
    w, h = img.size; s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size; l, t = (w - 224) // 2, (h - 224) // 2
    return ((np.asarray(img.crop((l, t, l + 224, t + 224)), np.float32) / 255 - MEAN) / STD).transpose(2, 0, 1)

def zones(img):
    w, h = img.size; cw, ch = round(w * .6), round(h * .6)
    return [img] + [img.crop((x, y, x + cw, y + ch)) for x, y in [(0, 0), (w - cw, 0), (0, h - ch), (w - cw, h - ch)]]

test, OK = json.load(open(TEST)), json.load(open(OKF))
t1 = t3 = tl = 0
for i, gt in test.items():
    img = Image.open(os.path.join(PHOTOS, f'{i}.jpg')).convert('RGB')
    E = vis.run(None, {'pixel_values': np.stack([prep(z) for z in zones(img)])})[0]
    E /= np.linalg.norm(E, axis=1, keepdims=True)
    lg = man['logitScale'] * E @ L.T; P = np.exp(lg - lg.max(1, keepdims=True)); P /= P.sum(1, keepdims=True)
    top = lambda z, k: [ids[j] for j in np.argsort(-P[z]) if ids[j] != 'not-food'][:k]
    props = list(dict.fromkeys(top(0, 3) + [x for z in range(1, 5) for x in top(z, 2) if P[z][ids.index(x)] > .2]))
    good = {x for c in gt for x in OK[c]}
    t1 += props[0] in good; t3 += any(p in good for p in props[:3]); tl += any(p in good for p in props)
n = len(test)
print(f'{n} photos : 1re proposition {t1/n:.1%} · 3 premières {t3/n:.1%} · liste complète {tl/n:.1%}')
