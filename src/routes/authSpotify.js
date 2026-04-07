const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const { spawn } = require('child_process');
const { generateRandomString } = require('../utils/random');

// Tokens temporaires stockés côté serveur après OAuth (mode Electron browser externe)
let pendingTokens = null;

function openInSystemBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open'
               : process.platform === 'win32'  ? 'explorer'
               : 'xdg-open';
  spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
}

function createSpotifyAuthRouter({ spotify }) {
  const router = express.Router();

  const SCOPE =
    'user-read-private user-read-email user-modify-playback-state user-read-playback-state streaming user-library-modify user-library-read playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative user-top-read user-read-recently-played';

  // ── Flux browser normal (ou Electron ancien mode) ─────────────────────────
  function buildAuthUrl(state) {
    return (
      'https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: spotify.clientId,
        scope: SCOPE,
        redirect_uri: spotify.redirectUri,
        state,
        show_dialog: true, // force le dialogue pour garantir les nouveaux scopes
      })
    );
  }

  router.get('/login', (req, res) => {
    const state = generateRandomString(16);
    res.redirect(buildAuthUrl(state));
  });

  // ── Electron : ouvrir le navigateur système ────────────────────────────────
  router.get('/auth/open-browser', (req, res) => {
    const state = generateRandomString(16);
    const authUrl = buildAuthUrl(state);
    openInSystemBrowser(authUrl);
    res.json({ ok: true });
  });

  // ── Electron : polling — retourne les tokens une fois disponibles ──────────
  router.get('/auth/pending', (req, res) => {
    if (pendingTokens) {
      const tokens = pendingTokens;
      pendingTokens = null;
      return res.json({ ok: true, ...tokens });
    }
    res.json({ ok: false });
  });

  // ── Callback OAuth (commun browser + Electron) ────────────────────────────
  router.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
      res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
      return;
    }

    try {
      const response = await axios({
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: querystring.stringify({
          code,
          redirect_uri: spotify.redirectUri,
          grant_type: 'authorization_code',
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' + Buffer.from(spotify.clientId + ':' + spotify.clientSecret).toString('base64'),
        },
      });

      const { access_token, refresh_token } = response.data;

      // Stocker pour le polling Electron
      pendingTokens = { access_token, refresh_token };
      // Expiration auto après 5 min si jamais le polling ne se fait pas
      setTimeout(() => { pendingTokens = null; }, 5 * 60 * 1000);

      // Redirection browser normal (navigateur web standard)
      res.redirect('/#' + querystring.stringify({ access_token, refresh_token }));
    } catch (error) {
      console.error('Auth Error:', error.response ? error.response.data : error.message);
      res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
    }
  });

  router.get('/refresh_token', async (req, res) => {
    const refresh_token = req.query.refresh_token;
    try {
      const response = await axios({
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: querystring.stringify({
          grant_type: 'refresh_token',
          refresh_token,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' + Buffer.from(spotify.clientId + ':' + spotify.clientSecret).toString('base64'),
        },
      });
      res.send({ access_token: response.data.access_token });
    } catch (error) {
      res.status(500).send(error.response ? error.response.data : error.message);
    }
  });

  return router;
}

module.exports = {
  createSpotifyAuthRouter,
};
