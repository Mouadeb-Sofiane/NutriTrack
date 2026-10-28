# NutriTrack

Application personnelle de suivi nutritionnel : calories, macronutriments, recettes familiales, estimation sans balance, suivi du poids. **Gratuite, sans compte, sans publicité, et tes données restent sur ton téléphone.**

> Nom provisoire. Outil d'information et de suivi, **pas un dispositif médical** : les besoins caloriques et les valeurs des repas sont des estimations.

## Ce qui fonctionne aujourd'hui (v0.4)

| Fonction | État |
|---|---|
| Assistant de démarrage (profil, activité, objectif, révision) | ✅ |
| Métabolisme de base (Mifflin-St Jeor), dépenses estimées, objectif perte / maintien / prise de masse / personnalisé | ✅ |
| Prudence : < 18 ans, grossesse, allaitement, antécédents de TCA → aucun déficit automatique | ✅ |
| Sport « inclus dans l'activité » ou « séances à part » (sans double comptage, 0 % ajouté par défaut) | ✅ |
| Tableau de bord du jour, navigation entre les jours, macros (désactivables) | ✅ |
| Ajout de repas : recherche, recettes, photo, estimation sans balance, récents, calories rapides, saisie manuelle | ✅ |
| Repas au restaurant / à l'extérieur | ✅ |
| **Estimation moyenne + estimation haute** pour tout ce qui n'est pas pesé, avec hypothèses affichées et choix de la valeur retenue (moyenne par défaut, haute ou valeur personnelle) | ✅ |
| **Écrire ce que j'ai mangé** (« un kebab avec des frites et un coca », « quelques chips ») — analyse locale par règles, sans IA | ✅ |
| **Snacks, fête foraine, street food, fast-food, sauces, boissons** (~45 aliments : chips, pop-corn, churros, barbe à papa, crêpes, gaufres, kebab, tacos, burger, pizza, pâtisseries orientales…) avec portions simples (poignée, sachet, bol, pièces, part mangée) | ✅ |
| **Menu fast-food en une opération** (plat, frites, sauces, boisson, suppléments ; valeurs officielles de l'enseigne si tu les as) | ✅ |
| Scénarios du jour (moyen / haut) et détail de chaque élément (portion, valeur retenue, moyenne / haute) dans le journal | ✅ |
| Reprendre un **aliment** récent seul (pas seulement un repas entier) | ✅ |
| Recette réutilisée : **ajuster ses ingrédients pour un repas** sans modifier la recette | ✅ |
| Détection des doublons (même aliment ajouté deux fois, même repas enregistré deux fois) | ✅ |
| Fourchettes caloriques et niveau de précision (pesé / approximatif / estimation visuelle) | ✅ |
| Carnet de recettes : création, import depuis un texte, total estimé sans détail, plat familial, variantes, favoris, portions habituelles | ✅ |
| Historique préservé quand une recette change (mise à jour seulement si tu le demandes) | ✅ |
| Suivi du poids : graphique, moyenne mobile 7 jours, tendance, progression | ✅ |
| Historique : 7 / 30 / 90 jours / période personnalisée, moyennes hebdomadaires, aliments fréquents | ✅ |
| Conseils : observations calculées sur tes repas + alternatives chiffrées (fait maison / commerce) | ✅ (règles simples, sans IA) |
| Recherche de produits Open Food Facts (nom, code-barres, scan caméra sur Chrome Android) | ✅ implémentée, **non testée en réel** (voir limites) |
| Export / restauration JSON (fusion sans doublons ou remplacement) | ✅ |
| Hors ligne + installation sur l'écran d'accueil (PWA) | ✅ |
| **Reconnaissance des photos sur le téléphone** (modèle libre OpenCLIP, 96 Mo téléchargés une fois, hors ligne, sans frais) : propositions de plats, plusieurs aliments par photo, puis portion choisie avec estimations moyenne et haute | ✅ testée sur 431 vraies photos (≈ 78 % bon plat en tête, 91–94 % dans les 3 premières) — voir [docs/reconnaissance-photo.md](docs/reconnaissance-photo.md). Identification manuelle si le modèle n'est pas installé. |
| Thème sombre | ❌ prévu (couleurs déjà centralisées) |

## Utiliser l'application sur ton téléphone

La méthode la plus simple : l'héberger gratuitement sur **GitHub Pages**.

1. Fusionne la branche de travail dans `main` (via une pull request sur GitHub).
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions** (une seule fois).
3. À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` lance les tests, construit et publie l'application. L'adresse apparaît dans l'onglet **Actions** (de la forme `https://<ton-compte>.github.io/nutritrack/`).
4. Ouvre cette adresse sur ton téléphone puis :
   - **Android (Chrome)** : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
   - **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

L'adresse est publique mais **ne contient aucune donnée** : tes repas sont stockés dans ton navigateur, sur ton téléphone uniquement.

## Développement (sur ordinateur)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus. Commandes à lancer dans un terminal, **dans le dossier du projet** :

```bash
npm install        # installe les dépendances (une fois)
npm run dev        # lance l'application en développement → http://localhost:5173
npm test           # lance les tests automatiques
npm run build      # construit la version de production dans dist/
npm run preview    # sert la version de production → http://localhost:4173
```

**Tester sur le téléphone via le réseau local** : `npm run dev` affiche aussi une adresse « Network » (ex. `http://192.168.1.20:5173`). Ouvre-la sur le téléphone connecté au même Wi-Fi. Limite : sans HTTPS, l'installation sur l'écran d'accueil, le mode hors ligne et la caméra peuvent ne pas fonctionner — utilise GitHub Pages pour un usage quotidien.

## Sauvegarder et restaurer tes données

- **Profil → Mes données → Exporter** : crée un fichier `nutritrack-sauvegarde-AAAA-MM-JJ.json` (photos en option). Sur mobile, le menu de partage permet de l'envoyer vers Fichiers, Google Drive, un e-mail…
- **Restaurer** : choisis le fichier. Il est vérifié avant d'être importé. Deux choix : *fusionner* (ajoute ce qui manque, sans doublons) ou *tout remplacer* (confirmation demandée).
- ⚠️ **Il n'y a pas de sauvegarde automatique.** Effacer les données du navigateur, désinstaller le navigateur ou un nettoyage automatique peut tout supprimer. Exporte régulièrement. Le bouton « Protéger le stockage » demande au navigateur de ne pas nettoyer les données (accepté plus facilement quand l'application est installée).
- Les données ne passent pas d'un téléphone à l'autre toutes seules : exporte sur l'un, restaure sur l'autre.

## Sources des données nutritionnelles

- **Table de référence intégrée** (~100 aliments courants, hors ligne) : valeurs **moyennes indicatives**, arrondies, à l'ordre de grandeur des tables publiques CIQUAL (ANSES) et USDA. Je n'avais pas accès au réseau pour importer la table CIQUAL officielle : c'est une amélioration prévue (licence ouverte Etalab, attribution requise).
- **Open Food Facts** : base collaborative et gratuite (licence ODbL, attribution affichée). Fiches parfois incomplètes ; seule la recherche (texte ou code-barres) est envoyée, aucune donnée personnelle. Limites publiées : ~10 recherches/min, ~100 lectures de produit/min.
- **Recettes, saisies manuelles, estimations guidées** : toujours marquées comme telles.

Chaque ligne d'un repas garde sa source, sa précision et une **copie figée** de ses valeurs : modifier un aliment ou une recette ne réécrit jamais l'historique sans ton accord.

## Comment les estimations sont calculées

- **Métabolisme de base** : Mifflin-St Jeor. Sexe non précisé → moyenne des deux formules, signalée comme moins précise.
- **Dépenses quotidiennes** : métabolisme × coefficient d'activité (1,2 à 1,9 — approximations).
- **Objectif** : perte −10 / −15 / −20 %, prise de masse +5 / +10 / +15 %. Avertissement si l'objectif passe sous le métabolisme de base. Jamais modifié sans confirmation.
- **Macros** (repères non médicaux) : protéines 1,6 g/kg (1,2 en maintien) sur un poids de référence plafonné à IMC 25, lipides ~30 %, glucides le reste.
- **Fourchettes** : marge sur la quantité selon la précision (pesé 0 %, mesure ménagère ±20 %, visuel ±40 %), +15 % quand on mange « une portion » d'un plat familial (assiettes pas identiques). Ce sont des heuristiques documentées, pas des probabilités.
- **Estimation sans balance** : 14 modèles de plats (riz-viande, couscous, tajine, chorba/harira, curry, ramen, pizza…) décrivant une *hypothèse de composition* modifiable, ajustée par la taille de portion et la quantité de matière grasse.

## Estimation moyenne et estimation haute

Quand un aliment n'est pas pesé, l'application calcule deux scénarios :

- **Estimation moyenne** : les hypothèses les plus plausibles (portion habituelle, composition moyenne).
- **Estimation haute** : un scénario plus énergétique mais plausible, construit avec des **hypothèses explicites** affichées sous « Pourquoi ces deux valeurs ? », par exemple une portion plus grande (une hypothèse basse/moyenne/haute est définie pour chaque portion), une friture plus grasse, une sauce généreuse, une assiette un cran plus copieuse ou plus de matière grasse dans un plat maison. Ce n'est jamais le pire cas imaginable : par exemple, une pizza dont le nombre n'est pas précisé reste *une* pizza.
- **Fourchette plausible** quand une hypothèse basse existe.

Par défaut, c'est la moyenne qui est retenue. Quand un facteur important est inconnu (quantité de sauce, huile de friture, taille du cornet…), un message discret explique pourquoi regarder l'estimation haute. Tu choisis : moyenne, haute ou ta propre valeur. Les deux estimations, les hypothèses, la méthode et tes corrections restent enregistrées (et sauvegardées dans l'export).

**Total du jour** : il est calculé avec la valeur que tu as retenue pour chaque élément. Le bloc « Scénarios du jour » additionne d'un côté toutes les estimations moyennes, de l'autre toutes les estimations hautes. Une valeur personnelle s'applique aux deux scénarios. Le scénario haut est un **scénario de prudence**, pas une mesure de ce que tu as mangé. Ce ne sont pas des probabilités statistiques.

Les valeurs du catalogue sont des **ordres de grandeur** (tables publiques et étiquettes courantes, arrondis), affichés comme estimations et modifiables. Elles ne correspondent à aucune enseigne précise : si tu as les valeurs officielles d'un restaurant, le menu fast-food permet de les saisir (provenance indiquée).

## Architecture

React 19 + TypeScript + Vite, Tailwind CSS 4, IndexedDB via Dexie, Recharts, zod (validation des sauvegardes), vite-plugin-pwa. **Pas de backend.**

```
src/
  domain/      calculs purs et testés (énergie, nutrition, recettes, estimations moyenne/haute,
               catalogue snacks & fast-food, saisie libre, stats, conseils, table de référence)
  data/        stockage local (Dexie), sauvegarde/restauration, client Open Food Facts
  state/       état de l'application, brouillon de repas, routeur par hash
  ui/          composants d'interface réutilisables
  screens/     écrans (Aujourd'hui, Repas, Progression, Conseils, Profil, ajout de repas, recettes)
```

Le schéma de données est versionné (`SCHEMA_VERSION`, `db.version(n)`) pour les migrations futures.

## Reconnaissance des photos

Tout est détaillé dans **[docs/reconnaissance-photo.md](docs/reconnaissance-photo.md)** (résultats mesurés, contraintes matérielles, licences).

- **100 % gratuit et local** : modèle OpenCLIP ViT-B/32 (MIT) exécuté dans le navigateur par ONNX Runtime Web (MIT), servi par le site de l'application lui-même. Aucune API, aucun compte, aucun quota, aucune photo envoyée.
- **Rôle du modèle** : proposer les plats probables ; **la portion est choisie par toi** (une photo ne donne ni le poids ni l'huile), puis l'application calcule les estimations moyenne et haute habituelles.
- **Contraintes** : ~110 Mo à télécharger une fois (Wi-Fi conseillé), 3 Go de RAM conseillés, quelques secondes par photo sur téléphone (non mesuré sur un vrai appareil).
- **Mode dégradé** : identification manuelle en un geste ou en quelques mots, toujours disponible.
