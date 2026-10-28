"""
Entraîne l'estimateur de poids d'assiette (src/vision/massModel.json).

Données : Nutrition5k (Google, licence CC BY 4.0) — photos d'assiettes vues du dessus
et poids mesuré sur balance. Découpage officiel entraînement / test.
Méthode : vecteurs CLIP de l'application (image entière + moyenne des 4 zones) →
régression ridge sur log(masse). Estimations normale / haute / basse = prédiction +
quantiles 50 / 80 / 20 % des erreurs observées hors échantillon (validation croisée).

Usage : python tools/vision/train_mass.py <dossier_de_travail>
  (le dossier doit contenir ViT-B-32-laion2b-s34b-b79k/visual_int8.onnx, créé par build_model.py)
Dépendances : pip install onnxruntime numpy pillow
"""
import csv, json, os, sys, urllib.request, concurrent.futures as cf
import numpy as np, onnxruntime as ort
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = sys.argv[1]
N5K = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset'
DATA = os.path.join(WORK, 'nutrition5k'); os.makedirs(os.path.join(DATA, 'img'), exist_ok=True)

def get(path, dest):
    if not os.path.exists(dest):
        try: urllib.request.urlretrieve(f'{N5K}/{path}', dest)
        except Exception: return False
    return True

for f in ['metadata/dish_metadata_cafe1.csv', 'metadata/dish_metadata_cafe2.csv', 'dish_ids/splits/rgb_train_ids.txt', 'dish_ids/splits/rgb_test_ids.txt']:
    get(f, os.path.join(DATA, os.path.basename(f)))
train = set(open(os.path.join(DATA, 'rgb_train_ids.txt')).read().split())
test = set(open(os.path.join(DATA, 'rgb_test_ids.txt')).read().split())
meta = {}
for f in ['dish_metadata_cafe1.csv', 'dish_metadata_cafe2.csv']:
    for r in csv.reader(open(os.path.join(DATA, f))): meta[r[0]] = float(r[2])
ids = sorted((train | test) & set(meta))
with cf.ThreadPoolExecutor(32) as ex:
    ok = list(ex.map(lambda d: get(f'imagery/realsense_overhead/{d}/rgb.png', os.path.join(DATA, 'img', f'{d}.png')) and os.path.getsize(os.path.join(DATA, 'img', f'{d}.png')) > 10000, ids))
ids = [d for d, k in zip(ids, ok) if k and meta[d] > 0]
print(len(ids), 'assiettes avec photo et poids')

man = json.load(open(os.path.join(ROOT, 'public/models/food-clip-v1/manifest.json')))
MEAN, STD = np.array(man['input']['mean'], np.float32), np.array(man['input']['std'], np.float32)
vis = ort.InferenceSession(os.path.join(WORK, 'ViT-B-32-laion2b-s34b-b79k', 'visual_int8.onnx'), providers=['CPUExecutionProvider'])
def prep(img):
    w, h = img.size; s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size; l, t = (w - 224) // 2, (h - 224) // 2
    return ((np.asarray(img.crop((l, t, l + 224, t + 224)), np.float32) / 255 - MEAN) / STD).transpose(2, 0, 1)
def zones(img):
    w, h = img.size; cw, ch = round(w * .6), round(h * .6)
    return [img] + [img.crop((x, y, x + cw, y + ch)) for x, y in [(0, 0), (w - cw, 0), (0, h - ch), (w - cw, h - ch)]]
X, m, is_test = [], [], []
for d in ids:
    e = vis.run(None, {'pixel_values': np.stack([prep(z) for z in zones(Image.open(os.path.join(DATA, 'img', f'{d}.png')).convert('RGB'))])})[0]
    e /= np.linalg.norm(e, axis=1, keepdims=True); X.append(np.concatenate([e[0], e[1:].mean(0)])); m.append(meta[d]); is_test.append(d in test)
X, m, te = np.array(X), np.array(m), np.array(is_test); tr = ~te; y = np.log(m); ALPHA = 0.3

def ridge(A, b):
    mu = A.mean(0); Ac = A - mu; bm = b.mean()
    return np.linalg.solve(Ac.T @ Ac + ALPHA * np.eye(A.shape[1]), Ac.T @ (b - bm)), mu, bm
rng = np.random.default_rng(0); oof = np.zeros(len(y)); idx = np.where(tr)[0]
for f in np.array_split(rng.permutation(idx), 5):
    msk = tr.copy(); msk[f] = False; w, mu, bm = ridge(X[msk], y[msk]); oof[f] = (X[f] - mu) @ w + bm
r = y[tr] - oof[tr]; q = {k: float(np.quantile(r, p)) for k, p in [('low', .2), ('normal', .5), ('high', .8)]}
w, mu, bm = ridge(X[tr], y[tr]); p = (X[te] - mu) @ w + bm
normal, high, low = np.exp(p + q['normal']), np.exp(p + q['high']), np.exp(p + q['low']); mt = m[te]; ae = np.abs(normal - mt)
test = {'plates': int(te.sum()), 'maeGrams': round(float(ae.mean()), 1), 'medianRelError': round(float(np.median(ae / mt)), 3),
        'highCoverage': round(float(np.mean(mt <= high)), 3), 'rangeCoverage': round(float(np.mean((mt >= low) & (mt <= high))), 3)}
print('test :', test)
json.dump({'id': 'food-clip-v1-mass-1', 'embedding': 'food-clip-v1', 'features': 'image entière (512) + moyenne des 4 zones (512)', 'target': 'log(masse en g)',
           'w': [round(float(x), 6) for x in w], 'mu': [round(float(x), 6) for x in mu], 'bias': float(bm), 'quantiles': q,
           'trainedOn': f'Nutrition5k (Google, CC BY 4.0), photos vues du dessus, {int(tr.sum())} assiettes d’entraînement', 'test': test},
          open(os.path.join(ROOT, 'src/vision/massModel.json'), 'w'))
