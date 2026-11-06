"""Extrait des fichiers USDA FoodData Central (JSON officiels) une table compacte.

Entrée : les archives JSON téléchargées depuis https://fdc.nal.usda.gov/download-datasets
(SR Legacy 2018-04, FNDDS 2024-10-31, Foundation Foods). Les données USDA sont
dans le domaine public (CC0 1.0).

Sortie : une ligne JSON par aliment {fdcId, dataset, name, category, n:{...}, portions:[...]},
valeurs pour 100 g. Les glucides USDA sont des glucides TOTAUX (fibres incluses) :
on les conserve tels quels ici (`carbsTotal`) ; la conversion en glucides
assimilables (comme Ciqual) est faite à l'étape de construction.

Usage : python -I extract_usda.py <dossier_usda> <sortie.jsonl>
"""
import json
import sys
from pathlib import Path

# Identifiants des nutriments FDC.
KCAL = (1008, 2047, 2048)  # Energy (kcal), Atwater général, Atwater spécifique
NUTR = {1003: 'protein', 1005: 'carbsTotal', 1004: 'fat', 1079: 'fiber', 2000: 'sugars', 1051: 'water', 1093: 'sodiumMg', 1258: 'satFat', 1018: 'alcohol'}


def nutrients(food):
    out, kcal = {}, {}
    for fn in food.get('foodNutrients', []):
        nid = fn.get('nutrient', {}).get('id')
        amt = fn.get('amount')
        if amt is None:
            continue
        if nid in KCAL and fn['nutrient'].get('unitName', '').lower() == 'kcal':
            kcal[nid] = amt
        elif nid in NUTR:
            out[NUTR[nid]] = amt
    for k in KCAL:
        if k in kcal:
            out['kcal'] = kcal[k]
            break
    return out


def portions(food):
    res = []
    for p in food.get('foodPortions', []):
        g = p.get('gramWeight')
        if not g:
            continue
        desc = p.get('portionDescription') or ' '.join(str(x) for x in (p.get('amount'), (p.get('measureUnit') or {}).get('name'), p.get('modifier')) if x and x != 'undetermined')
        res.append({'g': g, 'desc': desc.strip()})
    return res


def main(src, dst):
    src = Path(src)
    rows = 0
    with open(dst, 'w') as out:
        for path, key, ds in [
            (next(src.glob('*sr_legacy*/*.json')), 'SRLegacyFoods', 'sr'),
            (next(src.glob('*survey*/*.json')), 'SurveyFoods', 'fndds'),
            (next(src.glob('*foundation*/*.json')), 'FoundationFoods', 'foundation'),
        ]:
            data = json.load(open(path))[key]
            for f in data:
                cat = (f.get('foodCategory') or {}).get('description') or (f.get('wweiaFoodCategory') or {}).get('wweiaFoodCategoryDescription')
                row = {'fdcId': f['fdcId'], 'dataset': ds, 'name': f['description'], 'category': cat, 'n': nutrients(f), 'portions': portions(f)}
                out.write(json.dumps(row, ensure_ascii=False) + '\n')
                rows += 1
    print(rows, 'aliments extraits')


if __name__ == '__main__':
    main(*sys.argv[1:])
