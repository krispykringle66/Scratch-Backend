const express = require('express');
const cors = require('cors');
const path = require('path');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Config ----
// Set this in your hosting provider's environment variables.
// The Dalamud plugin sends this same value in the X-Host-Key header
// when creating sessions, so randoms on the internet can't spam your
// server with free session creation.
const HOST_KEY = process.env.HOST_KEY || 'change-me';

// How long an unfinished session stays valid before it's cleaned up.
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---- In-memory session store ----
// Sessions are short-lived (a single scratch card, played within minutes),
// so in-memory is fine. If your host free-tier restarts occasionally,
// any card someone was mid-scratch on when it restarts would be lost \u2014
// acceptable for this use case, but worth knowing.
const sessions = new Map();

function weightedPick(tiers) {
  const total = tiers.reduce((sum, t) => sum + Math.max(0, t.weight), 0);
  if (total <= 0) return 0;
  let roll = Math.random() * total;
  for (let i = 0; i < tiers.length; i++) {
    roll -= Math.max(0, tiers[i].weight);
    if (roll <= 0) return i;
  }
  return tiers.length - 1;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// ---- Routes ----

// Host (the plugin) creates a new card session.
// Body: { presetName, cardPrice, tiers: [{ name, payout, weight }, ...] }
app.post('/api/sessions', (req, res) => {
  if (req.headers['x-host-key'] !== HOST_KEY) {
    return res.status(401).json({ error: 'Invalid host key' });
  }

  const { presetName, cardPrice, tiers } = req.body || {};
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ error: 'tiers array required' });
  }

  const gridSize = 9;
  const results = [];
  for (let i = 0; i < gridSize; i++) {
    const tierIndex = weightedPick(tiers);
    results.push(tiers[tierIndex]);
  }

  const id = nanoid(12);
  sessions.set(id, {
    id,
    presetName: presetName || 'Scratch Card',
    cardPrice: cardPrice || 0,
    tiers,
    results,           // full results \u2014 never sent to the client until revealed
    revealed: new Array(gridSize).fill(false),
    createdAt: Date.now(),
  });

  res.json({ id, url: `${req.protocol}://${req.get('host')}/card/${id}` });
});

// Client-facing page loads session metadata (no results yet).
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });

  res.json({
    presetName: session.presetName,
    cardPrice: session.cardPrice,
    revealed: session.revealed,
    // For already-revealed cells, include the result so a page refresh
    // doesn't lose progress.
    revealedResults: session.revealed.map((r, i) => (r ? session.results[i] : null)),
    complete: session.revealed.every(Boolean),
  });
});

// Client reveals one cell. This is the only place a result is ever sent
// for a given cell, and only once.
app.post('/api/sessions/:id/reveal', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });

  const { cellIndex } = req.body || {};
  if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex >= session.results.length) {
    return res.status(400).json({ error: 'Invalid cellIndex' });
  }
  if (session.revealed[cellIndex]) {
    // Already revealed \u2014 just return the same result again, idempotent.
    return res.json({ tier: session.results[cellIndex], alreadyRevealed: true });
  }

  session.revealed[cellIndex] = true;
  res.json({ tier: session.results[cellIndex], alreadyRevealed: false });
});

// Host (the plugin) polls this to know when to pay out and how much.
app.get('/api/sessions/:id/status', (req, res) => {
  if (req.headers['x-host-key'] !== HOST_KEY) {
    return res.status(401).json({ error: 'Invalid host key' });
  }
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });

  const complete = session.revealed.every(Boolean);
  const totalWinnings = session.revealed.reduce(
    (sum, r, i) => sum + (r ? session.results[i].payout : 0), 0
  );

  res.json({ complete, totalWinnings, revealed: session.revealed });
});

// Serve the scratch card page for any /card/:id URL (client link).
app.get('/card/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'card.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scratch backend listening on port ${PORT}`));
