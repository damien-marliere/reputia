require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const path = require('path');

// node-fetch v3 workaround pour CommonJS
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();

// ─────────────────────────────────────────
// BASE DE DONNÉES SQLite
// ─────────────────────────────────────────
const db = new DatabaseSync('./reputia.db');

db.exec(`CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  groq_key     TEXT DEFAULT '',
  plan         TEXT DEFAULT 'trial',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS locations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER REFERENCES users(id),
  google_location_name  TEXT NOT NULL,
  business_name         TEXT DEFAULT 'Mon établissement',
  business_type         TEXT DEFAULT 'restaurant',
  access_token          TEXT,
  refresh_token         TEXT NOT NULL,
  auto_respond          INTEGER DEFAULT 0,
  tone                  TEXT DEFAULT 'professionnel',
  active                INTEGER DEFAULT 1,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS reviews (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id        INTEGER REFERENCES locations(id),
  google_review_id   TEXT UNIQUE NOT NULL,
  reviewer_name      TEXT DEFAULT 'Anonyme',
  star_rating        INTEGER DEFAULT 0,
  comment            TEXT DEFAULT '',
  generated_response TEXT,
  status             TEXT DEFAULT 'new',
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  responded_at       DATETIME
)`);

// ─────────────────────────────────────────
// GOOGLE OAUTH2
// ─────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
);

const SCOPES = ['https://www.googleapis.com/auth/business.manage'];

// ─────────────────────────────────────────
// TRUSTPILOT CONFIG
// ─────────────────────────────────────────
const TP_API_KEY      = process.env.TRUSTPILOT_API_KEY      || '';
const TP_API_SECRET   = process.env.TRUSTPILOT_API_SECRET   || '';
const TP_REDIRECT_URI = process.env.TRUSTPILOT_REDIRECT_URI || 'http://localhost:3001/auth/trustpilot/callback';

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'reputia-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  next();
};

// ─────────────────────────────────────────
// ROUTES AUTH
// ─────────────────────────────────────────

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.json({ error: 'Email valide et mot de passe (6 car. min) requis' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hash);
    req.session.userId = result.lastInsertRowid;
    res.json({ ok: true });
  } catch (e) {
    console.error('Signup error:', e.message);
    if (e.message && e.message.includes('UNIQUE')) {
      res.json({ error: 'Cet email est déjà utilisé' });
    } else {
      res.json({ error: 'Erreur DB: ' + e.message });
    }
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.json({ error: 'Email ou mot de passe incorrect' });
  }
  req.session.userId = user.id;
  res.json({ ok: true });
});

// Mot de passe oublié — reset direct (pas d'email, app locale)
app.post('/api/reset-password', async (req, res) => {
  const { email, new_password } = req.body;
  if (!email || !new_password || new_password.length < 6) {
    return res.json({ error: 'Email et nouveau mot de passe (6 car. min) requis' });
  }
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.json({ error: 'Aucun compte avec cet email' });
  const hash = await bcrypt.hash(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, email);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, plan, groq_key FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Session expirée' });
  res.json(user);
});

app.post('/api/settings', requireAuth, (req, res) => {
  const { groq_key } = req.body;
  db.prepare('UPDATE users SET groq_key = ? WHERE id = ?').run(groq_key || '', req.session.userId);
  res.json({ ok: true });
});

// ─────────────────────────────────────────
// ROUTES GOOGLE OAUTH
// ─────────────────────────────────────────

app.get('/auth/google', requireAuth, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: String(req.session.userId)
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth error:', error);
    return res.redirect('/dashboard.html?error=oauth_denied');
  }

  const userId = parseInt(state);
  if (!userId) return res.redirect('/dashboard.html?error=invalid_state');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log('[OAuth] Tokens obtenus:', tokens.access_token ? 'OK' : 'MANQUANT');

    let locationCount = 0;

    // Étape 1 : récupérer les comptes GMB (API v1, pas d'approbation requise)
    try {
      const accountMgmt = google.mybusinessaccountmanagement({ version: 'v1', auth: oauth2Client });
      const accountsRes = await accountMgmt.accounts.list();
      const accounts = accountsRes.data.accounts || [];
      console.log('[OAuth] Comptes GMB:', accounts.length);

      for (const account of accounts) {
        const locName = account.name;
        const bizName = account.accountName || 'Mon établissement';

        // Étape 2 : récupérer les établissements (API mybusinessbusinessinformation v1)
        try {
          const bizInfo = google.mybusinessbusinessinformation({ version: 'v1', auth: oauth2Client });
          const locsRes = await bizInfo.accounts.locations.list({
            parent: account.name,
            readMask: 'name,title'
          });
          const locs = locsRes.data.locations || [];

          for (const loc of locs) {
            const lName = loc.name;
            const lBiz = loc.title || bizName;
            const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(lName, userId);
            if (existing) {
              db.prepare('UPDATE locations SET access_token = ?, refresh_token = ? WHERE id = ?').run(tokens.access_token || '', tokens.refresh_token || '', existing.id);
            } else {
              db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, lName, lBiz, tokens.access_token || '', tokens.refresh_token || '');
              locationCount++;
            }
          }
        } catch (e2) {
          // mybusinessbusinessinformation non dispo — sauvegarder le compte directement
          console.log('[OAuth] Étapes établissements ignorée:', e2.message);
          const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(locName, userId);
          if (existing) {
            db.prepare('UPDATE locations SET access_token = ?, refresh_token = ? WHERE id = ?').run(tokens.access_token || '', tokens.refresh_token || '', existing.id);
          } else {
            db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, locName, bizName, tokens.access_token || '', tokens.refresh_token || '');
            locationCount++;
          }
        }
      }
    } catch (e1) {
      // Même si la liste des comptes échoue, sauvegarder les tokens avec un emplacement générique
      console.log('[OAuth] Liste comptes échouée:', e1.message);
      const existing = db.prepare('SELECT id FROM locations WHERE user_id = ?').get(userId);
      if (!existing) {
        db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, `gmb_${userId}`, 'Mon établissement Google', tokens.access_token || '', tokens.refresh_token || '');
        locationCount = 1;
      } else {
        db.prepare('UPDATE locations SET access_token = ?, refresh_token = ? WHERE user_id = ?').run(tokens.access_token || '', tokens.refresh_token || '', userId);
      }
    }

    res.redirect(`/dashboard.html?connected=1&locations=${locationCount}`);
  } catch (e) {
    console.error('Erreur OAuth callback:', e.message, e.stack);
    res.redirect('/dashboard.html?error=oauth_failed');
  }
});

// ─────────────────────────────────────────
// ROUTES TRUSTPILOT OAUTH
// ─────────────────────────────────────────

app.get('/auth/trustpilot', requireAuth, (req, res) => {
  if (!TP_API_KEY) return res.redirect('/dashboard.html?error=tp_not_configured');
  const params = new URLSearchParams({
    client_id: TP_API_KEY,
    redirect_uri: TP_REDIRECT_URI,
    response_type: 'code',
    scope: 'manage.reviews',
    state: String(req.session.userId)
  });
  res.redirect(`https://authenticate.trustpilot.com/?${params}`);
});

app.get('/auth/trustpilot/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/dashboard.html?error=tp_denied');
  const userId = parseInt(state);
  if (!userId) return res.redirect('/dashboard.html?error=invalid_state');

  try {
    // Échange code contre token
    const tokenRes = await fetch('https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TP_API_KEY}:${TP_API_SECRET}`).toString('base64')
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(TP_REDIRECT_URI)}`
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('Pas de token: ' + JSON.stringify(tokens));

    // Récupérer le business unit
    const meRes = await fetch('https://api.trustpilot.com/v1/private/business-users/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const meData = await meRes.json();
    const businessUnitId = meData.businessUnitId || meData.id;
    const bizName = meData.name || 'Mon établissement Trustpilot';
    if (!businessUnitId) throw new Error('businessUnitId introuvable dans: ' + JSON.stringify(meData));

    const locName = `tp_${businessUnitId}`;
    const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(locName, userId);
    if (existing) {
      db.prepare('UPDATE locations SET access_token = ?, refresh_token = ?, business_name = ? WHERE id = ?')
        .run(tokens.access_token, tokens.refresh_token || '', bizName, existing.id);
    } else {
      db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)')
        .run(userId, locName, bizName, tokens.access_token, tokens.refresh_token || '');
    }
    console.log('[TP OAuth] Connecté:', bizName, '/', businessUnitId);
    res.redirect('/dashboard.html?tp_connected=1');
  } catch (e) {
    console.error('[TP OAuth]', e.message);
    res.redirect('/dashboard.html?error=tp_failed');
  }
});

// ─────────────────────────────────────────
// ROUTES ÉTABLISSEMENTS
// ─────────────────────────────────────────

app.get('/api/locations', requireAuth, (req, res) => {
  const locations = db.prepare(
    'SELECT id, business_name, business_type, google_location_name, auto_respond, tone, active, created_at FROM locations WHERE user_id = ? AND active = 1'
  ).all(req.session.userId);
  res.json(locations);
});

app.put('/api/locations/:id', requireAuth, (req, res) => {
  const loc = db.prepare('SELECT id FROM locations WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!loc) return res.status(404).json({ error: 'Établissement non trouvé' });

  const { auto_respond, tone, business_type, business_name } = req.body;
  db.prepare('UPDATE locations SET auto_respond = ?, tone = ?, business_type = ?, business_name = ? WHERE id = ?')
    .run(auto_respond ? 1 : 0, tone || 'professionnel', business_type || 'restaurant', business_name || 'Mon établissement', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/locations/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE locations SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ─────────────────────────────────────────
// ROUTES AVIS
// ─────────────────────────────────────────

app.get('/api/reviews', requireAuth, (req, res) => {
  const { status, location_id } = req.query;
  let query = `
    SELECT r.*, l.business_name, l.tone, l.business_type
    FROM reviews r
    JOIN locations l ON r.location_id = l.id
    WHERE l.user_id = ?
  `;
  const params = [req.session.userId];

  if (status) { query += ' AND r.status = ?'; params.push(status); }
  if (location_id) { query += ' AND r.location_id = ?'; params.push(location_id); }

  query += ' ORDER BY r.created_at DESC LIMIT 100';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/stats', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const total = db.prepare(`SELECT COUNT(*) as n FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ?`).get(userId).n;
  const posted = db.prepare(`SELECT COUNT(*) as n FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ? AND r.status = 'posted'`).get(userId).n;
  const pending = db.prepare(`SELECT COUNT(*) as n FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ? AND r.status IN ('new','generated')`).get(userId).n;
  const avgStars = db.prepare(`SELECT AVG(star_rating) as avg FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ?`).get(userId).avg;
  res.json({ total, posted, pending, avgStars: avgStars ? Math.round(avgStars * 10) / 10 : 0 });
});

// Générer une réponse IA
app.post('/api/reviews/:id/generate', requireAuth, async (req, res) => {
  const review = db.prepare(`
    SELECT r.*, l.user_id, l.tone, l.business_name, l.business_type
    FROM reviews r JOIN locations l ON r.location_id = l.id
    WHERE r.id = ? AND l.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!review) return res.status(404).json({ error: 'Avis non trouvé' });

  const user = db.prepare('SELECT groq_key FROM users WHERE id = ?').get(req.session.userId);
  if (!user.groq_key) return res.json({ error: 'Clé Groq non configurée dans les paramètres' });

  try {
    const response = await generateResponse(review, user.groq_key);
    db.prepare('UPDATE reviews SET generated_response = ?, status = ? WHERE id = ?').run(response, 'generated', review.id);
    res.json({ ok: true, response });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Poster la réponse sur Google
app.post('/api/reviews/:id/post', requireAuth, async (req, res) => {
  const review = db.prepare(`
    SELECT r.*, l.user_id, l.access_token, l.refresh_token, l.google_location_name, l.tone, l.business_name, l.business_type
    FROM reviews r JOIN locations l ON r.location_id = l.id
    WHERE r.id = ? AND l.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!review) return res.status(404).json({ error: 'Avis non trouvé' });
  if (!review.generated_response) return res.json({ error: 'Génère d\'abord une réponse' });

  try {
    const isTrustpilot = review.google_location_name && review.google_location_name.startsWith('tp_');
    if (isTrustpilot) {
      await postTrustpilotReply(review, review.google_review_id, review.generated_response);
    } else {
      await postGoogleReply(review, review.generated_response);
    }
    db.prepare('UPDATE reviews SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?').run('posted', review.id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: 'Erreur API: ' + e.message });
  }
});

// Modifier la réponse générée
app.put('/api/reviews/:id/response', requireAuth, (req, res) => {
  const { response } = req.body;
  const review = db.prepare(`
    SELECT r.id FROM reviews r JOIN locations l ON r.location_id = l.id WHERE r.id = ? AND l.user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!review) return res.status(404).json({ error: 'Avis non trouvé' });
  db.prepare('UPDATE reviews SET generated_response = ? WHERE id = ?').run(response, req.params.id);
  res.json({ ok: true });
});

// Rafraîchir les vrais noms d'établissements depuis Google
app.post('/api/refresh-locations', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const loc = db.prepare('SELECT * FROM locations WHERE user_id = ?').get(userId);
  if (!loc || !loc.refresh_token) return res.json({ error: 'Pas de connexion Google trouvée' });

  try {
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ access_token: loc.access_token, refresh_token: loc.refresh_token });
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    // Récupérer les comptes
    const accountMgmt = google.mybusinessaccountmanagement({ version: 'v1', auth: client });
    const accountsRes = await accountMgmt.accounts.list();
    const accounts = accountsRes.data.accounts || [];

    if (accounts.length === 0) return res.json({ error: 'Aucun compte Google My Business trouvé' });

    let updated = 0;
    for (const account of accounts) {
      // Récupérer les établissements via REST direct
      const locsRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (locsRes.ok) {
        const locsData = await locsRes.json();
        const locs = locsData.locations || [];

        for (const location of locs) {
          const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(location.name, userId);
          if (existing) {
            db.prepare('UPDATE locations SET business_name = ? WHERE id = ?').run(location.title || 'Mon établissement', existing.id);
          } else {
            db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, location.name, location.title || 'Mon établissement', loc.access_token || '', loc.refresh_token || '');
          }
          updated++;
        }
      } else {
        // Pas accès aux locations individuelles — au moins mettre à jour le nom du compte
        db.prepare('UPDATE locations SET google_location_name = ?, business_name = ? WHERE user_id = ?').run(account.name, account.accountName || 'Mon établissement', userId);
        updated++;
      }
    }

    // Supprimer les entrées avec des noms génériques (gmb_xxx)
    db.prepare("DELETE FROM locations WHERE user_id = ? AND google_location_name LIKE 'gmb_%'").run(userId);

    res.json({ ok: true, updated });
  } catch (e) {
    console.error('[REFRESH-LOC]', e.message);
    res.json({ error: e.message });
  }
});

// Ajout manuel d'un avis (copié depuis Google)
app.post('/api/reviews/manual', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { reviewer_name, star_rating, comment } = req.body;
  if (!comment) return res.json({ error: 'Commentaire requis' });

  let loc = db.prepare('SELECT id FROM locations WHERE user_id = ? AND active = 1').get(userId);
  if (!loc) {
    db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, `manual_${userId}`, 'Mon établissement', '', '');
    loc = db.prepare('SELECT id FROM locations WHERE user_id = ?').get(userId);
  }

  const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  db.prepare('INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)').run(loc.id, id, reviewer_name || 'Anonyme', parseInt(star_rating) || 5, comment, 'new');
  res.json({ ok: true });
});

// Mode démo — injecter des faux avis pour tester
app.post('/api/demo', requireAuth, (req, res) => {
  const userId = req.session.userId;

  // S'assurer qu'il y a au moins un établissement
  let loc = db.prepare('SELECT id FROM locations WHERE user_id = ?').get(userId);
  if (!loc) {
    db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, business_type, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, `gmb_demo_${userId}`, 'Mon Restaurant', 'restaurant', '', '');
    loc = db.prepare('SELECT id FROM locations WHERE user_id = ?').get(userId);
  }

  const demoReviews = [
    { name: 'Sophie Martin', stars: 5, comment: 'Excellent restaurant, service impeccable et cuisine délicieuse ! Le chef est vraiment talentueux, je reviendrai sans hésiter.' },
    { name: 'Jean-Pierre Dubois', stars: 2, comment: 'Déçu par l\'attente de 45 minutes alors que le restaurant était à moitié vide. Le plat était froid à l\'arrivée.' },
    { name: 'Marie Leclerc', stars: 4, comment: 'Très bon repas dans l\'ensemble. L\'ambiance est sympa et les prix raisonnables. Petit bémol sur le dessert un peu décevant.' },
    { name: 'Thomas Bernard', stars: 5, comment: 'On y fête tous nos anniversaires depuis 5 ans ! Toujours aussi bien, le personnel nous reconnaît et c\'est vraiment agréable.' },
    { name: 'Isabelle Moreau', stars: 1, comment: 'Service désastreux, commande oubliée deux fois. Je ne recommande absolument pas cet établissement.' },
  ];

  let added = 0;
  for (const r of demoReviews) {
    const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      db.prepare('INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)').run(loc.id, id, r.name, r.stars, r.comment, 'new');
      added++;
    } catch(e) { /* ignore duplicates */ }
  }
  res.json({ ok: true, added });
});

// Synchronisation manuelle des avis
app.post('/api/sync', requireAuth, async (req, res) => {
  const locations = db.prepare('SELECT * FROM locations WHERE user_id = ? AND active = 1').all(req.session.userId);
  let newCount = 0;

  for (const loc of locations) {
    const newReviews = await fetchNewReviews(loc);
    newCount += newReviews.length;
  }

  res.json({ ok: true, newReviews: newCount });
});

// ─────────────────────────────────────────
// FONCTIONS CORE
// ─────────────────────────────────────────

async function generateResponse(review, groqKey) {
  const toneMap = {
    'chaleureux':    'chaleureux et humain, comme si tu parlais à un ami fidèle',
    'professionnel': 'professionnel et courtois, représentant parfaitement l\'établissement',
    'decontracte':   'décontracté et sympathique, avec une touche de légèreté',
    'elegant':       'élégant et raffiné, avec un vocabulaire soigné'
  };
  const toneDesc = toneMap[review.tone] || toneMap['professionnel'];

  let starRules;
  if (review.star_rating >= 4) {
    starRules = 'Remercie chaleureusement, mentionne un détail spécifique de l\'avis, invite à revenir bientôt.';
  } else if (review.star_rating === 3) {
    starRules = 'Remercie pour le retour, prends note des axes d\'amélioration mentionnés, montre que tu es à l\'écoute.';
  } else {
    starRules = 'Présente des excuses sincères et empathiques, ne te défends pas, propose une solution concrète ou un contact direct.';
  }

  const prompt = `Tu es l'assistant réponse aux avis de "${review.business_name}", un ${review.business_type || 'établissement'}.

Avis de ${review.reviewer_name || 'un client'} — Note : ${review.star_rating}/5 étoiles
"${review.comment || '(Aucun commentaire)'}"

Génère UNE réponse en français (3-5 phrases max) avec ce ton : ${toneDesc}.
RÈGLES STRICTES : ${starRules}
Ne mets pas de guillemets. Commence directement par la réponse.`;

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 250
    })
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error ${r.status}`);
  }

  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() || 'Merci beaucoup pour votre avis.';
}

async function getGoogleClient(location) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({
    access_token: location.access_token,
    refresh_token: location.refresh_token
  });

  // Auto-refresh token si expiré
  client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      db.prepare('UPDATE locations SET refresh_token = ? WHERE google_location_name = ?')
        .run(tokens.refresh_token, location.google_location_name);
    }
    if (tokens.access_token) {
      db.prepare('UPDATE locations SET access_token = ? WHERE google_location_name = ?')
        .run(tokens.access_token, location.google_location_name);
    }
  });

  return client;
}

async function postGoogleReply(location, replyText) {
  const client = await getGoogleClient(location);
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  const reviewName = location.google_review_id.includes('/')
    ? location.google_review_id
    : `${location.google_location_name}/reviews/${location.google_review_id}`;

  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: replyText })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API ${res.status}: ${err}`);
  }
}

async function fetchNewReviews(location) {
  const name = location.google_location_name || '';
  // Déléguer vers Trustpilot
  if (name.startsWith('tp_')) return fetchTrustpilotReviews(location);
  // Ignorer les locations génériques Google
  if (!location.refresh_token || name.startsWith('gmb_') || name.startsWith('manual_') || name.startsWith('demo_')) return [];

  const client = await getGoogleClient(location);
  const newReviews = [];

  try {
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${location.google_location_name}/reviews?pageSize=50`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SYNC] API ${res.status} pour ${location.business_name}:`, errText.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const reviews = data.reviews || [];
    const starMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

    for (const review of reviews) {
      if (review.reviewReply) continue;

      const reviewId = review.reviewId || review.name;
      const existing = db.prepare('SELECT id FROM reviews WHERE google_review_id = ?').get(reviewId);
      if (existing) continue;

      const starRating = starMap[review.starRating] || 0;
      const inserted = db.prepare(
        'INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(location.id, reviewId, review.reviewer?.displayName || 'Anonyme', starRating, review.comment || '', 'new');

      newReviews.push({
        id: inserted.lastInsertRowid,
        google_review_id: reviewId,
        star_rating: starRating,
        reviewer_name: review.reviewer?.displayName || 'Anonyme',
        comment: review.comment || '',
        location_id: location.id
      });
    }

    console.log(`[SYNC] ${location.business_name}: ${newReviews.length} nouveaux avis`);
  } catch (e) {
    console.error(`[SYNC] Erreur pour ${location.business_name}:`, e.message);
  }

  return newReviews;
}

// ─────────────────────────────────────────
// TRUSTPILOT FONCTIONS
// ─────────────────────────────────────────

async function fetchTrustpilotReviews(location) {
  const bizId = location.google_location_name.replace('tp_', '');
  if (!location.access_token) return [];

  try {
    let token = location.access_token;
    let res = await fetch(
      `https://api.trustpilot.com/v1/private/business-units/${bizId}/reviews?responded=false&perPage=100`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    // Auto-refresh si 401
    if (res.status === 401 && location.refresh_token && TP_API_KEY) {
      const refreshRes = await fetch('https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${TP_API_KEY}:${TP_API_SECRET}`).toString('base64')
        },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(location.refresh_token)}`
      });
      const newTokens = await refreshRes.json();
      if (newTokens.access_token) {
        token = newTokens.access_token;
        db.prepare('UPDATE locations SET access_token = ?, refresh_token = ? WHERE id = ?')
          .run(newTokens.access_token, newTokens.refresh_token || location.refresh_token, location.id);
        res = await fetch(
          `https://api.trustpilot.com/v1/private/business-units/${bizId}/reviews?responded=false&perPage=100`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
      }
    }

    if (!res.ok) {
      console.error(`[TP SYNC] ${res.status} pour ${location.business_name}`);
      return [];
    }

    const data = await res.json();
    return processTrustpilotReviews(data.reviews || [], location);
  } catch (e) {
    console.error('[TP SYNC]', e.message);
    return [];
  }
}

function processTrustpilotReviews(reviews, location) {
  const newReviews = [];
  for (const review of reviews) {
    const reviewId = `tp_${review.id}`;
    const existing = db.prepare('SELECT id FROM reviews WHERE google_review_id = ?').get(reviewId);
    if (existing) continue;

    const inserted = db.prepare(
      'INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      location.id, reviewId,
      review.consumer?.displayName || review.author?.name || 'Anonyme',
      review.stars || 0,
      review.text || '',
      'new'
    );
    newReviews.push({ id: inserted.lastInsertRowid, google_review_id: reviewId, star_rating: review.stars || 0, reviewer_name: review.consumer?.displayName || 'Anonyme', comment: review.text || '', location_id: location.id });
  }
  console.log(`[TP SYNC] ${location.business_name}: ${newReviews.length} nouveaux avis`);
  return newReviews;
}

async function postTrustpilotReply(location, reviewId, replyText) {
  const tpReviewId = reviewId.replace('tp_', '');
  const res = await fetch(`https://api.trustpilot.com/v1/private/reviews/${tpReviewId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${location.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: replyText })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Trustpilot ${res.status}: ${err}`);
  }
}

// ─────────────────────────────────────────
// CRON JOB — Auto-réponse toutes les heures
// ─────────────────────────────────────────

async function runAutoResponder() {
  const now = new Date().toLocaleTimeString('fr-FR');
  console.log(`[CRON ${now}] Vérification des nouveaux avis...`);

  const activeLocations = db.prepare(`
    SELECT l.*, u.groq_key
    FROM locations l
    JOIN users u ON l.user_id = u.id
    WHERE l.active = 1 AND l.refresh_token IS NOT NULL AND l.refresh_token != ''
  `).all();

  for (const location of activeLocations) {
    const newReviews = await fetchNewReviews(location);

    if (newReviews.length > 0) {
      console.log(`[CRON] ${newReviews.length} nouvel(s) avis pour ${location.business_name}`);
    }

    // Auto-réponse si activée ET clé Groq configurée
    if (location.auto_respond && location.groq_key && newReviews.length > 0) {
      for (const review of newReviews) {
        try {
          const dbReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(review.id);
          const mergedReview = { ...dbReview, ...location };

          const response = await generateResponse(mergedReview, location.groq_key);
          db.prepare('UPDATE reviews SET generated_response = ? WHERE id = ?').run(response, review.id);

          await postGoogleReply(mergedReview, response);
          db.prepare('UPDATE reviews SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?').run('posted', review.id);

          console.log(`[AUTO] ✅ Répondu à ${review.reviewer_name} (${review.star_rating}★) pour ${location.business_name}`);
        } catch (e) {
          console.error(`[AUTO] ❌ Erreur pour review ${review.id}:`, e.message);
          db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run('error', review.id);
        }
      }
    }
  }
}

// Toutes les heures
cron.schedule('0 * * * *', runAutoResponder);

// Au démarrage, vérifier immédiatement (après 5s)
setTimeout(runAutoResponder, 5000);

// ─────────────────────────────────────────
// DÉMARRAGE
// ─────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════╗
  ║   ReputIA — Serveur démarré      ║
  ║   http://localhost:${PORT}          ║
  ╚══════════════════════════════════╝
  `);
});
