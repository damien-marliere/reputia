require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const path = require('path');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

// node-fetch v3 workaround pour CommonJS
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// ─────────────────────────────────────────
// CONFIGURATION EMAIL (Gmail SMTP)
// ─────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// ─────────────────────────────────────────
// TEMPLATES EMAIL
// ─────────────────────────────────────────

function emailBase(content) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e}
  .wrap{max-width:620px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#05050a 0%,#1a1a28 100%);padding:32px 40px;text-align:center;border-bottom:2px solid rgba(245,158,11,.3)}
  .logo{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
  .logo-icon{width:42px;height:42px;background:linear-gradient(135deg,#f59e0b,#ef4444);border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font-size:22px}
  .logo-text{font-size:22px;font-weight:800;color:#f1f1f8;letter-spacing:-0.5px}
  .body{padding:40px}
  .footer{background:#f8f8fc;border-top:1px solid #e8e8f0;padding:24px 40px;text-align:center;font-size:12px;color:#9898b5}
  .footer a{color:#f59e0b;text-decoration:none}
  h1{font-size:26px;font-weight:800;color:#05050a;letter-spacing:-0.5px;margin-bottom:12px;line-height:1.2}
  h2{font-size:18px;font-weight:700;color:#1a1a28;margin:28px 0 12px}
  p{font-size:15px;color:#4b5563;line-height:1.7;margin-bottom:14px}
  .btn{display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#000!important;font-weight:800;font-size:16px;padding:16px 36px;border-radius:12px;text-decoration:none;margin:20px 0;box-shadow:0 4px 20px rgba(245,158,11,.35)}
  .step{background:#f8f8fc;border:1px solid #e8e8f0;border-radius:12px;padding:20px 24px;margin-bottom:12px;display:flex;align-items:flex-start;gap:16px}
  .step-num{width:36px;height:36px;min-width:36px;background:linear-gradient(135deg,#f59e0b,#f97316);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#000}
  .step-content h3{font-size:15px;font-weight:700;color:#1a1a28;margin-bottom:4px}
  .step-content p{font-size:13.5px;color:#6b7280;margin:0;line-height:1.6}
  .mockup{background:#0d0d15;border:1px solid #1e1e30;border-radius:12px;padding:16px 20px;margin:8px 0 4px;font-family:monospace}
  .mockup-bar{display:flex;gap:6px;margin-bottom:12px}
  .mockup-dot{width:10px;height:10px;border-radius:50%}
  .mockup-content{background:#12121e;border-radius:8px;padding:14px 16px}
  .mockup-btn{display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#000;font-size:12px;font-weight:700;padding:8px 16px;border-radius:6px;font-family:sans-serif}
  .mockup-text{font-size:12px;color:#9898b5;font-family:sans-serif;margin-bottom:10px}
  .highlight{background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(249,115,22,.05));border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:18px 24px;margin:16px 0}
  .highlight p{margin:0;font-size:14px;color:#92400e}
  .stat-row{display:flex;gap:12px;margin:16px 0}
  .stat{flex:1;background:#f8f8fc;border:1px solid #e8e8f0;border-radius:10px;padding:14px;text-align:center}
  .stat-num{font-size:24px;font-weight:800;color:#f59e0b}
  .stat-label{font-size:12px;color:#9ca3af;margin-top:2px}
  .divider{height:1px;background:#e8e8f0;margin:24px 0}
  .tag{display:inline-block;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:100px;font-size:12px;font-weight:600;padding:3px 10px;margin-right:6px}
  .tag.orange{background:#fff7ed;color:#ea580c;border-color:#fed7aa}
  .tag.red{background:#fef2f2;color:#dc2626;border-color:#fecaca}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">⭐</div>
      <span class="logo-text">ReputIA</span>
    </div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    © 2026 ReputIA · <a href="https://reputia.onrender.com">reputia.onrender.com</a><br>
    <a href="mailto:contact@reputia.fr">contact@reputia.fr</a> · Support disponible en français
  </div>
</div>
</body>
</html>`;
}

function emailWelcome(email) {
  return emailBase(`
    <h1>🎉 Bienvenue sur ReputIA, votre essai gratuit démarre !</h1>
    <p>Votre compte a bien été créé avec l'adresse <strong>${email}</strong>. Pendant 7 jours, ReputIA va répondre automatiquement à vos avis <strong>Google My Business</strong> à votre place.</p>

    <div class="highlight">
      <p>📌 <strong>Rappel :</strong> L'essai gratuit couvre <strong>Google My Business uniquement</strong>. Les autres plateformes (Trustpilot, TripAdvisor, etc.) sont disponibles dès l'abonnement à 29€/mois.</p>
    </div>

    <h2>🔗 Comment connecter votre Google My Business ?</h2>
    <p>Suivez ces 4 étapes simples — moins de 3 minutes chrono :</p>

    <div class="step">
      <div class="step-num">1</div>
      <div class="step-content">
        <h3>Connectez-vous à votre tableau de bord</h3>
        <p>Rendez-vous sur <strong>reputia.onrender.com</strong> et connectez-vous avec votre email et mot de passe.</p>
        <div class="mockup">
          <div class="mockup-bar"><div class="mockup-dot" style="background:#ef4444"></div><div class="mockup-dot" style="background:#f59e0b"></div><div class="mockup-dot" style="background:#22c55e"></div></div>
          <div class="mockup-content">
            <div class="mockup-text">🔒 reputia.onrender.com</div>
            <div style="background:#1a1a2e;border-radius:6px;padding:12px 14px;margin-bottom:8px">
              <div style="font-size:11px;color:#6b7280;font-family:sans-serif;margin-bottom:4px">Email</div>
              <div style="font-size:12px;color:#e5e7eb;font-family:sans-serif">${email}</div>
            </div>
            <div class="mockup-btn">Se connecter →</div>
          </div>
        </div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">2</div>
      <div class="step-content">
        <h3>Cliquez sur "Connecter Google My Business"</h3>
        <p>Sur votre tableau de bord, vous verrez le bouton de connexion Google. Cliquez dessus — une fenêtre Google s'ouvre.</p>
        <div class="mockup">
          <div class="mockup-bar"><div class="mockup-dot" style="background:#ef4444"></div><div class="mockup-dot" style="background:#f59e0b"></div><div class="mockup-dot" style="background:#22c55e"></div></div>
          <div class="mockup-content">
            <div class="mockup-text">Tableau de bord ReputIA</div>
            <div style="display:flex;gap:8px;align-items:center;background:#1a1a2e;border-radius:8px;padding:12px 14px">
              <span style="font-size:18px">🔍</span>
              <div>
                <div style="font-size:12px;color:#e5e7eb;font-family:sans-serif;font-weight:600">Google My Business</div>
                <div style="font-size:11px;color:#6b7280;font-family:sans-serif">Non connecté</div>
              </div>
              <div class="mockup-btn" style="margin-left:auto;font-size:11px;padding:6px 12px">Connecter →</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">3</div>
      <div class="step-content">
        <h3>Autorisez l'accès Google</h3>
        <p>Google vous demande d'autoriser ReputIA à accéder à vos avis. Cliquez sur <strong>"Autoriser"</strong> — ReputIA n'a accès qu'à vos avis, rien d'autre.</p>
        <div class="mockup">
          <div class="mockup-bar"><div class="mockup-dot" style="background:#ef4444"></div><div class="mockup-dot" style="background:#f59e0b"></div><div class="mockup-dot" style="background:#22c55e"></div></div>
          <div class="mockup-content" style="text-align:center">
            <div style="font-size:22px;margin-bottom:8px">🔍</div>
            <div style="font-size:12px;color:#e5e7eb;font-family:sans-serif;font-weight:600;margin-bottom:4px">Google veut accéder à :</div>
            <div style="font-size:11px;color:#9898b5;font-family:sans-serif;margin-bottom:12px">✓ Lire vos avis Google<br>✓ Répondre à vos avis</div>
            <div class="mockup-btn">Autoriser l'accès</div>
          </div>
        </div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">4</div>
      <div class="step-content">
        <h3>Sélectionnez votre établissement</h3>
        <p>ReputIA détecte automatiquement vos établissements Google. Sélectionnez celui que vous voulez activer et choisissez votre ton de réponse (chaleureux, pro, etc.).</p>
        <div class="mockup">
          <div class="mockup-bar"><div class="mockup-dot" style="background:#ef4444"></div><div class="mockup-dot" style="background:#f59e0b"></div><div class="mockup-dot" style="background:#22c55e"></div></div>
          <div class="mockup-content">
            <div class="mockup-text">Vos établissements Google</div>
            <div style="background:#1a1a2e;border-radius:6px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
              <span style="font-size:14px">🏪</span>
              <div>
                <div style="font-size:12px;color:#e5e7eb;font-family:sans-serif;font-weight:600">Votre Établissement</div>
                <div style="font-size:10px;color:#22c55e;font-family:sans-serif">● Actif — Répond automatiquement</div>
              </div>
            </div>
            <div class="mockup-btn" style="font-size:11px;padding:6px 12px">✅ Activé</div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div style="text-align:center">
      <a href="https://reputia.onrender.com" class="btn">🚀 Accéder à mon tableau de bord</a>
    </div>

    <p style="font-size:13px;color:#9ca3af;text-align:center">Une question ? Répondez simplement à cet email — on est là.</p>
  `);
}

function emailDay5(email) {
  return emailBase(`
    <div style="background:linear-gradient(135deg,rgba(249,115,22,.08),rgba(239,68,68,.05));border:1px solid rgba(249,115,22,.25);border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
      <div style="font-size:28px;margin-bottom:6px">⏳</div>
      <div style="font-size:15px;font-weight:700;color:#ea580c">Plus que 2 jours d'essai gratuit</div>
    </div>

    <h1>Votre e-réputation tourne toute seule.<br>Ne la laissez pas s'arrêter.</h1>
    <p>Bonjour,<br>Votre essai ReputIA se termine dans <strong>48 heures</strong>. Depuis 5 jours, ReputIA répond à vos avis Google à votre place — en moins de 60 secondes à chaque fois.</p>

    <div class="stat-row">
      <div class="stat">
        <div class="stat-num">100%</div>
        <div class="stat-label">Avis répondus<br>automatiquement</div>
      </div>
      <div class="stat">
        <div class="stat-num">&lt;60s</div>
        <div class="stat-label">Délai moyen<br>de réponse</div>
      </div>
      <div class="stat">
        <div class="stat-num">0 min</div>
        <div class="stat-label">Temps passé<br>par vous</div>
      </div>
    </div>

    <div class="highlight">
      <p>💡 <strong>Le saviez-vous ?</strong> Les établissements qui répondent à leurs avis voient leur note Google augmenter en moyenne de <strong>+0.4 étoile en 60 jours</strong>. Ne laissez pas vos concurrents prendre de l'avance.</p>
    </div>

    <h2>Ce que vous obtenez pour 29€/mois</h2>
    <p>
      <span class="tag">✓ Google My Business</span>
      <span class="tag">✓ Trustpilot</span>
      <span class="tag">✓ TripAdvisor</span>
    </p>
    <p style="margin-top:10px">
      <span class="tag">✓ Pages Jaunes</span>
      <span class="tag">✓ Booking.com</span>
      <span class="tag">✓ Airbnb</span>
    </p>
    <p style="margin-top:4px;font-size:13px;color:#6b7280">+ 6 autres plateformes · Réponses illimitées · Support 🇫🇷</p>

    <div class="divider"></div>

    <div style="text-align:center">
      <p style="font-size:16px;font-weight:700;color:#1a1a28;margin-bottom:6px">Continuez sans interruption — 29€/mois</p>
      <p style="font-size:13px;color:#9ca3af;margin-bottom:16px">Sans engagement · Annulation en 1 clic · Remboursé 30 jours</p>
      <a href="https://buy.stripe.com/3cIfZjct64a9gSAeRx3VC09" class="btn">🔑 Activer mon abonnement →</a>
    </div>

    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:8px">Des questions ? Écrivez-nous à <a href="mailto:contact@reputia.fr" style="color:#f59e0b">contact@reputia.fr</a></p>
  `);
}

function emailDay7(email) {
  return emailBase(`
    <div style="background:linear-gradient(135deg,rgba(239,68,68,.08),rgba(220,38,38,.05));border:1px solid rgba(239,68,68,.25);border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
      <div style="font-size:28px;margin-bottom:6px">🔒</div>
      <div style="font-size:15px;font-weight:700;color:#dc2626">Votre essai gratuit est terminé</div>
    </div>

    <h1>Vos avis Google sont de nouveau<br>sans réponse automatique.</h1>
    <p>Bonjour,<br>Votre essai de 7 jours s'est terminé. ReputIA a été mis en pause sur votre compte.</p>

    <p>À partir de maintenant, chaque avis Google qui arrive sur votre fiche <strong>restera sans réponse</strong> — jusqu'à ce que vous le fassiez manuellement. Vos concurrents qui utilisent ReputIA, eux, répondent toujours en moins de 60 secondes.</p>

    <div class="highlight" style="background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(249,115,22,.05));border-color:rgba(245,158,11,.25)">
      <p>⭐ <strong>L'abonnement ReputIA à 29€/mois</strong>, c'est moins de <strong>1€ par jour</strong> pour ne plus jamais penser à vos avis. Réactivez en 1 clic — aucune nouvelle configuration nécessaire.</p>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="stat-num" style="font-size:18px;color:#dc2626">❌</div>
        <div class="stat-label">Sans abonnement<br>Avis sans réponse</div>
      </div>
      <div class="stat">
        <div class="stat-num" style="font-size:18px;color:#16a34a">✅</div>
        <div class="stat-label">Avec abonnement<br>Réponse en &lt;60s</div>
      </div>
      <div class="stat">
        <div class="stat-num">29€</div>
        <div class="stat-label">Par mois<br>TTC · Sans engagement</div>
      </div>
    </div>

    <div class="divider"></div>

    <div style="text-align:center">
      <p style="font-size:18px;font-weight:800;color:#1a1a28;margin-bottom:6px">Réactivez ReputIA maintenant</p>
      <p style="font-size:13px;color:#9ca3af;margin-bottom:20px">Votre configuration est sauvegardée · Remboursé 30 jours si insatisfait</p>
      <a href="https://buy.stripe.com/3cIfZjct64a9gSAeRx3VC09" class="btn">🚀 Réactiver mon abonnement — 29€/mois</a>
    </div>

    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:16px">Vous avez une question ou un problème avec votre essai ?<br><a href="mailto:contact@reputia.fr" style="color:#f59e0b">Écrivez-nous</a> — on répond sous 24h.</p>
  `);
}

function emailOnboarding(email) {
  const platformGuide = (icon, name, type, steps) => `
    <div style="background:#f8f8fc;border:1px solid #e8e8f0;border-radius:12px;padding:20px 24px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="font-size:22px">${icon}</span>
        <div>
          <div style="font-size:15px;font-weight:700;color:#1a1a28">${name}</div>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:100px;${type==='auto'?'background:#dcfce7;color:#16a34a':'background:#fef9c3;color:#ca8a04'}">${type==='auto'?'✅ 100% Automatique':'⚡ Semi-automatique'}</span>
        </div>
      </div>
      ${steps.map((s,i)=>`<div style="display:flex;gap:10px;margin-bottom:8px"><div style="width:22px;height:22px;min-width:22px;background:linear-gradient(135deg,#f59e0b,#f97316);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#000">${i+1}</div><div style="font-size:13px;color:#4b5563;line-height:1.5;padding-top:2px">${s}</div></div>`).join('')}
    </div>`;

  return emailBase(`
    <h1>🎉 Votre abonnement ReputIA est actif !</h1>
    <p>Bienvenue dans ReputIA Pro. Voici votre guide complet pour connecter toutes vos plateformes et activer les réponses automatiques.</p>

    <div style="background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(249,115,22,.05));border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:16px 20px;margin-bottom:28px">
      <p style="margin:0;font-size:14px;color:#92400e">📌 <strong>Accédez à votre tableau de bord :</strong> <a href="https://reputia.onrender.com" style="color:#f59e0b;font-weight:700">reputia.onrender.com</a> → Connectez-vous → Section "Plateformes"</p>
    </div>

    <h2 style="margin-bottom:16px">✅ Plateformes 100% automatiques</h2>
    <p style="font-size:13.5px;color:#6b7280;margin-bottom:16px">Une fois connectées, ReputIA répond sans que vous ayez rien à faire.</p>

    ${platformGuide('🔍','Google My Business','auto',[
      'Tableau de bord → <strong>Connecter Google My Business</strong>',
      'Une fenêtre Google s\'ouvre → connectez-vous avec le compte propriétaire de votre fiche',
      'Cliquez <strong>"Autoriser"</strong> → ReputIA détecte automatiquement vos établissements',
      'Sélectionnez votre établissement → choisissez votre ton → <strong>Activer</strong>'
    ])}
    ${platformGuide('⭐','Trustpilot','auto',[
      'Tableau de bord → <strong>Connecter Trustpilot</strong>',
      'Entrez votre <strong>Business ID Trustpilot</strong> (trouvez-le dans votre profil Trustpilot Business)',
      'Une fenêtre Trustpilot s\'ouvre → connectez-vous et autorisez l\'accès',
      'Vos avis sont désormais surveillés et répondus automatiquement'
    ])}

    <h2 style="margin:24px 0 12px">⚡ Plateformes semi-automatiques</h2>
    <p style="font-size:13.5px;color:#6b7280;margin-bottom:16px">ReputIA détecte les avis et génère la réponse. Vous recevez un <strong>email avec la réponse prête</strong> — il suffit de la copier-coller en 10 secondes.</p>

    ${platformGuide('🧭','TripAdvisor','semi',[
      'Tableau de bord → <strong>Connecter TripAdvisor</strong> → collez l\'URL de votre page TripAdvisor',
      'Exemple : <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">https://www.tripadvisor.fr/Restaurant_Review-gXXX-dXXX</code>',
      'ReputIA surveille les nouveaux avis et vous envoie la réponse générée par email'
    ])}
    ${platformGuide('📒','Pages Jaunes','semi',[
      'Tableau de bord → <strong>Connecter Pages Jaunes</strong> → collez l\'URL de votre fiche',
      'Exemple : <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">https://www.pagesjaunes.fr/pros/XXXXXXX</code>',
      'Vous recevrez un email dès qu\'un nouvel avis est détecté'
    ])}
    ${platformGuide('🏨','Booking.com','semi',[
      'Tableau de bord → <strong>Connecter Booking</strong> → collez l\'URL de votre établissement Booking',
      'Exemple : <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">https://www.booking.com/hotel/fr/votre-hotel.fr.html</code>',
      'La réponse IA vous est envoyée par email à chaque nouvel avis'
    ])}
    ${platformGuide('🍴','TheFork / LaFourchette','semi',[
      'Tableau de bord → <strong>Connecter TheFork</strong> → collez l\'URL de votre restaurant',
      'Exemple : <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">https://www.thefork.fr/restaurant/votre-restaurant-rXXXXXX</code>'
    ])}
    ${platformGuide('🏠','Airbnb','semi',[
      'Tableau de bord → <strong>Connecter Airbnb</strong> → collez l\'URL de votre logement Airbnb',
      'Exemple : <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px">https://www.airbnb.fr/rooms/XXXXXXX</code>'
    ])}

    <div style="height:1px;background:#e8e8f0;margin:28px 0"></div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#15803d">💡 <strong>Conseil pro :</strong> Commencez par Google My Business (automatique) — vous verrez les premiers résultats dans l'heure. Ajoutez les autres plateformes au fur et à mesure.</p>
    </div>

    <div style="text-align:center">
      <a href="https://reputia.onrender.com" class="btn">🚀 Accéder à mon tableau de bord</a>
    </div>
    <p style="font-size:13px;color:#9ca3af;text-align:center">Une question ? <a href="mailto:contact@reputia.fr" style="color:#f59e0b">contact@reputia.fr</a> — réponse sous 24h 🇫🇷</p>
  `);
}

const PLATFORM_MANAGE_URLS = {
  'TripAdvisor':    'https://www.tripadvisor.fr/BusinessListingMember',
  'Pages Jaunes':   'https://annonceurs.pagesjaunes.fr/avis-clients',
  'TheFork':        'https://manager.thefork.com/fr/reviews',
  'Booking.com':    'https://extranet.booking.com',
  'Airbnb':         'https://www.airbnb.fr/hosting/reviews',
  'Avis Vérifiés':  'https://www.avis-verifies.com/administration/avis',
  'Amazon Seller':  'https://sellercentral.amazon.fr/gp/feedback-manager/view-all-feedback.html',
  'Yelp':           'https://biz.yelp.fr/reviews',
  'Facebook':       'https://www.facebook.com/latest/pages/manage',
  'Custplace':      'https://app.custplace.com/reviews'
};

function emailSemiAutoReview(userEmail, reviewerName, platform, stars, reviewText, aiResponse, businessName, reviewId) {
  const starDisplay = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const starColor = stars >= 4 ? '#f59e0b' : stars >= 3 ? '#f97316' : '#ef4444';
  const platformIcons = { tripadvisor:'🧭', facebook:'📘', pagesjaunes:'📒', thefork:'🍴', booking:'🏨', airbnb:'🏠', 'avis vérifiés':'✔️', amazon:'📦', yelp:'🔵', custplace:'💬' };
  const icon = platformIcons[platform?.toLowerCase()] || '⭐';
  const manageUrl = PLATFORM_MANAGE_URLS[platform] || '#';
  const replyPageUrl = `https://reputia.onrender.com/reply/${reviewId}`;

  return emailBase(`
    <div style="background:linear-gradient(135deg,rgba(59,130,246,.07),rgba(139,92,246,.05));border:1px solid rgba(59,130,246,.2);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
      <span style="font-size:24px">${icon}</span>
      <div>
        <div style="font-size:14px;font-weight:700;color:#1a1a28">Nouvel avis détecté — ${platform}</div>
        <div style="font-size:12px;color:#6b7280">Pour : <strong>${businessName}</strong></div>
      </div>
      <div style="margin-left:auto;font-size:18px;font-weight:800;color:${starColor}">${starDisplay}</div>
    </div>

    <h1 style="font-size:22px">📬 Un avis attend votre réponse</h1>
    <p>ReputIA a détecté un nouvel avis sur <strong>${platform}</strong> et a généré une réponse personnalisée. <strong>Copiez-collez la réponse en 10 secondes</strong> sur la plateforme.</p>

    <h2>L'avis de ${reviewerName}</h2>
    <div style="background:#f8f8fc;border-left:3px solid ${starColor};border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff">${reviewerName.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#1a1a28">${reviewerName}</div>
          <div style="font-size:12px;color:${starColor};font-weight:700">${starDisplay} (${stars}/5)</div>
        </div>
      </div>
      <p style="font-size:14px;color:#4b5563;line-height:1.7;font-style:italic;margin:0">"${reviewText || '(Pas de commentaire)'}"</p>
    </div>

    <h2>La réponse générée par ReputIA</h2>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;position:relative">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700">⚡ ReputIA — Réponse IA</span>
        <span style="font-size:11px;color:#9ca3af">Prête à copier-coller</span>
      </div>
      <p style="font-size:14px;color:#1a1a28;line-height:1.75;margin:0">${aiResponse}</p>
    </div>

    <h2>Comment publier cette réponse ?</h2>
    <div style="background:#f8f8fc;border:1px solid #e8e8f0;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="width:24px;height:24px;min-width:24px;background:linear-gradient(135deg,#f59e0b,#f97316);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#000">1</div>
        <div style="font-size:13.5px;color:#374151;padding-top:2px"><strong>Copiez</strong> la réponse ci-dessus (sélectionnez tout le texte)</div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="width:24px;height:24px;min-width:24px;background:linear-gradient(135deg,#f59e0b,#f97316);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#000">2</div>
        <div style="font-size:13.5px;color:#374151;padding-top:2px">Connectez-vous à votre compte <strong>${platform}</strong></div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="width:24px;height:24px;min-width:24px;background:linear-gradient(135deg,#f59e0b,#f97316);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#000">3</div>
        <div style="font-size:13.5px;color:#374151;padding-top:2px">Trouvez l'avis de <strong>${reviewerName}</strong> → cliquez <strong>"Répondre"</strong></div>
      </div>
      <div style="display:flex;gap:10px">
        <div style="width:24px;height:24px;min-width:24px;background:linear-gradient(135deg,#f59e0b,#f97316);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#000">4</div>
        <div style="font-size:13.5px;color:#374151;padding-top:2px"><strong>Collez</strong> la réponse → cliquez <strong>"Publier"</strong> ✅</div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:16px">
      <a href="${replyPageUrl}" class="btn" style="font-size:16px;display:inline-block;margin-bottom:12px">📋 Copier la réponse &amp; Publier en 1 clic</a>
      <br>
      <a href="${manageUrl}" target="_blank" style="display:inline-block;background:#1a1a28;color:#f1f1f8;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;border:1px solid #2d2d45">
        ${icon} Ouvrir mon espace ${platform} →
      </a>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center">Ou accédez à <a href="https://reputia.onrender.com/dashboard.html" style="color:#f59e0b">votre tableau de bord</a> pour voir tous vos avis en attente.</p>
  `);
}

async function sendEmail(to, subject, html) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.log(`[EMAIL] Config manquante (MAIL_USER/MAIL_PASS) — email non envoyé à ${to}`);
    return;
  }
  try {
    await emailTransporter.sendMail({
      from: `"ReputIA" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log(`[EMAIL] ✅ Envoyé à ${to} — ${subject}`);
  } catch (e) {
    console.error(`[EMAIL] ❌ Erreur envoi à ${to}:`, e.message);
  }
}

const app = express();

// ─────────────────────────────────────────
// CONFIG PLATEFORMES
// ─────────────────────────────────────────
const PLATFORM_CONFIG = {
  tripadvisor:  { prefix: 'ta_',  name: 'TripAdvisor',           icon: '🧭', needsUrl: true,  needsToken: false },
  facebook:     { prefix: 'fb_',  name: 'Facebook',              icon: '📘', needsUrl: true,  needsToken: true  },
  pagesjaunes:  { prefix: 'pj_',  name: 'Pages Jaunes',          icon: '📒', needsUrl: true,  needsToken: false },
  thefork:      { prefix: 'tf_',  name: 'TheFork / LaFourchette',icon: '🍽️', needsUrl: true,  needsToken: false },
  booking:      { prefix: 'bk_',  name: 'Booking.com',           icon: '🏨', needsUrl: true,  needsToken: false },
  airbnb:       { prefix: 'ab_',  name: 'Airbnb',                icon: '🏠', needsUrl: true,  needsToken: false },
  avisverifies: { prefix: 'av_',  name: 'Avis Vérifiés',         icon: '✅', needsUrl: true,  needsToken: false },
  amazon:       { prefix: 'az_',  name: 'Amazon Seller',         icon: '📦', needsUrl: true,  needsToken: false },
  yelp:         { prefix: 'yl_',  name: 'Yelp',                  icon: '🔵', needsUrl: true,  needsToken: true  },
  custplace:    { prefix: 'cu_',  name: 'Custplace',             icon: '💬', needsUrl: true,  needsToken: false },
  glassdoor:    { prefix: 'gl_',  name: 'Glassdoor',             icon: '💼', needsUrl: true,  needsToken: false },
  indeed:       { prefix: 'id_',  name: 'Indeed',                icon: '💼', needsUrl: true,  needsToken: false },
  doctolib:     { prefix: 'do_',  name: 'Doctolib',              icon: '🏥', needsUrl: true,  needsToken: false },
  holidaycheck: { prefix: 'hc_',  name: 'Holidaycheck',          icon: '🏖️', needsUrl: true,  needsToken: false },
  cdiscount:    { prefix: 'cd_',  name: 'Cdiscount',             icon: '🛍️', needsUrl: true,  needsToken: false },
  appstore:     { prefix: 'as_',  name: 'App Store',             icon: '📱', needsUrl: true,  needsToken: false },
  playstore:    { prefix: 'ps_',  name: 'Play Store',            icon: '▶️', needsUrl: true,  needsToken: false }
};

// Scrape headers réalistes
const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

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
  platform_url          TEXT DEFAULT '',
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

// Migrations pour colonnes éventuellement manquantes
try { db.exec("ALTER TABLE locations ADD COLUMN platform_url TEXT DEFAULT ''") } catch(e) {}

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

const requireActivePlan = (req, res, next) => {
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.plan === 'expired') {
    return res.status(403).json({ error: 'Essai terminé', expired: true, stripeUrl: 'https://buy.stripe.com/3cIfZjct64a9gSAeRx3VC09' });
  }
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
    // Email de bienvenue
    sendEmail(email, '🎉 Bienvenue sur ReputIA — Connectez Google My Business maintenant', emailWelcome(email));
    res.json({ ok: true });
  } catch (e) {
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
  if (user.plan === 'expired') return res.json({ ok: false, expired: true });
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

    try {
      const accountMgmt = google.mybusinessaccountmanagement({ version: 'v1', auth: oauth2Client });
      const accountsRes = await accountMgmt.accounts.list();
      const accounts = accountsRes.data.accounts || [];
      console.log('[OAuth] Comptes GMB:', accounts.length);

      for (const account of accounts) {
        const locName = account.name;
        const bizName = account.accountName || 'Mon établissement';

        try {
          const bizInfo = google.mybusinessbusinessinformation({ version: 'v1', auth: oauth2Client });
          const locsRes = await bizInfo.accounts.locations.list({
            parent: account.name,
            readMask: 'name,title'
          });
          const locs = locsRes.data.locations || [];

          for (const loc of locs) {
            const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(loc.name, userId);
            if (existing) {
              db.prepare('UPDATE locations SET access_token = ?, refresh_token = ? WHERE id = ?').run(tokens.access_token || '', tokens.refresh_token || '', existing.id);
            } else {
              db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, loc.name, loc.title || bizName, tokens.access_token || '', tokens.refresh_token || '');
              locationCount++;
            }
          }
        } catch (e2) {
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
    console.error('Erreur OAuth callback:', e.message);
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

    const meRes = await fetch('https://api.trustpilot.com/v1/private/business-users/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const meData = await meRes.json();
    const businessUnitId = meData.businessUnitId || meData.id;
    const bizName = meData.name || 'Mon établissement Trustpilot';
    if (!businessUnitId) throw new Error('businessUnitId introuvable');

    const locName = `tp_${businessUnitId}`;
    const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(locName, userId);
    if (existing) {
      db.prepare('UPDATE locations SET access_token = ?, refresh_token = ?, business_name = ? WHERE id = ?')
        .run(tokens.access_token, tokens.refresh_token || '', bizName, existing.id);
    } else {
      db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)')
        .run(userId, locName, bizName, tokens.access_token, tokens.refresh_token || '');
    }
    res.redirect('/dashboard.html?tp_connected=1');
  } catch (e) {
    console.error('[TP OAuth]', e.message);
    res.redirect('/dashboard.html?error=tp_failed');
  }
});

// ─────────────────────────────────────────
// ROUTES PLATEFORMES (URL-based)
// ─────────────────────────────────────────

// GET /api/platforms — statut de chaque plateforme
app.get('/api/platforms', requireAuth, requireActivePlan, (req, res) => {
  const userId = req.session.userId;
  const result = {};

  // Google
  const googleLoc = db.prepare(`
    SELECT id FROM locations WHERE user_id = ? AND active = 1
    AND google_location_name NOT LIKE 'tp_%'
    AND google_location_name NOT LIKE 'ta_%'
    AND google_location_name NOT LIKE 'fb_%'
    AND google_location_name NOT LIKE 'pj_%'
    AND google_location_name NOT LIKE 'tf_%'
    AND google_location_name NOT LIKE 'bk_%'
    AND google_location_name NOT LIKE 'ab_%'
    AND google_location_name NOT LIKE 'av_%'
    AND google_location_name NOT LIKE 'az_%'
    AND google_location_name NOT LIKE 'manual_%'
    AND google_location_name NOT LIKE 'demo_%'
  `).get(userId);
  result.google = { connected: !!googleLoc, type: 'oauth' };

  // Trustpilot
  const tpLoc = db.prepare("SELECT id FROM locations WHERE user_id = ? AND active = 1 AND google_location_name LIKE 'tp_%'").get(userId);
  result.trustpilot = { connected: !!tpLoc, type: 'oauth' };

  // Autres plateformes URL-based
  for (const [key, cfg] of Object.entries(PLATFORM_CONFIG)) {
    const loc = db.prepare(`SELECT id, platform_url, business_name FROM locations WHERE user_id = ? AND active = 1 AND google_location_name LIKE '${cfg.prefix}%'`).get(userId);
    result[key] = {
      connected: !!loc,
      url: loc?.platform_url || '',
      name: loc?.business_name || '',
      type: key === 'facebook' ? 'oauth' : 'url'
    };
  }

  res.json(result);
});

// POST /api/platforms/connect — connecter une plateforme via URL
app.post('/api/platforms/connect', requireAuth, async (req, res) => {
  const { platform, url, token, business_name } = req.body;
  const userId = req.session.userId;

  const cfg = PLATFORM_CONFIG[platform];
  if (!cfg) return res.json({ error: 'Plateforme inconnue' });
  if (!url && !token) return res.json({ error: 'URL requise' });

  const bizName = business_name || `Mon établissement (${cfg.name})`;

  const existing = db.prepare(`SELECT id FROM locations WHERE user_id = ? AND google_location_name LIKE '${cfg.prefix}%'`).get(userId);

  if (existing) {
    db.prepare('UPDATE locations SET platform_url = ?, access_token = ?, business_name = ?, active = 1 WHERE id = ?')
      .run(url || '', token || '', bizName, existing.id);
  } else {
    const locName = `${cfg.prefix}${userId}_${Date.now()}`;
    db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, platform_url, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, locName, bizName, url || '', token || '', '');
  }

  // Sync immédiat
  const loc = db.prepare(`SELECT * FROM locations WHERE user_id = ? AND google_location_name LIKE '${cfg.prefix}%' AND active = 1`).get(userId);
  let synced = 0;
  if (loc) {
    try {
      const reviews = await fetchNewReviews(loc);
      synced = reviews.length;
    } catch(e) {
      console.error('[CONNECT SYNC]', e.message);
    }
  }

  res.json({ ok: true, synced });
});

// POST /api/platforms/:platform/sync — synchroniser une plateforme
app.post('/api/platforms/:platform/sync', requireAuth, async (req, res) => {
  const { platform } = req.params;
  const userId = req.session.userId;

  const cfg = PLATFORM_CONFIG[platform];
  if (!cfg) return res.json({ error: 'Plateforme inconnue' });

  const loc = db.prepare(`SELECT * FROM locations WHERE user_id = ? AND google_location_name LIKE '${cfg.prefix}%' AND active = 1`).get(userId);
  if (!loc) return res.json({ error: 'Plateforme non connectée' });

  try {
    const reviews = await fetchNewReviews(loc);
    res.json({ ok: true, newReviews: reviews.length });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// DELETE /api/platforms/:platform — déconnecter
app.delete('/api/platforms/:platform', requireAuth, (req, res) => {
  const { platform } = req.params;
  const userId = req.session.userId;

  const cfg = PLATFORM_CONFIG[platform];
  if (!cfg) return res.json({ error: 'Plateforme inconnue' });

  db.prepare(`UPDATE locations SET active = 0 WHERE user_id = ? AND google_location_name LIKE '${cfg.prefix}%'`).run(userId);
  res.json({ ok: true });
});

// ─────────────────────────────────────────
// ROUTES ÉTABLISSEMENTS
// ─────────────────────────────────────────

app.get('/api/locations', requireAuth, requireActivePlan, (req, res) => {
  const locations = db.prepare(
    'SELECT id, business_name, business_type, google_location_name, platform_url, auto_respond, tone, active, created_at FROM locations WHERE user_id = ? AND active = 1'
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

app.get('/api/reviews', requireAuth, requireActivePlan, (req, res) => {
  const { status, location_id } = req.query;
  let query = `
    SELECT r.*, l.business_name, l.tone, l.business_type, l.google_location_name
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

app.get('/api/stats', requireAuth, requireActivePlan, (req, res) => {
  const userId = req.session.userId;
  const total    = db.prepare(`SELECT COUNT(*) as n FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ?`).get(userId).n;
  const posted   = db.prepare(`SELECT COUNT(*) as n FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ? AND r.status = 'posted'`).get(userId).n;
  const pending  = db.prepare(`SELECT COUNT(*) as n FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ? AND r.status IN ('new','generated')`).get(userId).n;
  const avgStars = db.prepare(`SELECT AVG(star_rating) as avg FROM reviews r JOIN locations l ON r.location_id = l.id WHERE l.user_id = ?`).get(userId).avg;
  res.json({ total, posted, pending, avgStars: avgStars ? Math.round(avgStars * 10) / 10 : 0 });
});

app.post('/api/reviews/:id/generate', requireAuth, async (req, res) => {
  const review = db.prepare(`
    SELECT r.*, l.user_id, l.tone, l.business_name, l.business_type
    FROM reviews r JOIN locations l ON r.location_id = l.id
    WHERE r.id = ? AND l.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!review) return res.status(404).json({ error: 'Avis non trouvé' });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.json({ error: 'Service IA temporairement indisponible' });

  try {
    const response = await generateResponse(review, groqKey);
    db.prepare('UPDATE reviews SET generated_response = ?, status = ? WHERE id = ?').run(response, 'generated', review.id);
    res.json({ ok: true, response });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/reviews/:id/post', requireAuth, async (req, res) => {
  const review = db.prepare(`
    SELECT r.*, l.user_id, l.access_token, l.refresh_token, l.google_location_name, l.tone, l.business_name, l.business_type
    FROM reviews r JOIN locations l ON r.location_id = l.id
    WHERE r.id = ? AND l.user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!review) return res.status(404).json({ error: 'Avis non trouvé' });
  if (!review.generated_response) return res.json({ error: 'Génère d\'abord une réponse' });

  try {
    const name = review.google_location_name || '';
    if (name.startsWith('tp_')) {
      await postTrustpilotReply(review, review.google_review_id, review.generated_response);
    } else if (name.startsWith('google') || review.refresh_token) {
      await postGoogleReply(review, review.generated_response);
    } else {
      // Autres plateformes → marqué comme "posté" manuellement
      console.log(`[POST] Réponse marquée manuellement pour ${name}`);
    }
    db.prepare('UPDATE reviews SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?').run('posted', review.id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: 'Erreur API: ' + e.message });
  }
});

app.put('/api/reviews/:id/response', requireAuth, (req, res) => {
  const { response } = req.body;
  const review = db.prepare(`
    SELECT r.id FROM reviews r JOIN locations l ON r.location_id = l.id WHERE r.id = ? AND l.user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!review) return res.status(404).json({ error: 'Avis non trouvé' });
  db.prepare('UPDATE reviews SET generated_response = ? WHERE id = ?').run(response, req.params.id);
  res.json({ ok: true });
});

app.post('/api/refresh-locations', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const loc = db.prepare('SELECT * FROM locations WHERE user_id = ?').get(userId);
  if (!loc || !loc.refresh_token) return res.json({ error: 'Pas de connexion Google trouvée' });

  try {
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ access_token: loc.access_token, refresh_token: loc.refresh_token });
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    const accountMgmt = google.mybusinessaccountmanagement({ version: 'v1', auth: client });
    const accountsRes = await accountMgmt.accounts.list();
    const accounts = accountsRes.data.accounts || [];

    if (accounts.length === 0) return res.json({ error: 'Aucun compte Google My Business trouvé' });

    let updated = 0;
    for (const account of accounts) {
      const locsRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (locsRes.ok) {
        const locsData = await locsRes.json();
        for (const location of (locsData.locations || [])) {
          const existing = db.prepare('SELECT id FROM locations WHERE google_location_name = ? AND user_id = ?').get(location.name, userId);
          if (existing) {
            db.prepare('UPDATE locations SET business_name = ? WHERE id = ?').run(location.title || 'Mon établissement', existing.id);
          } else {
            db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)').run(userId, location.name, location.title || 'Mon établissement', loc.access_token || '', loc.refresh_token || '');
          }
          updated++;
        }
      } else {
        db.prepare('UPDATE locations SET google_location_name = ?, business_name = ? WHERE user_id = ?').run(account.name, account.accountName || 'Mon établissement', userId);
        updated++;
      }
    }

    db.prepare("DELETE FROM locations WHERE user_id = ? AND google_location_name LIKE 'gmb_%'").run(userId);
    res.json({ ok: true, updated });
  } catch (e) {
    res.json({ error: e.message });
  }
});

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

app.post('/api/demo', requireAuth, (req, res) => {
  const userId = req.session.userId;

  let loc = db.prepare('SELECT id FROM locations WHERE user_id = ?').get(userId);
  if (!loc) {
    db.prepare('INSERT INTO locations (user_id, google_location_name, business_name, business_type, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, `gmb_demo_${userId}`, 'Mon Restaurant', 'restaurant', '', '');
    loc = db.prepare('SELECT id FROM locations WHERE user_id = ?').get(userId);
  }

  const demoReviews = [
    { name: 'Sophie Martin', stars: 5, comment: 'Excellent restaurant, service impeccable et cuisine délicieuse !' },
    { name: 'Jean-Pierre Dubois', stars: 2, comment: 'Déçu par l\'attente de 45 minutes alors que le restaurant était à moitié vide.' },
    { name: 'Marie Leclerc', stars: 4, comment: 'Très bon repas dans l\'ensemble. L\'ambiance est sympa et les prix raisonnables.' },
    { name: 'Thomas Bernard', stars: 5, comment: 'On y fête tous nos anniversaires depuis 5 ans ! Toujours aussi bien.' },
    { name: 'Isabelle Moreau', stars: 1, comment: 'Service désastreux, commande oubliée deux fois. Je ne recommande pas.' },
  ];

  let added = 0;
  for (const r of demoReviews) {
    const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      db.prepare('INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)').run(loc.id, id, r.name, r.stars, r.comment, 'new');
      added++;
    } catch(e) {}
  }
  res.json({ ok: true, added });
});

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
// HELPERS SCRAPING JSON-LD
// ─────────────────────────────────────────

function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function extractJsonLdReviews(html) {
  const reviews = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const raw = match[1].trim();
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (!item) continue;

        // Direct Review object
        if (item['@type'] === 'Review') {
          const r = parseJsonLdReview(item);
          if (r) reviews.push(r);
        }

        // Reviews embedded in business listing
        const subReviews = item.review || item.reviews || [];
        const arr = Array.isArray(subReviews) ? subReviews : [subReviews];
        for (const sub of arr) {
          if (sub && (sub['@type'] === 'Review' || sub.reviewRating)) {
            const r = parseJsonLdReview(sub);
            if (r) reviews.push(r);
          }
        }
      }
    } catch(e) {}
  }

  return reviews;
}

function parseJsonLdReview(item) {
  if (!item) return null;
  const ratingVal = item.reviewRating?.ratingValue ?? item.starRating?.ratingValue ?? null;
  const author = item.author?.name || (typeof item.author === 'string' ? item.author : null) || 'Anonyme';
  const text = item.reviewBody || item.description || item.text || '';
  if (!ratingVal && !text) return null;
  return {
    stars: Math.min(5, Math.max(1, Math.round(parseFloat(ratingVal) || 3))),
    author: String(author).slice(0, 100),
    text: String(text).slice(0, 2000)
  };
}

function storeScrapedReviews(reviews, location, prefix) {
  const newReviews = [];
  for (const r of reviews) {
    // ID stable basé sur contenu
    const stableId = `${prefix}_${hashStr((r.author + r.text).toLowerCase())}`;
    const existing = db.prepare('SELECT id FROM reviews WHERE google_review_id = ?').get(stableId);
    if (existing) continue;

    try {
      const inserted = db.prepare(
        'INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(location.id, stableId, r.author, r.stars, r.text, 'new');
      newReviews.push({ id: inserted.lastInsertRowid, reviewer_name: r.author, star_rating: r.stars, comment: r.text, location_id: location.id });
    } catch(e) {}
  }
  console.log(`[SCRAPE:${prefix}] ${location.business_name}: ${newReviews.length} nouveaux avis`);
  return newReviews;
}

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
  client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      db.prepare('UPDATE locations SET refresh_token = ? WHERE google_location_name = ?').run(tokens.refresh_token, location.google_location_name);
    }
    if (tokens.access_token) {
      db.prepare('UPDATE locations SET access_token = ? WHERE google_location_name = ?').run(tokens.access_token, location.google_location_name);
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

// ─────────────────────────────────────────
// FETCH REVIEWS — ROUTEUR PAR PLATEFORME
// ─────────────────────────────────────────

async function fetchNewReviews(location) {
  const name = location.google_location_name || '';

  if (name.startsWith('tp_'))  return fetchTrustpilotReviews(location);
  if (name.startsWith('ta_'))  return fetchTripAdvisorReviews(location);
  if (name.startsWith('fb_'))  return fetchFacebookReviews(location);
  if (name.startsWith('pj_'))  return fetchPagesJaunesReviews(location);
  if (name.startsWith('tf_'))  return fetchTheForkReviews(location);
  if (name.startsWith('bk_'))  return fetchBookingReviews(location);
  if (name.startsWith('ab_'))  return fetchAirbnbReviews(location);
  if (name.startsWith('av_'))  return fetchAvisVerifiesReviews(location);
  if (name.startsWith('az_'))  return fetchAmazonReviews(location);
  if (name.startsWith('yl_'))  return fetchYelpReviews(location);
  if (name.startsWith('cu_'))  return fetchCustplaceReviews(location);
  if (name.startsWith('gl_'))  return fetchGlassdoorReviews(location);
  if (name.startsWith('id_'))  return fetchIndeedReviews(location);
  if (name.startsWith('do_'))  return fetchDoctolibReviews(location);
  if (name.startsWith('hc_'))  return fetchHolidaycheckReviews(location);
  if (name.startsWith('cd_'))  return fetchCdiscountReviews(location);
  if (name.startsWith('as_'))  return fetchAppStoreReviews(location);
  if (name.startsWith('ps_'))  return fetchPlayStoreReviews(location);

  // Google (par défaut)
  if (!location.refresh_token || name.startsWith('gmb_') || name.startsWith('manual_') || name.startsWith('demo_')) return [];
  return fetchGoogleReviews(location);
}

// ─────────────────────────────────────────
// GOOGLE REVIEWS
// ─────────────────────────────────────────

async function fetchGoogleReviews(location) {
  const client = await getGoogleClient(location);
  const newReviews = [];

  try {
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    // Essai gratuit : 10 derniers avis existants au maximum (les nouveaux sont illimités)
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${location.google_location_name}/reviews?pageSize=10`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SYNC-GOOGLE] API ${res.status}:`, errText.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const starMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

    for (const review of (data.reviews || [])) {
      if (review.reviewReply) continue;
      const reviewId = review.reviewId || review.name;
      const existing = db.prepare('SELECT id FROM reviews WHERE google_review_id = ?').get(reviewId);
      if (existing) continue;

      const starRating = starMap[review.starRating] || 0;
      const inserted = db.prepare(
        'INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(location.id, reviewId, review.reviewer?.displayName || 'Anonyme', starRating, review.comment || '', 'new');
      newReviews.push({ id: inserted.lastInsertRowid, star_rating: starRating, reviewer_name: review.reviewer?.displayName || 'Anonyme', comment: review.comment || '', location_id: location.id });
    }

    console.log(`[SYNC-GOOGLE] ${location.business_name}: ${newReviews.length} nouveaux avis`);
  } catch (e) {
    console.error(`[SYNC-GOOGLE] Erreur:`, e.message);
  }

  return newReviews;
}

// ─────────────────────────────────────────
// TRUSTPILOT
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

    if (!res.ok) { console.error(`[TP SYNC] ${res.status}`); return []; }

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
    ).run(location.id, reviewId, review.consumer?.displayName || review.author?.name || 'Anonyme', review.stars || 0, review.text || '', 'new');
    newReviews.push({ id: inserted.lastInsertRowid, star_rating: review.stars || 0, reviewer_name: review.consumer?.displayName || 'Anonyme', comment: review.text || '', location_id: location.id });
  }
  console.log(`[TP SYNC] ${location.business_name}: ${newReviews.length} nouveaux avis`);
  return newReviews;
}

async function postTrustpilotReply(location, reviewId, replyText) {
  const tpReviewId = reviewId.replace('tp_', '');
  const res = await fetch(`https://api.trustpilot.com/v1/private/reviews/${tpReviewId}/reply`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${location.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: replyText })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Trustpilot ${res.status}: ${err}`);
  }
}

// ─────────────────────────────────────────
// TRIPADVISOR — JSON-LD scraper
// ─────────────────────────────────────────

async function fetchTripAdvisorReviews(location) {
  if (!location.platform_url) return [];

  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) { console.error('[TA SYNC] HTTP', res.status); return []; }
    const html = await res.text();

    const reviews = extractJsonLdReviews(html);

    // Fallback: recherche dans les données embarquées JS
    if (reviews.length === 0) {
      const contextMatch = html.match(/"rating":(\d+),"text":"([^"]+)","username":"([^"]+)"/g);
      if (contextMatch) {
        for (const m of contextMatch.slice(0, 20)) {
          const parts = m.match(/"rating":(\d+),"text":"([^"]+)","username":"([^"]+)"/);
          if (parts) reviews.push({ stars: Math.min(5, parseInt(parts[1])), text: parts[2].replace(/\\n/g, ' '), author: parts[3] });
        }
      }
    }

    return storeScrapedReviews(reviews, location, 'ta');
  } catch(e) {
    console.error('[TA SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// FACEBOOK — Graph API
// ─────────────────────────────────────────

async function fetchFacebookReviews(location) {
  if (!location.access_token) return [];

  // Extraire l'ID ou le nom de la page depuis l'URL
  let pageId = null;
  if (location.platform_url) {
    const match = location.platform_url.match(/facebook\.com\/(?:pages\/[^/]+\/(\d+)|([^/?#]+))/i);
    pageId = match ? (match[1] || match[2]) : null;
  }
  if (!pageId) { console.error('[FB SYNC] Impossible d\'extraire l\'ID de la page'); return []; }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/ratings?fields=reviewer,rating,review_text,created_time&limit=50&access_token=${location.access_token}`
    );
    if (!res.ok) { console.error('[FB SYNC] HTTP', res.status); return []; }
    const data = await res.json();

    if (data.error) { console.error('[FB SYNC]', data.error.message); return []; }

    const newReviews = [];
    for (const review of (data.data || [])) {
      const reviewId = `fb_${review.id || hashStr(review.created_time + review.reviewer?.id)}`;
      const existing = db.prepare('SELECT id FROM reviews WHERE google_review_id = ?').get(reviewId);
      if (existing) continue;

      const inserted = db.prepare(
        'INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(location.id, reviewId, review.reviewer?.name || 'Anonyme', review.rating || 5, review.review_text || '', 'new');
      newReviews.push({ id: inserted.lastInsertRowid, reviewer_name: review.reviewer?.name || 'Anonyme', star_rating: review.rating || 5, comment: review.review_text || '', location_id: location.id });
    }

    console.log(`[FB SYNC] ${location.business_name}: ${newReviews.length} nouveaux avis`);
    return newReviews;
  } catch(e) {
    console.error('[FB SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// PAGES JAUNES — JSON-LD scraper
// ─────────────────────────────────────────

async function fetchPagesJaunesReviews(location) {
  if (!location.platform_url) return [];

  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) { console.error('[PJ SYNC] HTTP', res.status); return []; }
    const html = await res.text();

    const reviews = extractJsonLdReviews(html);

    // Fallback spécifique Pages Jaunes
    if (reviews.length === 0) {
      const reviewBlocks = html.match(/class="[^"]*avis[^"]*"[\s\S]{0,500}?/gi) || [];
      const ratingMatch = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/g) || [];
      const authorMatch = html.match(/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/g) || [];
      const textMatch   = html.match(/"reviewBody"\s*:\s*"([^"]+)"/g) || [];

      for (let i = 0; i < Math.min(textMatch.length, 20); i++) {
        const text   = (textMatch[i]?.match(/"reviewBody"\s*:\s*"([^"]+)"/) || [])[1] || '';
        const author = (authorMatch[i]?.match(/"name"\s*:\s*"([^"]+)"/) || [])[1] || 'Anonyme';
        const rating = (ratingMatch[i]?.match(/([\d.]+)/) || [])[1] || '4';
        if (text) reviews.push({ stars: Math.round(parseFloat(rating)), author, text });
      }
    }

    return storeScrapedReviews(reviews, location, 'pj');
  } catch(e) {
    console.error('[PJ SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// THEFORK / LAFOURCHETTE — JSON-LD scraper
// ─────────────────────────────────────────

async function fetchTheForkReviews(location) {
  if (!location.platform_url) return [];

  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) { console.error('[TF SYNC] HTTP', res.status); return []; }
    const html = await res.text();

    const reviews = extractJsonLdReviews(html);

    // Fallback spécifique TheFork
    if (reviews.length === 0) {
      const textMatches   = [...html.matchAll(/"reviewBody"\s*:\s*"([^"]{10,})"/g)];
      const ratingMatches = [...html.matchAll(/"ratingValue"\s*:\s*(\d+(?:\.\d+)?)/g)];
      const authorMatches = [...html.matchAll(/"author"\s*[:{]\s*(?:\{[^}]*"name"\s*:\s*"([^"]+)")?/g)];

      for (let i = 0; i < Math.min(textMatches.length, 20); i++) {
        reviews.push({
          text:   textMatches[i][1].replace(/\\n/g, ' '),
          stars:  Math.round(parseFloat(ratingMatches[i]?.[1] || 4)),
          author: authorMatches[i]?.[1] || 'Anonyme'
        });
      }
    }

    return storeScrapedReviews(reviews, location, 'tf');
  } catch(e) {
    console.error('[TF SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// BOOKING.COM — Scraper
// ─────────────────────────────────────────

async function fetchBookingReviews(location) {
  if (!location.platform_url) return [];

  try {
    // Booking.com utilise Cloudflare — on tente quand même
    const res = await fetch(location.platform_url, {
      headers: { ...SCRAPE_HEADERS, 'Referer': 'https://www.google.com/' }
    });
    if (!res.ok) { console.error('[BK SYNC] HTTP', res.status, '(Cloudflare probable)'); return []; }
    const html = await res.text();

    const reviews = extractJsonLdReviews(html);

    // Fallback Booking spécifique
    if (reviews.length === 0) {
      const scores   = [...html.matchAll(/data-review-score="([\d.]+)"/g)];
      const texts    = [...html.matchAll(/class="[^"]*c-review__body[^"]*"[^>]*>([^<]{20,})</g)];
      const authors  = [...html.matchAll(/class="[^"]*bui-avatar-block__title[^"]*"[^>]*>([^<]+)</g)];

      for (let i = 0; i < Math.min(texts.length, 20); i++) {
        const score = parseFloat(scores[i]?.[1] || 8) / 2; // Booking sur 10, convertir sur 5
        reviews.push({
          stars:  Math.min(5, Math.max(1, Math.round(score))),
          text:   texts[i][1].trim(),
          author: authors[i]?.[1]?.trim() || 'Anonyme'
        });
      }
    }

    return storeScrapedReviews(reviews, location, 'bk');
  } catch(e) {
    console.error('[BK SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// AIRBNB — Scraper (limité, SPA React)
// ─────────────────────────────────────────

async function fetchAirbnbReviews(location) {
  if (!location.platform_url) return [];

  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) { console.error('[AB SYNC] HTTP', res.status); return []; }
    const html = await res.text();

    // Airbnb injecte parfois les données dans __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const reviews = [];

        // Chercher les avis dans la structure profonde
        const findReviews = (obj, depth = 0) => {
          if (depth > 10 || !obj || typeof obj !== 'object') return;
          if (obj.comments && obj.reviewerName) {
            reviews.push({ stars: obj.rating || 5, text: obj.comments, author: obj.reviewerName });
            return;
          }
          for (const val of Object.values(obj)) {
            if (Array.isArray(val)) val.forEach(v => findReviews(v, depth + 1));
            else if (typeof val === 'object') findReviews(val, depth + 1);
          }
        };
        findReviews(nextData);

        if (reviews.length > 0) return storeScrapedReviews(reviews.slice(0, 30), location, 'ab');
      } catch(e) {}
    }

    // JSON-LD fallback
    const reviews = extractJsonLdReviews(html);
    return storeScrapedReviews(reviews, location, 'ab');
  } catch(e) {
    console.error('[AB SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// AVIS VÉRIFIÉS — Scraper + widget API
// ─────────────────────────────────────────

async function fetchAvisVerifiesReviews(location) {
  if (!location.platform_url) return [];

  try {
    // D'abord essayer le scraping de la page publique
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) { console.error('[AV SYNC] HTTP', res.status); return []; }
    const html = await res.text();

    const reviews = extractJsonLdReviews(html);

    // Fallback spécifique Avis Vérifiés
    if (reviews.length === 0) {
      // Extraire siteId depuis la page
      const siteIdMatch = html.match(/siteId['":\s]+['"]?(\d+)['"]?/i);
      if (siteIdMatch) {
        const siteId = siteIdMatch[1];
        try {
          const apiRes = await fetch(
            `https://cl.avis-verifies.com/fr/cache/${siteId}/cachewidgets/getwidgetsreviews.php?nbavis=50&page=1`,
            { headers: { 'Referer': location.platform_url } }
          );
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            const apiReviews = (apiData.reviews || apiData.avis || []).map(r => ({
              stars: Math.round(parseFloat(r.note || r.rate || r.rating || 4)),
              text:  r.review || r.avis || r.comment || '',
              author: r.firstname || r.prenom || r.author || 'Anonyme'
            })).filter(r => r.text);
            return storeScrapedReviews(apiReviews, location, 'av');
          }
        } catch(e2) {}
      }

      // Regex fallback
      const textMatches   = [...html.matchAll(/class="[^"]*review[^"]*"[^>]*>\s*<p[^>]*>([^<]{20,})<\/p>/gi)];
      const ratingMatches = [...html.matchAll(/class="[^"]*rating[^"]*"[^>]*data-score="([\d.]+)"/gi)];
      const authorMatches = [...html.matchAll(/class="[^"]*author[^"]*"[^>]*>([^<]+)</gi)];

      for (let i = 0; i < Math.min(textMatches.length, 20); i++) {
        reviews.push({
          text:   textMatches[i][1].trim(),
          stars:  Math.round(parseFloat(ratingMatches[i]?.[1] || 4)),
          author: authorMatches[i]?.[1]?.trim() || 'Anonyme'
        });
      }
    }

    return storeScrapedReviews(reviews, location, 'av');
  } catch(e) {
    console.error('[AV SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// AMAZON — Scraper page avis produit
// ─────────────────────────────────────────

async function fetchAmazonReviews(location) {
  if (!location.platform_url) return [];

  try {
    // Amazon bloque souvent les requêtes non-navigateur
    const res = await fetch(location.platform_url, {
      headers: {
        ...SCRAPE_HEADERS,
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      }
    });
    if (!res.ok) { console.error('[AZ SYNC] HTTP', res.status); return []; }
    const html = await res.text();

    const reviews = [];

    // Amazon Reviews page structure
    const reviewBlocks = [...html.matchAll(/data-hook="review-body"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/g)];
    const ratingBlocks = [...html.matchAll(/data-hook="review-star-rating"[\s\S]*?class="[^"]*">([\d.,]+) sur/g)];
    const authorBlocks = [...html.matchAll(/class="a-profile-name"[^>]*>([^<]+)</g)];

    for (let i = 0; i < Math.min(reviewBlocks.length, 20); i++) {
      const text = reviewBlocks[i][1].replace(/<[^>]+>/g, '').trim();
      if (!text) continue;
      const ratingStr = ratingBlocks[i]?.[1]?.replace(',', '.') || '4';
      reviews.push({
        text,
        stars:  Math.min(5, Math.max(1, Math.round(parseFloat(ratingStr)))),
        author: authorBlocks[i]?.[1]?.trim() || 'Anonyme'
      });
    }

    // JSON-LD fallback
    if (reviews.length === 0) {
      const ldReviews = extractJsonLdReviews(html);
      reviews.push(...ldReviews);
    }

    return storeScrapedReviews(reviews, location, 'az');
  } catch(e) {
    console.error('[AZ SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// YELP — Fusion API (gratuit avec clé)
// ─────────────────────────────────────────

async function fetchYelpReviews(location) {
  if (!location.platform_url) return [];

  try {
    // Extraire le business alias/id depuis l'URL Yelp
    const match = location.platform_url.match(/yelp\.[a-z]+\/biz\/([^?&#/]+)/i);
    const bizId = match ? match[1] : null;

    // Si token (API key), utiliser l'API Fusion
    if (bizId && location.access_token) {
      const res = await fetch(`https://api.yelp.com/v3/businesses/${bizId}/reviews?limit=50`, {
        headers: { 'Authorization': `Bearer ${location.access_token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const reviews = (data.reviews || []).map(r => ({
          stars: r.rating || 5,
          author: r.user?.name || 'Anonyme',
          text: r.text || ''
        })).filter(r => r.text);
        return storeScrapedReviews(reviews, location, 'yl');
      }
    }

    // Fallback scraping
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);
    return storeScrapedReviews(reviews, location, 'yl');
  } catch(e) {
    console.error('[YELP SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// CUSTPLACE — Scraper
// ─────────────────────────────────────────

async function fetchCustplaceReviews(location) {
  if (!location.platform_url) return [];
  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);

    if (reviews.length === 0) {
      // Custplace utilise souvent un widget JSON
      const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (jsonMatch) {
        try {
          const state = JSON.parse(jsonMatch[1]);
          const rawReviews = state?.reviews?.list || state?.data?.reviews || [];
          const parsed = rawReviews.map(r => ({
            stars: Math.round(parseFloat(r.note || r.rating || 4)),
            author: r.author || r.firstname || 'Anonyme',
            text: r.comment || r.text || ''
          })).filter(r => r.text);
          return storeScrapedReviews(parsed, location, 'cu');
        } catch(e2) {}
      }
    }

    return storeScrapedReviews(reviews, location, 'cu');
  } catch(e) {
    console.error('[CUSTPLACE SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// GLASSDOOR — Scraper (avis employés)
// ─────────────────────────────────────────

async function fetchGlassdoorReviews(location) {
  if (!location.platform_url) return [];
  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);

    if (reviews.length === 0) {
      // Glassdoor injecte parfois les données dans Apollo state
      const apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});<\/script>/);
      if (apolloMatch) {
        try {
          const state = JSON.parse(apolloMatch[1]);
          const parsed = [];
          for (const key of Object.keys(state)) {
            const item = state[key];
            if (item?.pros || item?.cons) {
              parsed.push({
                stars: Math.round(parseFloat(item.ratingOverall || item.rating || 3)),
                author: item.jobTitle || 'Employé',
                text: [item.pros, item.cons].filter(Boolean).join(' — ')
              });
            }
          }
          if (parsed.length > 0) return storeScrapedReviews(parsed.slice(0, 20), location, 'gl');
        } catch(e2) {}
      }
    }

    return storeScrapedReviews(reviews, location, 'gl');
  } catch(e) {
    console.error('[GLASSDOOR SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// INDEED — Scraper (avis employeurs)
// ─────────────────────────────────────────

async function fetchIndeedReviews(location) {
  if (!location.platform_url) return [];
  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);

    if (reviews.length === 0) {
      // Indeed embed JSON data
      const dataMatch = html.match(/window\.mosaic\.providerData\["mosaic-provider-reviews"\]\s*=\s*({[\s\S]*?});/);
      if (dataMatch) {
        try {
          const data = JSON.parse(dataMatch[1]);
          const rawReviews = data?.metaData?.reviewData?.reviews || [];
          const parsed = rawReviews.map(r => ({
            stars: Math.round(parseFloat(r.rating?.overall || 3)),
            author: r.jobTitle?.text || 'Employé',
            text: [r.text?.pros, r.text?.cons].filter(Boolean).join(' — ')
          })).filter(r => r.text);
          return storeScrapedReviews(parsed.slice(0, 20), location, 'id');
        } catch(e2) {}
      }
    }

    return storeScrapedReviews(reviews, location, 'id');
  } catch(e) {
    console.error('[INDEED SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// DOCTOLIB — Scraper (avis patients)
// ─────────────────────────────────────────

async function fetchDoctolibReviews(location) {
  if (!location.platform_url) return [];
  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);

    if (reviews.length === 0) {
      // Doctolib — extraire depuis les données Next.js
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const rawReviews = nextData?.props?.pageProps?.reviews || nextData?.props?.pageProps?.doctor?.reviews || [];
          const parsed = rawReviews.map(r => ({
            stars: Math.round(parseFloat(r.rating || r.note || 4)),
            author: r.firstName || r.author || 'Patient',
            text: r.comment || r.text || ''
          })).filter(r => r.text);
          return storeScrapedReviews(parsed.slice(0, 20), location, 'do');
        } catch(e2) {}
      }

      // Fallback regex
      const ratingMatches = [...html.matchAll(/data-rating="(\d+)"/g)];
      const commentMatches = [...html.matchAll(/class="[^"]*review-comment[^"]*"[^>]*>([^<]{20,})</g)];
      const parsed = [];
      for (let i = 0; i < Math.min(commentMatches.length, 20); i++) {
        parsed.push({
          stars: parseInt(ratingMatches[i]?.[1] || 4),
          author: 'Patient',
          text: commentMatches[i][1].trim()
        });
      }
      return storeScrapedReviews(parsed, location, 'do');
    }

    return storeScrapedReviews(reviews, location, 'do');
  } catch(e) {
    console.error('[DOCTOLIB SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// HOLIDAYCHECK — Scraper (avis hôtels)
// ─────────────────────────────────────────

async function fetchHolidaycheckReviews(location) {
  if (!location.platform_url) return [];
  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);

    if (reviews.length === 0) {
      const textMatches = [...html.matchAll(/class="[^"]*review-text[^"]*"[^>]*>([\s\S]{20,200}?)<\/[a-z]+>/gi)];
      const ratingMatches = [...html.matchAll(/data-score="([\d.]+)"/g)];
      const authorMatches = [...html.matchAll(/class="[^"]*reviewer-name[^"]*"[^>]*>([^<]+)</gi)];

      const parsed = textMatches.slice(0, 20).map((m, i) => ({
        text: m[1].replace(/<[^>]+>/g, '').trim(),
        stars: Math.min(5, Math.max(1, Math.round(parseFloat(ratingMatches[i]?.[1] || 4) / 2))),
        author: authorMatches[i]?.[1]?.trim() || 'Voyageur'
      })).filter(r => r.text);
      return storeScrapedReviews(parsed, location, 'hc');
    }

    return storeScrapedReviews(reviews, location, 'hc');
  } catch(e) {
    console.error('[HOLIDAYCHECK SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// CDISCOUNT — Scraper (avis produits)
// ─────────────────────────────────────────

async function fetchCdiscountReviews(location) {
  if (!location.platform_url) return [];
  try {
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const reviews = extractJsonLdReviews(html);

    if (reviews.length === 0) {
      // Cdiscount — JSON embarqué
      const jsonMatch = html.match(/var\s+reviewsData\s*=\s*({[\s\S]*?});/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const raw = data?.Reviews || data?.reviews || [];
          const parsed = raw.map(r => ({
            stars: Math.round(parseFloat(r.Rating || r.rating || 3)),
            author: r.AuthorNickname || r.author || 'Client',
            text: r.ReviewText || r.text || ''
          })).filter(r => r.text);
          return storeScrapedReviews(parsed.slice(0, 20), location, 'cd');
        } catch(e2) {}
      }

      const textMatches = [...html.matchAll(/class="[^"]*review-body[^"]*"[^>]*>([\s\S]{20,300}?)<\/div>/gi)];
      const ratingMatches = [...html.matchAll(/aria-label="(\d) étoile/g)];
      const parsed = textMatches.slice(0, 20).map((m, i) => ({
        text: m[1].replace(/<[^>]+>/g, '').trim(),
        stars: parseInt(ratingMatches[i]?.[1] || 4),
        author: 'Client'
      })).filter(r => r.text);
      return storeScrapedReviews(parsed, location, 'cd');
    }

    return storeScrapedReviews(reviews, location, 'cd');
  } catch(e) {
    console.error('[CDISCOUNT SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// APP STORE — RSS Apple (gratuit, sans token)
// ─────────────────────────────────────────

async function fetchAppStoreReviews(location) {
  if (!location.platform_url) return [];

  try {
    // Extraire App ID depuis l'URL (ex: /app/monapp/id123456789)
    const appIdMatch = location.platform_url.match(/\/id(\d+)/);
    const appId = appIdMatch ? appIdMatch[1] : null;

    if (appId) {
      // Apple RSS feed — gratuit, pas de token requis
      const rssUrl = `https://itunes.apple.com/fr/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`;
      const res = await fetch(rssUrl, { headers: { 'User-Agent': SCRAPE_HEADERS['User-Agent'] } });

      if (res.ok) {
        const data = await res.json();
        const entries = data?.feed?.entry || [];
        const reviews = entries.slice(1).map(e => ({ // slice(1) pour ignorer la 1ère entrée (info app)
          stars: parseInt(e['im:rating']?.label || 4),
          author: e.author?.name?.label || 'Utilisateur',
          text: e.content?.label || e.title?.label || ''
        })).filter(r => r.text);
        return storeScrapedReviews(reviews, location, 'as');
      }
    }

    // Fallback scraping
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    return storeScrapedReviews(extractJsonLdReviews(html), location, 'as');
  } catch(e) {
    console.error('[APPSTORE SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// PLAY STORE — Scraper Google Play
// ─────────────────────────────────────────

async function fetchPlayStoreReviews(location) {
  if (!location.platform_url) return [];

  try {
    // Extraire package name depuis l'URL
    const pkgMatch = location.platform_url.match(/id=([a-zA-Z0-9_.]+)/);
    const pkg = pkgMatch ? pkgMatch[1] : null;

    if (pkg) {
      // Google Play unofficial JSON API
      const apiUrl = `https://play.google.com/store/getreviews?id=${pkg}&reviewSortOrder=0&reviewType=1&pageNum=0&xhr=1`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { ...SCRAPE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (res.ok) {
        const text = await res.text();
        const reviews = [];
        const ratingRe = /"(\d)"[^}]{0,50}"([^"]{10,300})"/g;
        let m;
        while ((m = ratingRe.exec(text)) !== null && reviews.length < 20) {
          reviews.push({ stars: parseInt(m[1]), author: 'Utilisateur', text: m[2] });
        }
        if (reviews.length > 0) return storeScrapedReviews(reviews, location, 'ps');
      }
    }

    // Fallback scraping de la page
    const res = await fetch(location.platform_url, { headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    return storeScrapedReviews(extractJsonLdReviews(html), location, 'ps');
  } catch(e) {
    console.error('[PLAYSTORE SYNC]', e.message);
    return [];
  }
}

// ─────────────────────────────────────────
// PAGE RÉPONSE RAPIDE — /reply/:id
// ─────────────────────────────────────────

app.get('/reply/:id', (req, res) => {
  const review = db.prepare(`
    SELECT r.*, l.google_location_name, l.business_name
    FROM reviews r JOIN locations l ON r.location_id = l.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!review || !review.generated_response) {
    return res.status(404).send('Avis introuvable ou réponse non générée.');
  }

  const prefix = (review.google_location_name || '').split('_')[0];
  const platformLabels = { ta:'TripAdvisor', fb:'Facebook', pj:'Pages Jaunes', tf:'TheFork', bk:'Booking.com', ab:'Airbnb', av:'Avis Vérifiés', az:'Amazon', yl:'Yelp', cu:'Custplace' };
  const platform = platformLabels[prefix] || 'Plateforme';
  const manageUrl = PLATFORM_MANAGE_URLS[platform] || '#';
  const stars = '★'.repeat(review.star_rating) + '☆'.repeat(5 - review.star_rating);

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReputIA — Répondre à l'avis</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#05050a;color:#f1f1f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{max-width:620px;width:100%;background:#0d0d15;border:1px solid #1e1e30;border-radius:20px;overflow:hidden}
.header{background:linear-gradient(135deg,#05050a,#1a1a28);padding:24px 32px;border-bottom:1px solid #1e1e30;display:flex;align-items:center;gap:12px}
.logo{width:40px;height:40px;background:linear-gradient(135deg,#f59e0b,#ef4444);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
.logo-text{font-size:20px;font-weight:800;color:#f1f1f8}
.body{padding:32px}
.review-box{background:#12121e;border:1px solid #1e1e30;border-radius:12px;padding:18px;margin-bottom:20px}
.reviewer{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
.stars{color:#f59e0b;font-size:16px;letter-spacing:2px}
.review-text{font-size:14px;color:#9898b5;line-height:1.7;font-style:italic}
.response-box{background:#0a1a0a;border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:18px;margin-bottom:24px;position:relative}
.response-label{font-size:11px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.response-text{font-size:14px;color:#e5e7eb;line-height:1.75;white-space:pre-wrap}
.btn-copy{width:100%;padding:16px;background:linear-gradient(135deg,#f59e0b,#f97316);color:#000;border:none;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;margin-bottom:12px;transition:all .2s}
.btn-copy:hover{opacity:.9;transform:translateY(-1px)}
.btn-copy.copied{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}
.btn-platform{display:block;width:100%;padding:14px;background:#1a1a28;color:#f1f1f8;border:1px solid #2d2d45;border-radius:12px;font-size:15px;font-weight:700;text-align:center;text-decoration:none;transition:all .2s}
.btn-platform:hover{border-color:#f59e0b;color:#f59e0b}
.tip{font-size:12px;color:#6b6b8a;text-align:center;margin-top:16px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="logo">⭐</div>
    <div class="logo-text">ReputIA</div>
    <div style="margin-left:auto;font-size:13px;color:#6b6b8a">${platform} · ${review.business_name}</div>
  </div>
  <div class="body">
    <div class="review-box">
      <div class="reviewer">
        <div class="avatar">${(review.reviewer_name||'?').charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:14px;font-weight:700">${review.reviewer_name}</div>
          <div class="stars">${stars}</div>
        </div>
      </div>
      <div class="review-text">"${review.comment || '(Pas de commentaire)'}"</div>
    </div>

    <div class="response-box">
      <div class="response-label">⚡ Réponse générée par ReputIA</div>
      <div class="response-text" id="responseText">${review.generated_response}</div>
    </div>

    <button class="btn-copy" id="copyBtn" onclick="copyResponse()">
      📋 Copier la réponse
    </button>
    <a href="${manageUrl}" target="_blank" class="btn-platform">
      Ouvrir mon espace ${platform} → Coller et publier
    </a>
    <div class="tip">
      1. Copiez la réponse ci-dessus<br>
      2. Ouvrez ${platform} → trouvez l'avis de <strong>${review.reviewer_name}</strong><br>
      3. Cliquez "Répondre" → collez (<kbd>Ctrl+V</kbd> ou <kbd>Cmd+V</kbd>) → Publiez ✅
    </div>
  </div>
</div>
<script>
function copyResponse() {
  const text = document.getElementById('responseText').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Réponse copiée !';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋 Copier la réponse';
      btn.classList.remove('copied');
    }, 3000);
  });
}
// Auto-copie au chargement
window.addEventListener('load', () => setTimeout(copyResponse, 400));
</script>
</body>
</html>`);
});

// ─────────────────────────────────────────
// BACKFILL COMPLET — Tous les anciens avis sans réponse (utilisateurs payants)
// ─────────────────────────────────────────

async function fetchAllGoogleReviewsPaginated(location) {
  const client = await getGoogleClient(location);
  const allNew = [];
  let pageToken = null;

  try {
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    do {
      const url = `https://mybusiness.googleapis.com/v4/${location.google_location_name}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) break;

      const data = await res.json();
      const starMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

      for (const review of (data.reviews || [])) {
        if (review.reviewReply) continue;
        const reviewId = review.reviewId || review.name;
        const existing = db.prepare('SELECT id FROM reviews WHERE google_review_id = ?').get(reviewId);
        if (existing) continue;
        const starRating = starMap[review.starRating] || 0;
        const inserted = db.prepare(
          'INSERT INTO reviews (location_id, google_review_id, reviewer_name, star_rating, comment, status) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(location.id, reviewId, review.reviewer?.displayName || 'Anonyme', starRating, review.comment || '', 'new');
        allNew.push({ id: inserted.lastInsertRowid, star_rating: starRating, reviewer_name: review.reviewer?.displayName || 'Anonyme', comment: review.comment || '', location_id: location.id });
      }

      pageToken = data.nextPageToken || null;
    } while (pageToken);

    console.log(`[BACKFILL] ${location.business_name}: ${allNew.length} anciens avis récupérés`);
  } catch (e) {
    console.error(`[BACKFILL] Erreur:`, e.message);
  }

  return allNew;
}

async function triggerFullBackfill(userId) {
  const locations = db.prepare(`SELECT l.*, u.groq_key FROM locations l JOIN users u ON l.user_id = u.id WHERE l.user_id = ? AND l.active = 1`).all(userId);
  let total = 0;
  for (const loc of locations) {
    if (!loc.refresh_token) continue;
    const reviews = await fetchAllGoogleReviewsPaginated(loc);
    total += reviews.length;
    // Générer et poster les réponses immédiatement
    if (loc.auto_respond && process.env.GROQ_API_KEY && reviews.length > 0) {
      for (const review of reviews) {
        try {
          const dbReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(review.id);
          const merged = { ...dbReview, ...loc };
          const response = await generateResponse(merged, process.env.GROQ_API_KEY);
          db.prepare('UPDATE reviews SET generated_response = ? WHERE id = ?').run(response, review.id);
          await postGoogleReply(merged, response);
          db.prepare('UPDATE reviews SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?').run('posted', review.id);
          console.log(`[BACKFILL] ✅ Répondu à ${review.reviewer_name} pour ${loc.business_name}`);
        } catch (e) {
          console.error(`[BACKFILL] ❌ Erreur review ${review.id}:`, e.message);
          db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run('error', review.id);
        }
      }
    }
  }
  console.log(`[BACKFILL] Total: ${total} anciens avis traités pour user ${userId}`);
  return total;
}

// ─────────────────────────────────────────
// WEBHOOK STRIPE — Passage au payant
// ─────────────────────────────────────────

// ⚠️ Ce route doit être AVANT express.json() pour recevoir le raw body
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Stripe non configuré' });
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[STRIPE] Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    console.log(`[STRIPE] Paiement confirmé pour ${email}`);
    if (email) {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        db.prepare("UPDATE users SET plan = 'paid' WHERE id = ?").run(user.id);
        console.log(`[STRIPE] ✅ Plan mis à jour → paid pour ${email}`);
        // Email onboarding complet
        sendEmail(email, '🎉 Votre abonnement ReputIA est actif — Guide de configuration complet', emailOnboarding(email));
        // Backfill complet de tous les anciens avis
        triggerFullBackfill(user.id).then(total => {
          console.log(`[STRIPE] Backfill terminé: ${total} avis traités pour ${email}`);
        });
      }
    }
  }
  res.json({ received: true });
});

// ─────────────────────────────────────────
// ENDPOINT ADMIN — Upgrade manuel (fallback)
// ─────────────────────────────────────────

app.post('/api/admin/upgrade', async (req, res) => {
  const { email, secret } = req.body;
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare("UPDATE users SET plan = 'paid' WHERE id = ?").run(user.id);
  const total = await triggerFullBackfill(user.id);
  console.log(`[ADMIN] ${email} passé en payant — ${total} anciens avis traités`);
  res.json({ ok: true, email, avisTraites: total });
});

// ─────────────────────────────────────────
// CRON JOB — Auto-réponse toutes les heures
// ─────────────────────────────────────────

async function runAutoResponder() {
  const now = new Date().toLocaleTimeString('fr-FR');
  console.log(`[CRON ${now}] Vérification des nouveaux avis...`);

  const activeLocations = db.prepare(`
    SELECT l.*, u.groq_key, u.email as user_email
    FROM locations l
    JOIN users u ON l.user_id = u.id
    WHERE l.active = 1
  `).all();

  for (const location of activeLocations) {
    const newReviews = await fetchNewReviews(location);

    if (newReviews.length > 0) {
      console.log(`[CRON] ${newReviews.length} nouvel(s) avis pour ${location.business_name}`);
    }

    if (location.auto_respond && process.env.GROQ_API_KEY && newReviews.length > 0) {
      for (const review of newReviews) {
        try {
          const dbReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(review.id);
          const mergedReview = { ...dbReview, ...location };

          const response = await generateResponse(mergedReview, process.env.GROQ_API_KEY);
          db.prepare('UPDATE reviews SET generated_response = ? WHERE id = ?').run(response, review.id);

          // Poster uniquement sur Google et Trustpilot (API disponibles)
          const name = location.google_location_name || '';
          if (name.startsWith('tp_')) {
            await postTrustpilotReply(mergedReview, review.google_review_id, response);
            db.prepare('UPDATE reviews SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?').run('posted', review.id);
          } else if (!name.startsWith('ta_') && !name.startsWith('fb_') && !name.startsWith('pj_') && !name.startsWith('tf_') && !name.startsWith('bk_') && !name.startsWith('ab_') && !name.startsWith('av_') && !name.startsWith('az_') && location.refresh_token) {
            await postGoogleReply(mergedReview, response);
            db.prepare('UPDATE reviews SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?').run('posted', review.id);
          } else {
            // Autres plateformes → généré, à poster manuellement
            db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run('generated', review.id);
            // Email alerte à l'utilisateur
            const platformName = (location.google_location_name || '').split('_')[0];
            const platformLabels = { ta:'TripAdvisor', fb:'Facebook', pj:'Pages Jaunes', tf:'TheFork', bk:'Booking.com', ab:'Airbnb', av:'Avis Vérifiés', az:'Amazon', yl:'Yelp', cu:'Custplace' };
            const platLabel = platformLabels[platformName] || 'Plateforme';
            if (location.user_email) {
              sendEmail(
                location.user_email,
                `${platLabel} — Nouvel avis de ${mergedReview.reviewer_name} · Réponse prête à publier`,
                emailSemiAutoReview(location.user_email, mergedReview.reviewer_name, platLabel, mergedReview.star_rating, mergedReview.comment, response, location.business_name, review.id)
              );
            }
          }

          console.log(`[AUTO] ✅ Répondu à ${review.reviewer_name} (${review.star_rating}★) pour ${location.business_name}`);
        } catch (e) {
          console.error(`[AUTO] ❌ Erreur pour review ${review.id}:`, e.message);
          db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run('error', review.id);
        }
      }
    }
  }
}

cron.schedule('0 * * * *', runAutoResponder);
setTimeout(runAutoResponder, 5000);

// ─────────────────────────────────────────
// CRON — Emails relance essai (tous les jours à 10h)
// ─────────────────────────────────────────
async function runTrialEmails() {
  const now = new Date();
  const users = db.prepare("SELECT id, email, created_at, plan FROM users WHERE plan = 'trial'").all();

  for (const user of users) {
    const created = new Date(user.created_at);
    const diffMs = now - created;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // J+5 (entre 5.0 et 6.0 jours depuis la création)
    if (diffDays >= 5 && diffDays < 6) {
      const already = db.prepare("SELECT 1 FROM email_log WHERE user_id = ? AND type = 'trial_day5'").get(user.id);
      if (!already) {
        await sendEmail(user.email, '⚠️ Plus que 2 jours — Votre essai ReputIA se termine bientôt', emailDay5(user.email));
        db.prepare("INSERT INTO email_log (user_id, type, sent_at) VALUES (?, 'trial_day5', CURRENT_TIMESTAMP)").run(user.id);
      }
    }

    // J+7 (entre 7.0 et 8.0 jours)
    if (diffDays >= 7 && diffDays < 8) {
      const already = db.prepare("SELECT 1 FROM email_log WHERE user_id = ? AND type = 'trial_day7'").get(user.id);
      if (!already) {
        await sendEmail(user.email, '🔒 Votre essai ReputIA est terminé — Continuez sans interruption', emailDay7(user.email));
        db.prepare("INSERT INTO email_log (user_id, type, sent_at) VALUES (?, 'trial_day7', CURRENT_TIMESTAMP)").run(user.id);
        // Passer le plan à 'expired'
        db.prepare("UPDATE users SET plan = 'expired' WHERE id = ?").run(user.id);
      }
    }
  }
}

// Table de log des emails si elle n'existe pas
db.exec(`CREATE TABLE IF NOT EXISTS email_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  type       TEXT NOT NULL,
  sent_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

cron.schedule('0 10 * * *', runTrialEmails);
console.log('[EMAIL CRON] Relances essai programmées tous les jours à 10h');

// ─────────────────────────────────────────
// GESTION ERREURS
// ─────────────────────────────────────────

// 404
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));
// 500
app.use((err, req, res, next) => { console.error(err); res.status(500).sendFile(path.join(__dirname, 'public', '500.html')); });

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
