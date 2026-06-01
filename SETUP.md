# ReputIA — Guide de déploiement

## Architecture
- **Backend** : Node.js + Express
- **Base de données** : SQLite (fichier local, aucune config)
- **IA** : Groq API (gratuit)
- **Google** : Business Profile API (OAuth2)
- **Hébergement** : Railway (recommandé) ou Render

---

## ÉTAPE 1 — Google Cloud Console

### 1.1 Créer un projet
1. Va sur https://console.cloud.google.com
2. Clique "Nouveau projet" → nomme-le "ReputIA"
3. Sélectionne ce projet

### 1.2 Activer les APIs
Dans "APIs et services" → "Bibliothèque", active :
- **Google My Business API**
- **My Business Account Management API**
- **My Business Business Information API**

⚠️ La Google My Business API (avis) nécessite une demande d'accès à Google.
Fais la demande sur : https://developers.google.com/my-business/content/prereqs
(Délai : 1-5 jours ouvrés)

### 1.3 Créer les identifiants OAuth2
1. "APIs et services" → "Identifiants" → "Créer des identifiants" → "ID client OAuth 2.0"
2. Type : **Application Web**
3. Nom : ReputIA
4. URI de redirection autorisés :
   - `http://localhost:3000/auth/google/callback` (développement)
   - `https://VOTRE-DOMAINE.railway.app/auth/google/callback` (production)
5. Télécharge le fichier JSON → note `client_id` et `client_secret`

### 1.4 Écran de consentement OAuth
1. "APIs et services" → "Écran de consentement OAuth"
2. Type : **Externe** (pour tes clients)
3. Remplis : nom de l'app "ReputIA", email de support
4. Scopes : ajoute `https://www.googleapis.com/auth/business.manage`
5. En test : ajoute les emails de tes testeurs

---

## ÉTAPE 2 — Installation locale

```bash
# Clone le projet
cd reputia-saas

# Installe les dépendances
npm install

# Configure les variables d'environnement
cp .env.example .env
# Édite .env avec tes vraies clés

# Lance le serveur
npm start
```

Accède à http://localhost:3000

---

## ÉTAPE 3 — Déploiement sur Railway

Railway offre $5/mois gratuits — largement suffisant pour démarrer.

### 3.1 Préparer le projet
```bash
# Initialise Git
git init
git add .
git commit -m "Initial commit"
```

### 3.2 Déployer
1. Va sur https://railway.app
2. "New Project" → "Deploy from GitHub"
3. Connecte ton repo GitHub
4. Dans les variables d'environnement Railway, ajoute :
   ```
   GOOGLE_CLIENT_ID=xxxx
   GOOGLE_CLIENT_SECRET=xxxx
   GOOGLE_REDIRECT_URI=https://VOTRE-APP.railway.app/auth/google/callback
   SESSION_SECRET=une-clé-aléatoire-longue
   PORT=3000
   ```
5. Railway détecte automatiquement Node.js et lance `npm start`

### 3.3 Domaine personnalisé
Dans Railway → Settings → Domain → ajoute ton domaine (ex: app.reputia.fr)

---

## ÉTAPE 4 — Stripe (paiements €29/mois)

1. Crée un compte sur https://stripe.com
2. "Produits" → "Ajouter un produit" → "ReputIA Pro" → €29/mois récurrent
3. Copie le lien de paiement et mets-le dans ta landing page
4. Active le webhook Stripe pour gérer les abonnements (optionnel pour commencer)

---

## ÉTAPE 5 — Utilisation

### Flux client
1. Client s'inscrit sur ton app
2. Clique "Connecter Google" → autorise l'accès à son compte GMB
3. L'app récupère automatiquement ses établissements et leurs avis
4. Active la "Réponse automatique" → toutes les heures, les nouveaux avis reçoivent une réponse IA
5. OU il valide manuellement chaque réponse avant publication

### Clé Groq (par client)
Chaque client entre sa propre clé Groq gratuite (console.groq.com) dans Paramètres.
Alternativement, tu peux mettre ta propre clé dans server.js comme fallback.

---

## STRUCTURE DES FICHIERS

```
reputia-saas/
├── server.js          ← Serveur principal (toute la logique)
├── package.json       ← Dépendances
├── .env               ← Variables d'environnement (NE PAS committer)
├── .env.example       ← Template variables
├── reputia.db         ← Base de données SQLite (créée automatiquement)
└── public/
    ├── index.html     ← Login / Inscription
    └── dashboard.html ← Tableau de bord client
```

---

## COMMANDES UTILES

```bash
npm start          # Lance en production
npm run dev        # Lance avec rechargement auto (nodemon)
```

---

## REVENUS POTENTIELS

| Clients | Revenu mensuel |
|---------|---------------|
| 10      | €290          |
| 50      | €1 450        |
| 100     | €2 900        |
| 500     | €14 500       |

Marché FR : 200 000+ restaurants, 50 000+ hôtels, 500 000+ commerces.
