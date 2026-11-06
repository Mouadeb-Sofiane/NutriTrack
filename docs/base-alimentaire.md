# Base alimentaire de NutriTrack

Tout fonctionne **hors ligne et sans frais** : la base est intégrée à l'application (≈ 220 ko compressés, chargée à la première recherche puis gardée en cache).

## Ce qu'elle contient

| Partie | Nombre | Origine | Statut affiché |
|---|---|---|---|
| Aliments et préparations (crus, cuits, bouillis, vapeur, rôtis, frits, panés, en conserve, égouttés, avec ou sans peau, avec ou sans matière grasse…) | **7 197** | USDA FoodData Central (SR Legacy 2018 et FNDDS 2021-2023), noms traduits en français | Table officielle (« vérifié ») |
| dont plats et sandwichs « tels que consommés » | 1 633 | USDA FNDDS | Table officielle |
| dont boissons (café, thé, laits, jus, sodas, boissons végétales, alcools…) | 566 | USDA | Table officielle |
| **Plats composés du monde** (Maghreb, Afrique de l'Ouest et centrale, Europe, Moyen-Orient, Asie, Amériques, Caraïbes, plats familiaux français, petits-déjeuners et boissons préparées) | **194** | Composition type NutriTrack, calculée avec les ingrédients USDA | **Estimation** (moyenne + haute) |
| Table de référence historique (aliments courants) | ~120 | Valeurs moyennes arrondies (ordre de grandeur Ciqual/USDA) | Indicatif |
| Snacks, fête foraine, fast-food | ~49 | Catalogue NutriTrack | Estimation |
| Produits de marque | à la demande | Open Food Facts (en ligne, nom ou code-barres) | Données collaboratives |

Chaque aliment garde : nom, nom d'origine (cherchable : « pad thai », « pho »…), catégorie, type (aliment, plat, boisson, produit), kcal, protéines, glucides, lipides, fibres et sucres quand ils existent, portions ménagères (tasse, cuillère, tranche, pièce, portion moyenne USDA…), source avec version et lien vers la fiche officielle.

## Plats composés : comment c'est calculé

Un plat composé est une **liste d'ingrédients avec leurs grammes pour une portion** (fichier `tools/fooddb/dishes.txt`). Les calories et macros sont **toujours recalculées à partir des ingrédients** : modifier une quantité, retirer ou ajouter un ingrédient, changer la portion recalcule tout immédiatement. Le scénario haut suppose une portion plus copieuse (+25 %) et une matière grasse de cuisson plus généreuse (×1,75).

Exemple du **bouzelouf** : il n'existe pas de fiche officielle « tête de mouton ». La fiche indique donc clairement l'hypothèse : joues et viande de tête assimilées à de l'agneau cuit (maigre et gras), langue et cervelle avec leurs propres valeurs (abats d'agneau USDA). L'utilisateur coche les parties réellement mangées (la cervelle est bien plus grasse que les joues), ajuste les quantités, ajoute ses ingrédients. Les autres plats peu documentés (ndolé, eru, pondu, attiéké, ackee…) suivent le même principe, avec l'hypothèse écrite sur la fiche.

Si un plat est absent : la recherche propose **« Composer ce plat avec ses ingrédients »**.

## Conversions appliquées (documentées, jamais cachées)

- Valeurs pour 100 g telles que publiées par l'USDA.
- **Glucides** : l'USDA publie les glucides totaux (fibres incluses). NutriTrack affiche, comme Ciqual, les glucides assimilables : glucides = glucides totaux − fibres, quand les fibres sont connues.
- **Boissons** : publiées pour 100 g, affichées pour 100 ml avec une densité supposée de 1 (écart de 3 à 4 % au plus pour un lait ou un jus).
- Une valeur absente reste absente : elle est signalée, jamais remplacée par 0 ou inventée.
- Doublons de nom : une seule fiche gardée.
- Les **noms français** ont été traduits pour NutriTrack (avec l'aide d'une IA, relus par lots). Une erreur de traduction est possible : le nom d'origine reste visible dans la source.

## Sources étudiées et licences

| Source | Licence vérifiée | Utilisation |
|---|---|---|
| **USDA FoodData Central** (SR Legacy, FNDDS, Foundation) | Domaine public (CC0 1.0), attribution recommandée | **Intégrée** (7 197 aliments) |
| **Ciqual (ANSES)** | Licence ouverte Etalab 2.0 (réutilisation libre, citer la source) | **Pas encore intégrée** : le site de l'ANSES était en maintenance (erreur 503) pendant tout le développement, y compris les liens de téléchargement de data.gouv.fr. Le script `tools/fooddb/build.py` est prêt à recevoir une seconde source. C'est la prochaine étape : ~3 200 aliments avec des noms français d'origine. |
| **Open Food Facts** | Base ODbL (partage à l'identique), images CC BY-SA | Uniquement **à la demande, en ligne**, produit par produit ; la base n'est pas copiée dans l'application (éviter les obligations de partage de la base entière). |
| FAO / INFOODS (tables régionales, ex. Afrique de l'Ouest 2019) | Souvent CC BY-NC-SA 3.0 IGO (pas d'usage commercial, partage à l'identique) | **Non intégrée** : licence plus restrictive, site non accessible depuis l'environnement de développement. Les plats africains sont calculés à partir d'ingrédients USDA. |
| AFROFOODS | Accès et licence non vérifiables (site non joignable) | Non utilisée |
| Fichier canadien sur les éléments nutritifs | Licence du gouvernement ouvert du Canada | Non intégrée (site non joignable) ; candidate possible |
| RecipeDB | Usage académique, licence de redistribution non précisée | Non utilisée (pas de copie massive de recettes) |

Aucun texte, photo ou recette protégé n'a été copié : les compositions de plats sont des recettes types écrites pour NutriTrack.

## Reconstruire la base

```
python -I tools/fooddb/extract_usda.py <dossier_usda> <usda.jsonl>
python -I tools/fooddb/build.py <usda.jsonl> src/data/fooddb/usda.json
python -I tools/fooddb/build.py dishes src/data/fooddb/usda.json tools/fooddb/dishes.txt src/data/fooddb/dishes.json
```

Les archives USDA se téléchargent sur https://fdc.nal.usda.gov/download-datasets (SR Legacy 2018-04, FNDDS 2024-10-31). Le script refuse de construire un plat dont un ingrédient n'existe pas dans la base.
