# Activer l'analyse photo par IA

Durée : environ 15 minutes, **sur ordinateur** de préférence (copier-coller plus simple).
Résultat : quand tu prends une photo dans NutriTrack et que tu appuies sur **« Analyser avec l'IA »**, un vrai modèle de vision (Google Gemini) identifie les aliments et estime les portions ; l'application calcule ensuite les calories (estimations moyenne et haute) avec ses propres tables. Tu vérifies, tu corriges, puis tu enregistres.

## Comment ça marche

```
Téléphone (NutriTrack)  ──photo + code d'accès──▶  Ton relais Cloudflare  ──photo + clé API──▶  Google Gemini
        ▲                                               (garde la clé secrète)                         │
        └──────────────── aliments + portions estimées (JSON) ◀──────────────────────────────────────┘
```

- La **clé API Gemini** est stockée uniquement dans ton relais (secret Cloudflare). Elle n'est ni dans l'application, ni dans le dépôt GitHub.
- Le **code d'accès** empêche d'autres personnes d'utiliser ton relais. Il ne donne pas accès à ta clé et se change en 1 minute.
- Rien n'est envoyé sans que tu appuies sur « Analyser avec l'IA ». Seules la photo (réduite à 1024 px) et la précision que tu écris éventuellement sont transmises : ni profil, ni poids, ni historique.
- Le relais ne stocke ni les photos ni les réponses.

## Ce que ça coûte (à vérifier au moment de l'installation)

| Élément | Coût | Remarques |
|---|---|---|
| Relais Cloudflare Workers | **Gratuit** | Offre gratuite : 100 000 requêtes/jour, largement suffisant. |
| Gemini, quota gratuit | **Gratuit** | Limites par minute et par jour, variables selon le modèle, qui changent régulièrement (fortement réduites fin 2025). Voir la remarque UE ci-dessous. |
| Gemini, facturation activée | **Environ 0,1 à 1 centime par photo** | Paiement à l'usage, **sans abonnement**. Ordre de grandeur pour un modèle « Flash » ou « Flash-Lite » : ~1 500 à 3 000 jetons envoyés et ~600 à 3 000 jetons reçus par photo. 100 photos par mois ≈ quelques dizaines de centimes. Vérifie les prix sur https://ai.google.dev/gemini-api/docs/pricing |

> ⚠️ **Décision à prendre : quota gratuit ou facturation (UE).** D'après les conditions de l'API Gemini (https://ai.google.dev/gemini-api/terms), seuls les « services payants » peuvent être utilisés pour proposer une application à des utilisateurs situés dans l'Espace économique européen (donc en France). Pour une application strictement personnelle dont tu es le seul utilisateur, l'interprétation n'est pas claire. **La solution la plus sûre est d'activer la facturation et de fixer une alerte de budget** (par ex. 2 €/mois). Elle garantit aussi que tes photos ne servent pas à entraîner les modèles de Google. Hors UE, le quota gratuit permet à Google d'utiliser les données envoyées pour améliorer ses produits (relecture humaine possible).

## Étape 1 — Créer la clé Gemini

1. Va sur https://aistudio.google.com et connecte-toi avec un compte Google.
2. Clique sur **Get API key** → **Create API key** (accepte la création d'un projet Google Cloud).
3. Copie la clé (elle commence souvent par `AIza…`). **Ne la colle nulle part ailleurs que dans Cloudflare** (pas dans l'application, pas dans un message).
4. *(Recommandé)* Dans AI Studio, ouvre la page de ta clé ou du projet et choisis **Set up billing** pour passer au niveau payant. Dans https://console.cloud.google.com/billing, ouvre **Budgets & alerts** et crée un budget de 2 € avec alerte par e-mail.

## Étape 2 — Créer le relais sur Cloudflare (gratuit)

1. Crée un compte sur https://dash.cloudflare.com/sign-up (aucune carte bancaire requise pour Workers).
2. Menu **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker** (modèle « Hello World »).
3. Nomme-le `nutritrack-ia`, clique **Deploy**.
4. Clique **Edit code**, efface tout, puis colle le contenu du fichier [`proxy/worker.js`](../proxy/worker.js) (sur GitHub, ouvre le fichier puis bouton **Raw** → tout sélectionner → copier). Clique **Deploy**.
5. Note l'adresse du relais, du type `https://nutritrack-ia.<ton-sous-domaine>.workers.dev`.

## Étape 3 — Ajouter les secrets du relais

Dans ton Worker : **Settings** → **Variables and Secrets** → **Add** :

| Nom | Type | Valeur |
|---|---|---|
| `GEMINI_API_KEY` | **Secret** | la clé de l'étape 1 |
| `ACCESS_CODE` | **Secret** | un code long et aléatoire : dans NutriTrack, **Profil → Analyse photo par IA → Générer un nouveau code** (il est copié automatiquement) |
| `ALLOWED_ORIGINS` | Texte | l'adresse de ton application, ex. `https://mouadeb-sofiane.github.io` (sans chemin). Facultatif mais recommandé. |
| `GEMINI_MODEL` | Texte | facultatif. Laisse vide : le relais choisit automatiquement le modèle « Flash » stable le plus récent disponible pour ta clé. Pour réduire le coût, tu peux indiquer un modèle « Flash-Lite » (son nom exact figure dans AI Studio). |

Clique **Deploy** pour appliquer.

## Étape 4 — Relier l'application

1. Dans NutriTrack : **Profil → Analyse photo par IA → Configurer**.
2. Colle l'**adresse du relais** et le **code d'accès** (le même que `ACCESS_CODE`).
3. Lis la partie confidentialité et active **« J'accepte… »**, puis **« Activer l'analyse photo par IA »**.
4. Appuie sur **Tester la connexion** : tu dois voir « ✓ Relais joignable · gemini · modèle … ».
5. **Enregistrer**, puis essaie : **+ Repas → Photo → Analyser avec l'IA**.

## Problèmes fréquents

| Message | Cause probable | Solution |
|---|---|---|
| « Code d'accès incorrect » | Code différent entre l'application et `ACCESS_CODE` | Régénère un code et mets-le à jour des deux côtés. |
| « Clé API Gemini invalide / refusée » | Clé mal copiée ou API non activée | Recrée la clé dans AI Studio et mets à jour `GEMINI_API_KEY`. |
| « Quota du service d'IA atteint » | Limite du quota gratuit | Réessaie plus tard ou active la facturation. |
| « Impossible de joindre le relais » | Adresse erronée, pas de réseau, ou `ALLOWED_ORIGINS` ne correspond pas à l'adresse de l'application | Vérifie l'adresse (https://…workers.dev) et `ALLOWED_ORIGINS`. |
| « Modèle introuvable » | `GEMINI_MODEL` invalide ou retiré | Vide `GEMINI_MODEL` pour la sélection automatique. |

En cas d'échec, l'application reste utilisable : identification en un geste, saisie en quelques mots ou estimation guidée.

## Limites à connaître

- Une photo ne permet pas de connaître le poids exact, la quantité d'huile, une sauce cachée ou la recette : l'IA donne une **fourchette de portion** et signale ce qui est **visible**, **supposé** ou **inconnu**. L'application ajoute une hypothèse explicite de matière grasse invisible pour les plats cuisinés (que tu peux décocher).
- Les calories sont calculées avec les tables de NutriTrack (valeurs moyennes indicatives). Si l'aliment n'y figure pas, les valeurs proposées par l'IA sont utilisées et **marquées « non vérifiées »**.
- Rien n'est enregistré tant que tu n'as pas validé le repas.
