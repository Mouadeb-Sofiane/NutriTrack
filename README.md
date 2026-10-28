# NutriTrack

Application personnelle de suivi nutritionnel : calories, macronutriments, recettes familiales, estimation sans balance, suivi du poids. **Gratuite, sans compte, sans publicité, et tes données restent sur ton téléphone.**

> Nom provisoire. Outil d'information et de suivi, **pas un dispositif médical** : les besoins caloriques et les valeurs des repas sont des estimations.

## Ce qui fonctionne aujourd'hui (v0.1)

| Fonction | État |
|---|---|
| Assistant de démarrage (profil, activité, objectif, révision) | ✅ |
| Métabolisme de base (Mifflin-St Jeor), dépenses estimées, objectif perte / maintien / prise de masse / personnalisé | ✅ |
| Prudence : < 18 ans, grossesse, allaitement, antécédents de TCA → aucun déficit automatique | ✅ |
| Sport « inclus dans l'activité » ou « séances à part » (sans double comptage, 0 % ajouté par défaut) | ✅ |
| Tableau de bord du jour, navigation entre les jours, macros (désactivables) | ✅ |
| Ajout de repas : recherche, recettes, photo, estimation sans balance, récents, calories rapides, saisie manuelle | ✅ |
| Repas au restaurant / à l'extérieur | ✅ |
| Fourchettes caloriques et niveau de précision (pesé / approximatif / estimation visuelle) | ✅ |
| Carnet de recettes : création, import depuis un texte, total estimé sans détail, plat familial, variantes, favoris, portions habituelles | ✅ |
| Historique préservé quand une recette change (mise à jour seulement si tu le demandes) | ✅ |
| Suivi du poids : graphique, moyenne mobile 7 jours, tendance, progression | ✅ |
| Historique : 7 / 30 / 90 jours / période personnalisée, moyennes hebdomadaires, aliments fréquents | ✅ |
| Conseils : observations calculées sur tes repas + alternatives chiffrées (fait maison / commerce) | ✅ (règles simples, sans IA) |
| Recherche de produits Open Food Facts (nom, code-barres, scan caméra sur Chrome Android) | ✅ implémentée, **non testée en réel** (voir limites) |
| Export / restauration JSON (fusion sans doublons ou remplacement) | ✅ |
| Hors ligne + installation sur l'écran d'accueil (PWA) | ✅ |
| **Analyse automatique des photos par IA** | ❌ pas encore — la photo est gardée et une estimation guidée est proposée |
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

## Architecture

React 19 + TypeScript + Vite, Tailwind CSS 4, IndexedDB via Dexie, Recharts, zod (validation des sauvegardes), vite-plugin-pwa. **Pas de backend.**

```
src/
  domain/      calculs purs et testés (énergie, nutrition, recettes, stats, conseils, table de référence)
  data/        stockage local (Dexie), sauvegarde/restauration, client Open Food Facts
  state/       état de l'application, brouillon de repas, routeur par hash
  ui/          composants d'interface réutilisables
  screens/     écrans (Aujourd'hui, Repas, Progression, Conseils, Profil, ajout de repas, recettes)
```

Le schéma de données est versionné (`SCHEMA_VERSION`, `db.version(n)`) pour les migrations futures.

## Analyse photo par IA (prochaine étape)

Aucune analyse n'est simulée. Pistes étudiées pour la suite, à valider (conditions et quotas à vérifier au moment de l'intégration) :
- **Clé API personnelle** (fournie par toi, stockée uniquement sur ton téléphone, jamais dans le code) vers un modèle de vision disposant d'une offre gratuite ou peu coûteuse, avec consentement explicite avant chaque envoi de photo.
- **Modèle local** dans le navigateur : gratuit et privé mais lourd à télécharger et peu fiable pour estimer des portions.

Dans tous les cas, la validation humaine restera obligatoire et l'application continuera de fonctionner sans IA.
