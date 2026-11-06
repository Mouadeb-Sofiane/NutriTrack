# Compte rendu — NutriTrack v0.6 (novembre 2026)

Grande mise à jour : base alimentaire mondiale, recherche intelligente, plats modifiables, reconnaissance des plats par photo, plats enregistrés, vue mensuelle et objectifs personnalisés. Le design, les couleurs, la typographie et l'organisation des écrans n'ont pas été refaits (seuls des éléments ont été ajoutés avec les composants existants). L'application reste entièrement en français, gratuite et hors ligne.

## 1. Fonctionnalités terminées (testées)

| Partie du cahier des charges | Réalisation |
|---|---|
| 2 — Base alimentaire | 7 197 aliments et préparations USDA en français (cru/cuit/bouilli/vapeur/grillé/rôti/frit/pané/séché/conserve/égoutté, avec ou sans peau, avec ou sans matière grasse), 566 boissons, 194 plats composés du monde (Maghreb, Afrique, Europe, Moyen-Orient, Asie, Amériques, Caraïbes, plats familiaux, boissons préparées). Bouzelouf : fiche générique, parties au choix (joues, langue, cervelle), hypothèses écrites. |
| 3 — Traçabilité | Chaque aliment : nom, nom d'origine, catégorie, type, kcal, protéines, glucides, lipides, fibres et sucres si connus, source + version + lien, statut (table officielle / estimé / saisi). Valeur manquante = signalée, jamais inventée. Aliments simples, plats composés et produits commerciaux distingués. |
| 4 — Recherche | Accents, fautes de frappe, pluriels, synonymes, noms régionaux et translittérés, noms d'origine ; filtres Aliments / Plats / Boissons / Produits / Mes recettes / Récents ; « pain beurre » → tartine beurrée ; combinaison proposée quand aucun élément ne couvre la requête ; « Composer ce plat » si rien ne correspond. |
| 5 — Photo | Reconnaissance locale (100 libellés, 20 plats ajoutés) ; un plat composé s'ouvre avec sa composition mise à l'échelle du poids estimé ; alternatives en un geste ; « Ce n'est pas ce plat » remplace toute la composition ; ajout/suppression/remplacement d'ingrédients, unités, ajouts rapides (huile, beurre, crème, fromage, sauce…), portion modifiable ; poids présenté comme estimation (normal / haut). |
| Complément « sans pesée » | « Valider mon repas » en un geste ; portion plus petite / estimée / un peu plus / beaucoup plus / 2e portion / pas terminé ; grammes facultatifs, ingrédient par ingrédient facultatif. |
| 6 — Recettes personnelles | Création manuelle (existante) et depuis une photo (composition → « Enregistrer dans Mes plats », photo jointe en copie) ; modification, renommage, duplication, suppression ; historique figé. Export / import de recettes seules (JSON, sans écrasement). |
| 7 et complément « plats enregistrés » | Récents (aliments et repas), retrait d'un élément des récents ; Mes plats : recherche par nom tolérante (« quiche » → seulement les quiches), familles, favoris, plus utilisés ; suggestion discrète de favori après 3 utilisations ; plat photographié 2 fois → « Enregistrer / Plus tard / Ne plus proposer » ; photo proche d'un plat enregistré (image proche ET nom compatible) → « Réutiliser mon plat enregistré » / « Analyser cette nouvelle photo », choix si plusieurs. Valider ≠ Enregistrer ≠ Réutiliser. |
| 8 — Calcul | Somme par ingrédient puis division par portions ; quantités au gramme ; matières grasses toujours comptées, marquées et augmentées dans le scénario haut ; mesures ménagères propres à chaque aliment (c. à soupe, tranche, tasse, pièce…), kg et L ; estimations moyenne et haute conservées. |
| 9 — Journal | Inchangé et préservé ; composition d'une ligne modifiable avant enregistrement. |
| 10 — Vue mensuelle | Calendrier (calories, objectif, écart, couleur), navigation entre mois, détail d'un jour → journal ; couleurs selon l'objectif (prise de masse, maintien, perte), libellés neutres ; stats : moyenne, total, jours suivis, moyennes P/G/L, jours proches, évolution par semaine ; chaque jour comparé à l'objectif de son époque ; anneau du jour avec pourcentage et dépassement lisible. |
| Complément objectifs | Mifflin-St Jeor → dépense → objectif (déjà présent) ; recommandé vs personnalisé côte à côte avec l'écart expliqué ; objectif manuel jamais remplacé sans accord ; réévaluation à la demande d'après les 4 dernières semaines (apports + tendance du poids) ; idées facultatives d'ajustement des portions à partir des plats habituels. |
| 14 — Données | Migration de la base locale v1 → v2 sans perte (testée) ; sauvegarde et restauration existantes ; export/import de recettes ; durée de conservation des photos réglable (toujours / 90 / 30 jours / pas après l'enregistrement) ; on garde une signature numérique de l'image, pas la photo ; rien n'est envoyé. |

## 2. Partiellement terminé

- **Ciqual (ANSES)** : non intégrée. Le site de l'ANSES et ses liens de téléchargement (data.gouv.fr) répondaient « maintenance » (erreur 503) pendant toute la durée du travail. Le script de construction est prêt pour une seconde source.
- **Noms français des aliments USDA** : traduits pour NutriTrack (avec l'aide d'une IA) ; des imprécisions restent possibles, le nom d'origine est conservé et cherchable.
- **Couverture culinaire** : 194 plats composés + 1 633 plats USDA. C'est une base large mais pas exhaustive ; tout plat absent peut être composé et enregistré.
- **Reconnaissance photo des 20 nouveaux plats** : intégrée, mais non mesurée faute de photos de test annotées pour ces plats.

## 3. Non réalisé

- Tables FAO/INFOODS, AFROFOODS, fichier canadien : non accessibles depuis l'environnement de développement, et licence FAO plus restrictive (pas d'usage commercial).
- Essai sur un vrai téléphone de cette version (testée sur navigateur mobile simulé).
- Thème sombre (hors périmètre : design non modifié).

## 4. Sources et licences

Voir [base-alimentaire.md](base-alimentaire.md) : USDA FoodData Central (domaine public, intégrée), Ciqual (licence ouverte Etalab 2.0, prévue), Open Food Facts (ODbL, en ligne produit par produit, base non copiée), FAO/INFOODS (CC BY-NC-SA, non utilisée), RecipeDB (non utilisée), Nutrition5k (CC BY 4.0, poids sur photo), Open Images (CC BY 2.0, tests), OpenCLIP (MIT, modèle photo).

## 5. Tests exécutés

- **190 tests automatiques** (16 fichiers), tous réussis : recherche sur la vraie base (pain, pain avec beurre, banane, lait demi-écrémé, café avec sucre, pommes de terre, champignons, gratin, hachis, bouzelouf…), plats composés (194 plats valides, bouzelouf par parties, hachis 200 → 150 g de viande), pâtes aux champignons (200 g, 150 g, 100 ml, 10 g), historique figé après modification d'une recette, vue mensuelle (couleurs selon l'objectif, statistiques exactes, objectif historique), profils (prise de masse, perte, maintien, activité forte/faible, objectif 3 200 kcal conservé et expliqué), réévaluation, rapprochement photo, migration de base, export/import de recettes, conservation des photos.
- **Parcours dans le navigateur** (Chromium, format téléphone) : recherche, bouzelouf (584 → 657 kcal avec la cervelle → 1 313 kcal avec une 2e portion), correction quiche aux poireaux → quiche au thon (aucun poireau gardé), enregistrement dans Mes plats, vue mensuelle ; parcours photo réel avec le modèle installé : lasagnes reconnues ×3 → suggestion d'enregistrement → 4e photo : « Ce plat ressemble à ton plat enregistré ».
- **Reconnaissance photo** sur 431 vraies photos : 77 % et 80 % de bon plat en première proposition, 91 % dans les trois premières (niveau identique à la version précédente avec 20 plats en plus).

## 6. Dépendances et coûts

- Aucune nouvelle dépendance de l'application. Outils de construction (hors application) : Python avec onnxruntime et onnx pour régénérer les libellés photo.
- Coût de fonctionnement : **0 €** (pas d'API, pas de serveur, pas d'abonnement ; hébergement GitHub Pages gratuit). Coûts futurs possibles : aucun prévu.
- Poids ajouté : base alimentaire ≈ 1,2 Mo (≈ 220 ko compressés), chargée à la première recherche et gardée hors ligne ; libellés photo ≈ 200 ko mis à jour automatiquement sans retélécharger le modèle de 96 Mo.

## 7. Fichiers principaux ajoutés ou modifiés

Ajoutés : `src/domain/search.ts`, `dishes.ts`, `month.ts`, `photoMatch.ts`, `savedDishes.ts`, `adaptive.ts`, `portionTips.ts` (+ tests) ; `src/data/foodDb.ts`, `searchIndex.ts`, `fooddb/usda.json`, `fooddb/dishes.json` ; `src/screens/add/SearchPanel.tsx`, `CompositionSheet.tsx` ; `tools/fooddb/` (extraction, traductions, construction, plats) ; `docs/base-alimentaire.md`, ce compte rendu.

Modifiés : `MealComposer`, `FoodPicker`, `PhotoIdentifySheet`, `RecipePicker`, `RecentSheet`, `ItemEditSheet`, `Library`, `Progress`, `Today`, `GoalsEditor`, `Profile`, `App`, `db.ts` (version 2), `repo.ts`, `backup.ts`, `types.ts`, `recognition.ts`, `recognizer.ts`, `modelStore.ts`, `foodLabels.json` et `labels.f32` du modèle photo, `README.md`, `docs/reconnaissance-photo.md`.
