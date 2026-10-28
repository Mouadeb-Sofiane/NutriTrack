# Reconnaissance des photos de repas (sur le téléphone)

**Gratuite, sans compte, sans abonnement, sans quota, hors ligne.** Le modèle est téléchargé une seule fois depuis le site de l'application, puis chaque photo est analysée sur l'appareil. Aucune photo n'est envoyée nulle part.

## Ce que fait la reconnaissance, et ce qu'elle ne fait pas

| Elle fait | Elle ne fait pas |
|---|---|
| Proposer les plats ou aliments probables parmi ~80 libellés (fast-food, snacks, fête foraine, plats maison et du monde, fruits, boissons…), avec un score relatif | Mesurer le poids, la quantité d'huile, une sauce cachée ou la recette |
| Repérer plusieurs aliments sur une même photo (analyse de l'image entière + 4 zones) | Reconnaître un plat absent de sa liste : elle proposera alors le libellé le plus proche (d'où la correction manuelle toujours disponible) |
| Fonctionner hors ligne, sans frais par photo | Calculer seule les calories : tu choisis la portion, l'application calcule les estimations **moyenne et haute** comme pour toute saisie |

Parcours : **Photo → propositions → tu touches le bon plat → écran habituel de portion (petite / moyenne / grande, pièces, part mangée) → estimations moyenne et haute → tu peux ajouter un 2ᵉ aliment → Terminer → tu vérifies le repas → Enregistrer.** Rien n'est enregistré sans ta validation. Si une de tes recettes correspond (« Couscous familial » quand un couscous est reconnu), elle est proposée.

**Mode dégradé** : si le modèle n'est pas installé, si le téléphone n'y arrive pas ou si les propositions sont fausses, l'identification manuelle en un geste (kebab, pizza, churros…) ou en quelques mots reste juste en dessous. Sur un téléphone lent, un bouton « mode rapide » analyse seulement l'image entière.

## Résultats mesurés sur de vraies photos

Photos réelles d'Open Images (Google, licence CC BY 2.0), annotées par des humains, jamais utilisées pour régler le modèle.

| Jeu de test | Photos | Bon plat en 1ʳᵉ proposition | Dans les 3 premières | Dans la liste proposée |
|---|---|---|---|---|
| Repas courants (43 types : pizza, burger, frites, sushis, pâtes, salades, desserts, fruits, boissons…) | 258 | 78 % | 94 % | 98 % |
| Cuisines du monde et street food (27 types : couscous, doner kebab, shawarma, curry, biryani, ramen, churros, crêpes, nuggets…) | 173 | 78 % | 91 % | 94 % |
| Photos à plusieurs aliments : part des aliments retrouvés dans les propositions | 128 | — | — | 87 % |
| Vérification dans le navigateur, par l'interface réelle (même modèle, même code) | 84 + 53 | 77 % | 91 % | 94–95 % |

Par plat (2ᵉ jeu) : couscous 4/4, curry 17/18, pad thaï 8/8, ramen 7/7, pho 8/8, biryani 9/10 en tête ; doner kebab dans les 3 premières 6/6 mais souvent après « sandwich » ou « burrito » ; churros 5/6 ; points faibles : paella (pas de libellé dédié), wraps, baklava, soupes et omelettes parfois confondues.

Limites de ces mesures : quelques photos par plat (4 à 18), pas de photo de tajine, chorba ou harira disponible pour le test, et des photos de restaurant ou de blog plus nettes que certaines photos prises au quotidien. Les chiffres réels peuvent être inférieurs.

Rejouer l'évaluation : `python tools/vision/evaluate.py <dossier_modèle> tools/vision/data/openimages-repas-courants.json <photos> tools/vision/data/correspondances-repas-courants.json` (les photos se téléchargent depuis Open Images à partir des identifiants fournis).

## Contraintes matérielles

- **Téléchargement unique** : ~110 Mo (modèle 96 Mo + moteur WebAssembly 15 Mo), Wi-Fi conseillé. Stocké dans le navigateur ; « Profil → Reconnaissance des photos » permet de le supprimer.
- **Temps mesuré** : ~1,1 à 1,3 s par photo sur un processeur de serveur en mode un seul fil (celui de GitHub Pages). **Non mesuré sur un vrai téléphone** : selon l'appareil, attendre plutôt 3 à 8 s ; le premier passage charge le modèle (quelques secondes de plus).
- **Mémoire** : ~300 à 500 Mo pendant l'analyse ; 3 Go de RAM ou plus conseillés.
- **Navigateurs** : Chrome / Edge / Firefox récents sur Android, Safari 16.4+ sur iPhone (WebAssembly SIMD requis). En navigation privée, le stockage du modèle peut être refusé ou effacé.
- Si le navigateur efface ses données, il faudra retélécharger le modèle (tes repas, eux, se restaurent depuis ta sauvegarde JSON).

## Modèle et licences

| Composant | Licence | Rôle |
|---|---|---|
| OpenCLIP ViT-B/32, poids `laion2b_s34b_b79k` | MIT | Encodeur d'image (quantifié en 8 bits, 96 Mo) |
| Conversion ONNX : projet Jina clip-as-service | Apache-2.0 | Fichier ONNX d'origine |
| ONNX Runtime Web | MIT | Exécution dans le navigateur (WebAssembly) |
| Photos de test Open Images | CC BY 2.0 | Évaluation uniquement (non distribuées) |

Le modèle a été entraîné par ses auteurs sur LAION-2B, une collecte d'images du web. Pour un usage personnel et non commercial, la licence MIT n'impose que de conserver la notice, fournie avec le modèle (`public/models/food-clip-v1/LICENSE.txt`).

## Pourquoi ce choix (étude d'octobre 2026)

| Option | Verdict |
|---|---|
| **CLIP (OpenCLIP ViT-B/32) dans le navigateur** ✅ | Libre (MIT), 96 Mo une fois, ~1 s par photo, vocabulaire adaptable à nos plats (kebab, couscous, churros…) sans réentraînement. Ne mesure pas les portions. |
| Petits modèles qui décrivent l'image (SmolVLM, Florence-2, Moondream…) | Plus lourds (250 Mo à 2 Go), lents sans GPU, portions peu fiables ; leurs fichiers n'étaient pas accessibles depuis l'environnement de développement pour être testés. |
| Classificateurs Food-101 / « AIY Food » de Google | Liste de plats figée (pas de kebab, couscous…) ; le modèle AIY n'est plus distribué. |
| API en ligne (Gemini, etc.) | Écartées : coût ou quota susceptible de devenir payant. L'ancien relais Gemini reste dans l'historique Git (commit `0366bec`). |

## Mettre à jour ou reconstruire le modèle

`python tools/vision/build_model.py <dossier_de_travail>` télécharge le modèle d'origine, recalcule les vecteurs des libellés de `src/domain/foodLabels.json`, quantifie et découpe le modèle dans `public/models/food-clip-v1/`. À relancer après toute modification des libellés (un test vérifie que les vecteurs sont à jour).
