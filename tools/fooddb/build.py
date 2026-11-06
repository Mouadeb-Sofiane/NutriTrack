"""Construit la base alimentaire embarquée de NutriTrack.

Entrées :
  - la table compacte produite par extract_usda.py (USDA FoodData Central, domaine public CC0) ;
  - les noms français de tools/fooddb/fr/*.txt (« fdcId|Nom français »), traduits pour
    NutriTrack. Seuls les aliments traduits sont retenus : cette liste sert aussi de sélection
    (aliments pour nourrissons, marques locales, gibier exotique… écartés) ;
  - (plus tard) la table Ciqual de l'ANSES, licence ouverte Etalab 2.0, lorsqu'elle sera
    téléchargeable (site en maintenance au moment de l'écriture).

Sortie : src/data/fooddb/usda.json — tableau compact chargé à la demande par l'application.

Choix et conversions (documentés dans docs/base-alimentaire.md) :
  - valeurs pour 100 g, telles que publiées ;
  - glucides : l'USDA publie des glucides TOTAUX (fibres incluses) ; NutriTrack, comme Ciqual,
    affiche des glucides assimilables : glucides = glucides totaux − fibres (si fibres connues) ;
  - boissons : l'USDA publie pour 100 g ; elles sont exprimées pour 100 ml en supposant une
    densité de 1 (écart ≤ 3-4 % pour le lait ou les jus, négligeable pour l'eau, le café, le thé) ;
  - une valeur absente reste absente (null), jamais remplacée par 0 ;
  - doublons de nom : la première occurrence est gardée (SR Legacy avant FNDDS).

Usage : python -I build.py <usda.jsonl> <sortie.json>
        python -I build.py dishes <usda.json> <dishes.txt> <dishes.json>
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent

DATASETS = {
    'sr': 'USDA FoodData Central, SR Legacy (avril 2018)',
    'fndds': 'USDA FoodData Central, FNDDS 2021-2023 (publié le 31/10/2024)',
}

# Catégorie USDA → (catégorie NutriTrack, type).
SR_CAT = {
    'Vegetables and Vegetable Products': ('Légumes', 'food'),
    'Fruits and Fruit Juices': ('Fruits', 'food'),
    'Legumes and Legume Products': ('Légumineuses', 'food'),
    'Nut and Seed Products': ('Fruits à coque et graines', 'food'),
    'Spices and Herbs': ('Épices et condiments', 'food'),
    'Fats and Oils': ('Matières grasses', 'food'),
    'Cereal Grains and Pasta': ('Féculents', 'food'),
    'Finfish and Shellfish Products': ('Poissons et fruits de mer', 'food'),
    'Lamb, Veal, and Game Products': ('Viandes', 'food'),
    'Dairy and Egg Products': ('Produits laitiers et œufs', 'food'),
    'Poultry Products': ('Volailles', 'food'),
    'Pork Products': ('Viandes', 'food'),
    'Beef Products': ('Viandes', 'food'),
}

# Pour FNDDS (catégories WWEIA) : motifs → (catégorie, type).
FN_RULES = [
    (r'coffee|tea$|^tea|soft drink|water|juice|nectar|drink|beer|wine|liquor|cocktail|milk shake|smoothie|plant-based milk|flavored milk|^milk|energy', ('Boissons', 'drink')),
    (r'sandwich|burger|frankfurter sandwich|burrito|taco|pizza|nachos|mexican|mixed dish|stir-fry|fried rice|egg rolls|soup|ramen|macaroni and cheese|turnovers|vegetable dishes|bean, pea, legume dishes|coleslaw|lettuce|salad', ('Plats et recettes', 'dish')),
    (r'cake|cookie|doughnut|pastr|candy|ice cream|pudding|gelatin|jams|sugar|cereal bar|nutrition bar|sweet', ('Sucré', 'food')),
    (r'chips|pretzel|popcorn|cracker|snack', ('Snacks et apéritif', 'food')),
    (r'bread|roll|bagel|biscuit|muffin|tortilla|pancake', ('Pains et viennoiseries', 'food')),
    (r'rice|pasta|grits|oatmeal|cereal|potato', ('Féculents', 'food')),
    (r'cheese|yogurt|cream|egg|omelet', ('Produits laitiers et œufs', 'food')),
    (r'chicken|turkey|poultry', ('Volailles', 'food')),
    (r'fish|shellfish', ('Poissons et fruits de mer', 'food')),
    (r'beef|pork|lamb|meat|bacon|sausage|liver|cold cuts|frankfurter', ('Viandes', 'food')),
    (r'bean|legume|nuts|seeds|soy', ('Légumineuses', 'food')),
    (r'fruit|apple|banana|berries|citrus|grape|mango|melon|peach|pear|pineapple|strawberr', ('Fruits', 'food')),
    (r'vegetable|broccoli|cabbage|carrot|corn|onion|spinach|tomato|string beans|green|olives|pickle', ('Légumes', 'food')),
    (r'butter|margarine|oil|dressing|mayonnaise', ('Matières grasses', 'food')),
    (r'condiment|sauce|dip|gravy|salsa|ketchup|mustard|substitute', ('Épices et condiments', 'food')),
]

# Mesures ménagères USDA → libellé français. Les mesures américaines en onces sont ignorées.
PORTIONS = [
    (r'^quantity not specified', '1 portion moyenne'),
    (r'^1 cup\b', '1 tasse (≈ 240 ml)'),
    (r'^1/2 cup\b', '1/2 tasse (≈ 120 ml)'),
    (r'^1 baguette\b', '1 baguette entière'),
    (r'^1 stalk\b', '1 tige'),
    (r'^1 tbsp\b|^1 tablespoon\b', '1 c. à soupe'),
    (r'^1 tsp\b|^1 teaspoon\b', '1 c. à café'),
    (r'^1 slice\b|^1 medium or regular slice', '1 tranche'),
    (r'^1 large or thick slice', '1 grande tranche'),
    (r'^1 small or thin', '1 tranche fine'),
    (r'^1 piece\b', '1 morceau'),
    (r'^1 small\b', '1 petit(e)'),
    (r'^1 medium\b', '1 moyen(ne)'),
    (r'^1 large\b', '1 gros(se)'),
    (r'^1 fillet\b', '1 filet'),
    (r'^1 steak\b', '1 steak'),
    (r'^1 chop\b', '1 côte'),
    (r'^1 sandwich\b', '1 sandwich'),
    (r'^1 burrito\b', '1 burrito'),
    (r'^1 taco\b', '1 taco'),
    (r'^1 egg\b', '1 œuf'),
    (r'^1 bar\b', '1 barre'),
    (r'^1 cookie\b', '1 biscuit'),
    (r'^1 cracker\b', '1 cracker'),
    (r'^1 scoop\b', '1 boule'),
    (r'^1 can\b', '1 canette ou boîte'),
    (r'^1 bottle\b', '1 bouteille'),
    (r'^1 container\b|^1 individual container', '1 pot'),
    (r'^1 serving\b|^1 nlea serving', '1 portion'),
    (r'^1 (avocado|banana|apple|orange|pear|peach|nectarine|kiwi|plum|tomato|potato|carrot|onion|mango|grapefruit|lemon|lime|tangerine|clementine|pepper|zucchini|cucumber|eggplant)\b', '1 pièce'),
    (r'^1 drink\b', '1 verre'),
    (r'^1 regular\b', '1 portion normale'),
    (r'^1 roll\b', '1 rouleau'),
    (r'^1 wing\b', '1 aile'),
    (r'^1 drumstick\b', '1 pilon'),
    (r'^1 thigh\b', '1 haut de cuisse'),
    (r'^1 breast\b', '1 blanc'),
    (r'^1 leg\b', '1 cuisse'),
    (r'^1 patty\b', '1 galette'),
    (r'^1 link\b', '1 saucisse'),
    (r'^1 muffin\b', '1 muffin'),
    (r'^1 pancake\b', '1 pancake'),
    (r'^1 waffle\b', '1 gaufre'),
    (r'^1 bagel\b', '1 bagel'),
    (r'^1 doughnut\b', '1 beignet'),
    (r'^1 fruit\b', '1 fruit'),
    (r'^1 nugget\b', '1 nugget'),
]


def fr_portions(portions, liquid):
    out, seen = [], set()
    for p in portions:
        d = re.sub(r'^1\.0\b', '1', p['desc'].lower().strip())
        d = re.sub(r'^0\.5 cup', '1/2 cup', d)
        # Portions ambiguës (croûte retirée, format miniature…) : ignorées plutôt que mal étiquetées.
        if re.search(r'crust|mini|bite.size|snack.size|nfs$|cubic inch|surface inch', d):
            continue
        for pat, label in PORTIONS:
            if re.search(pat, d):
                if label.startswith('1 tasse') and re.search(r'cubes|crumbs|pieces|slices|chopped|diced|sliced|shredded|halves|cubed', d):
                    label = '1 tasse de morceaux (≈ 240 ml)'
                g = round(p['g'], 1)
                if label in seen or g <= 0:
                    break
                seen.add(label)
                out.append([label, g])
                break
        if len(out) >= 5:
            break
    return out


def classify(row):
    if row['dataset'] == 'sr':
        cat, kind = SR_CAT.get(row['category'], ('Divers', 'food'))
        if cat == 'Fruits' and re.search(r'juice|nectar', row['name'], re.I):
            return 'Boissons', 'drink'
        return cat, kind
    c = (row['category'] or '').lower()
    for pat, res in FN_RULES:
        if re.search(pat, c):
            return res
    return 'Divers', 'food'


def r1(x):
    return None if x is None else round(x, 1)


def main(src, dst):
    names = {}
    for f in sorted((HERE / 'fr').glob('b*.txt')):
        for line in f.read_text(encoding='utf-8').splitlines():
            if '|' in line:
                i, n = line.split('|', 1)
                names[int(i)] = n.strip()
    rows = {}
    for line in open(src, encoding='utf-8'):
        r = json.loads(line)
        if r['fdcId'] in names:
            rows[r['fdcId']] = r
    out, seen = [], set()
    order = sorted(rows.values(), key=lambda r: (r['dataset'] != 'sr', r['fdcId']))
    skipped = 0
    for r in order:
        name = names[r['fdcId']]
        key = name.lower()
        n = r['n']
        if key in seen or n.get('kcal') is None:
            skipped += 1
            continue
        seen.add(key)
        cat, kind = classify(r)
        fiber = n.get('fiber')
        carbs = n.get('carbsTotal')
        if carbs is not None and fiber is not None:
            carbs = max(0.0, carbs - fiber)
        basis = 'ml' if kind == 'drink' else 'g'
        out.append([
            r['fdcId'], name, cat, kind, basis, 'sr' if r['dataset'] == 'sr' else 'fn',
            r1(n.get('kcal')), r1(n.get('protein')), r1(carbs), r1(n.get('fat')), r1(fiber), r1(n.get('sugars')),
            fr_portions(r['portions'], basis == 'ml'),
            r['name'],
        ])
    meta = {
        'format': 'NutriTrack fooddb v1',
        'columns': ['fdcId', 'nom', 'categorie', 'type', 'base', 'jeu', 'kcal', 'proteines', 'glucides', 'lipides', 'fibres', 'sucres', 'portions', 'nomOriginal'],
        'sources': DATASETS,
        'licence': 'Données USDA FoodData Central : domaine public (CC0 1.0). Noms français : traduction NutriTrack.',
        'notes': [
            'Valeurs pour 100 g (100 ml pour les boissons, densité supposée égale à 1).',
            'Glucides assimilables = glucides totaux USDA − fibres.',
        ],
    }
    Path(dst).write_text(json.dumps({'meta': meta, 'foods': out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    kinds = {}
    for f in out:
        kinds[f[3]] = kinds.get(f[3], 0) + 1
    print(f'{len(out)} aliments écrits ({skipped} doublons ou sans énergie écartés) ; types : {kinds}')


def build_dishes(foods_json, dishes_txt, dst):
    """Plats composés : chaque ingrédient est résolu dans la base (nom exact) et porte ses
    valeurs pour 100 g ; les valeurs du plat sont recalculées par l'application."""
    rows = {f[1]: f for f in json.loads(Path(foods_json).read_text(encoding='utf-8'))['foods']}
    dishes, region_group, errors = [], None, []
    cur = None
    for raw in Path(dishes_txt).read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or (line.startswith('#') and not line.startswith('##')):
            continue
        if line.startswith('==='):
            region_group = line[3:].strip()
        elif line.startswith('##'):
            parts = [p.strip() for p in line[2:].split('|')]
            cur = {'id': parts[0], 'name': parts[1], 'region': parts[2], 'group': region_group,
                   'synonyms': parts[3] if len(parts) > 3 else '', 'notes': [], 'ingredients': []}
            dishes.append(cur)
        elif line.startswith('>'):
            cur['notes'].append(line[1:].strip())
        elif line.startswith('-'):
            body = line[1:].strip()
            m = re.match(r'^(?:(.+?) = )?(.+?) : ([\d.]+)((?: (?:opt|#\w+))*)$', body)
            if not m:
                errors.append(f'{cur["id"]} : ligne illisible « {body} »')
                continue
            label, dbname, grams, flags = m.groups()
            row = rows.get(dbname)
            if not row:
                errors.append(f'{cur["id"]} : ingrédient inconnu « {dbname} »')
                continue
            flags = flags.split()
            cur['ingredients'].append({
                'label': label or dbname, 'foodId': f'us:{row[0]}', 'food': row[1], 'basis': row[4],
                'g': float(grams), 'per100': row[6:12],
                'optional': 'opt' in flags,
                'group': next((f[1:] for f in flags if f.startswith('#')), None),
            })
    if errors:
        raise SystemExit('Erreurs dans dishes.txt :\n  ' + '\n  '.join(errors))
    Path(dst).write_text(json.dumps({'meta': {'format': 'NutriTrack dishes v1', 'source': 'Compositions types NutriTrack ; valeurs des ingrédients : USDA FoodData Central (CC0).'}, 'dishes': dishes}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(dishes)} plats composés écrits')


if __name__ == '__main__':
    if sys.argv[1] == 'dishes':
        build_dishes(*sys.argv[2:])
    else:
        main(*sys.argv[1:])
