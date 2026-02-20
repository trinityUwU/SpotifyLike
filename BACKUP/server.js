import express from 'express';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Chargement des variables d'environnement ──────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '.env.local');

try {
  const envFile = readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...values] = trimmed.split('=');
    if (key && values.length > 0) process.env[key.trim()] = values.join('=').trim();
  }
  console.log('✅ .env.local chargé');
} catch {
  console.warn('⚠️  .env.local introuvable, utilisation des variables système');
}

const app = express();
const PORT = 3001;
const REDIRECT_URI = 'http://127.0.0.1:3001/callback';
const CLIENT_ID = process.env.VITE_SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ VITE_SPOTIFY_CLIENT_ID ou SPOTIFY_CLIENT_SECRET manquant');
  process.exit(1);
}

// ─── Initialisation de l'API Spotify (pour Auth) ───────────────────────────
const spotifyApi = new SpotifyWebApi({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: REDIRECT_URI
});

app.use(cors());
app.use(express.json());

// ─── Client Credentials Token (CC) ────────────────────────────────────────
// Permet de faire des appels Spotify SANS token utilisateur (données publiques).
// Le CC token est partagé par toutes les requêtes et auto-rafraîchi.
// ⚡ Avantage: soulage le quota du token utilisateur et permet le cache serveur.
let ccToken = null;
let ccTokenExpiry = 0;

async function getClientCredentialsToken() {
  if (ccToken && Date.now() < ccTokenExpiry - 60_000) {
    return ccToken; // encore valide
  }
  console.log('🔑 Obtention d\'un nouveau Client Credentials token...');
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`CC token error: ${err}`);
  }
  const data = await resp.json();
  ccToken = data.access_token;
  ccTokenExpiry = Date.now() + data.expires_in * 1000;
  console.log(`✅ CC token obtenu (expire dans ${Math.round(data.expires_in / 60)} min)`);
  return ccToken;
}

// ─── Cache serveur pour les requêtes Spotify via CC token ─────────────────
// TTL long = moins de 429. Les données musicales changent très rarement.
const SERVER_CACHE = new Map(); // key → { data, expiresAt }
const CACHE_TTL = {
  playlist: 300_000,   // 5min
  artist: 600_000,   // 10min
  track: 600_000,   // 10min
  search: 60_000,   // 1min
  default: 300_000,   // 5min
};

function getCacheTTL(path) {
  if (path.includes('playlists')) return CACHE_TTL.playlist;
  if (path.includes('artists')) return CACHE_TTL.artist;
  if (path.includes('tracks')) return CACHE_TTL.track;
  if (path.includes('search')) return CACHE_TTL.search;
  return CACHE_TTL.default;
}


function getFromCache(key) {
  const entry = SERVER_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { SERVER_CACHE.delete(key); return null; }
  return entry.data;
}

function setInCache(key, data, ttl) {
  SERVER_CACHE.set(key, { data, expiresAt: Date.now() + ttl });
}

// ─── Proxy Spotify via Client Credentials ─────────────────────────────────
// Toutes les données PUBLIQUES passent par ce proxy :
//   GET /api/spotify/playlists/{id}
//   GET /api/spotify/artists/{id}/top-tracks
//   GET /api/spotify/artists/{id}/related-artists
//   GET /api/spotify/artists/{id}
//   etc.
//
// ⚠️  NE PAS utiliser pour /me/* (nécessite token utilisateur)
// ─── Queue séquentielle anti-rate-limit ─────────────────────────────────
// Spotify autorise ~25 req/30s en Dev Mode.
// On limite à 1 requête toutes les 350ms = ~85 req/30s max théorique,
// mais en pratique avec le cache on est bien en dessous.
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 350;
const requestQueue = [];
let processingQueue = false;

async function enqueueSpotifyRequest(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    if (!processingQueue) processNextRequest();
  });
}

async function processNextRequest() {
  if (requestQueue.length === 0) { processingQueue = false; return; }
  processingQueue = true;

  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + MIN_REQUEST_INTERVAL_MS - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  const { fn, resolve, reject } = requestQueue.shift();
  lastRequestTime = Date.now();
  try { resolve(await fn()); } catch (e) { reject(e); }
  setTimeout(processNextRequest, 0);
}

// Fetch Spotify avec gestion 429 + parsing safe (texte ou JSON)
async function safeSpotifyFetch(url, token, retries = 3) {
  return enqueueSpotifyRequest(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // 204 No Content
      if (resp.status === 204) return null;

      // Parser safe : Spotify peut retourner du texte brut en cas de 429
      const contentType = resp.headers.get('content-type') || '';
      let data;
      if (contentType.includes('json')) {
        data = await resp.json();
      } else {
        const text = await resp.text();
        try { data = JSON.parse(text); }
        catch { data = { error: { status: resp.status, message: text.slice(0, 200) } }; }
      }

      // Succès
      if (resp.ok) return data;

      // Rate limit 429 : attendre et réessayer
      if (resp.status === 429 && attempt < retries) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
        const waitMs = (retryAfter + 1) * 1000;
        console.warn(`[SpotifyProxy] 429 sur ${url.split('?')[0].split('/v1/')[1]} — wait ${retryAfter}s (retry ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Autres erreurs : on throw avec le status
      const errMsg = data?.error?.message || `HTTP_${resp.status}`;
      const err = new Error(errMsg);
      err.status = resp.status;
      throw err;
    }
    throw new Error('Max retries reached');
  });
}

// ─────────────────────────────────────────────────────────────────────────
// STRATÉGIE TOKENS (proxy Spotify) :
//   - Playlists / shows / episodes → token UTILISATEUR (header Authorization)
//     Raison : le CC token est rate-limité pendant 20h+ sur les playlists éditoriales.
//   - Artistes / albums            → CC token (données publiques, quota séparé)
// ─────────────────────────────────────────────────────────────────────────
const PLAYLIST_PATHS = new Set(['playlists', 'shows', 'episodes', 'browse']);

const spotifyProxyHandler = async (req, res) => {
  try {
    const fullPath = req.path;
    const spotifyPath = fullPath.replace(/^\//, '');

    // Bloquer /me/* : user token direct côté client seulement
    if (spotifyPath.startsWith('me/') || spotifyPath === 'me') {
      return res.status(400).json({ error: 'Use user token for /me/* endpoints' });
    }

    const query = new URLSearchParams(req.query);
    const firstSegment = spotifyPath.split('/')[0];
    const needsUserToken = PLAYLIST_PATHS.has(firstSegment);

    let token;
    if (needsUserToken) {
      // Playlists → token utilisateur transmis depuis le frontend
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'User token required for playlists' });
      }
      token = authHeader.replace('Bearer ', '').trim();
      // Pas de market override : from_token est valide avec user token
    } else {
      // Artistes / albums → CC token (quota indépendant)
      token = await getClientCredentialsToken();
      if (!query.has('market') || query.get('market') === 'from_token') {
        query.set('market', 'FR');
      }
    }

    const spotifyUrl = `https://api.spotify.com/v1/${spotifyPath}?${query.toString()}`;
    const cacheKey = `${needsUserToken ? 'user' : 'cc'}::${spotifyUrl}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Token-Type', needsUserToken ? 'user' : 'cc');
      return res.json(cached);
    }

    const data = await safeSpotifyFetch(spotifyUrl, token);
    if (data === null) return res.status(204).send();

    const ttl = getCacheTTL(spotifyPath);
    setInCache(cacheKey, data, ttl);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Token-Type', needsUserToken ? 'user' : 'cc');
    res.setHeader('X-Cache-TTL', String(ttl));
    res.json(data);

  } catch (err) {
    const status = err.status || 500;
    console.error(`❌ Proxy Spotify (${status}):`, err.message);
    res.status(status).json({ error: { status, message: err.message } });
  }
};





// Express 5 / path-to-regexp v8 compatible :
// app.use() avec un préfixe ne nécessite PAS de wildcard.
// Toutes les requêtes commençant par /api/spotify passent par spotifyProxyHandler.
app.use('/api/spotify', spotifyProxyHandler);

// ─── Proxy Deezer API (GRATUIT, SANS CLÉ, SANS OAUTH) ─────────────────────
// Deezer expose une API publique totalement ouverte : https://api.deezer.com
// Aucune clé API requise. Parfait pour compléter les endpoints Spotify restreints.
//
// Endpoints utilisables GRATUITEMENT :
//   GET /api/deezer/artist/{id}            → infos artiste (image HD, fans, nb_albums)
//   GET /api/deezer/artist/{id}/top        → top tracks de l'artiste
//   GET /api/deezer/artist/{id}/related    → artistes SIMILAIRES ✨ (403 sur Spotify Dev)
//   GET /api/deezer/artist/{id}/albums     → albums de l'artiste
//   GET /api/deezer/search?q={query}       → recherche tracks/artistes/albums
//   GET /api/deezer/playlist/{id}          → playlist publique Deezer
//
// Endpoints spéciaux (résolution par NOM depuis Spotify) :
//   GET /api/deezer/by-name/{name}/related → artistes similaires via nom Spotify
//   GET /api/deezer/by-name/{name}/top     → top tracks via nom Spotify

const DEEZER_BASE = 'https://api.deezer.com';
const DEEZER_CACHE = new Map();
const DEEZER_CACHE_TTL = 300_000; // 5 minutes (Deezer change peu)

function getDeezerCache(key) {
  const e = DEEZER_CACHE.get(key);
  if (!e || Date.now() > e.expiresAt) { DEEZER_CACHE.delete(key); return null; }
  return e.data;
}
function setDeezerCache(key, data) {
  DEEZER_CACHE.set(key, { data, expiresAt: Date.now() + DEEZER_CACHE_TTL });
}

async function deezerGet(path) {
  const cacheKey = path;
  const cached = getDeezerCache(cacheKey);
  if (cached) return { data: cached, hit: true };

  const url = `${DEEZER_BASE}/${path}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'SpotifyLike-App/1.0' }
  });
  if (!resp.ok) throw new Error(`Deezer ${resp.status} on ${path}`);
  const data = await resp.json();
  if (data.error) throw new Error(`Deezer error: ${JSON.stringify(data.error)}`);
  setDeezerCache(cacheKey, data);
  return { data, hit: false };
}

// Résoudre un nom d'artiste → ID Deezer via la recherche
async function resolveArtistDeezerID(artistName) {
  const cacheKey = `resolve::${artistName.toLowerCase()}`;
  const cached = getDeezerCache(cacheKey);
  if (cached) return cached;

  const q = encodeURIComponent(artistName);
  const resp = await fetch(`${DEEZER_BASE}/search/artist?q=${q}&limit=1`, {
    headers: { 'User-Agent': 'SpotifyLike-App/1.0' }
  });
  const data = await resp.json();
  const artist = data.data?.[0];
  if (!artist) throw new Error(`Deezer: artiste "${artistName}" introuvable`);
  setDeezerCache(cacheKey, artist.id);
  return artist.id;
}

// Handler générique pour /api/deezer/*
const deezerProxyHandler = async (req, res) => {
  try {
    const deezerPath = req.path.replace(/^\//, '');

    // Endpoints spéciaux : résolution par nom d'artiste
    // /by-name/{encoded_name}/related ou /top
    if (deezerPath.startsWith('by-name/')) {
      const parts = deezerPath.split('/');
      const artistName = decodeURIComponent(parts[1]);
      const action = parts[2]; // 'related', 'top', 'albums'

      console.log(`[Deezer] Résolution "${artistName}" → /artist/{id}/${action}`);
      const deezerID = await resolveArtistDeezerID(artistName);
      const { data, hit } = await deezerGet(`artist/${deezerID}/${action}?limit=20`);

      res.setHeader('X-Deezer-Artist-ID', deezerID);
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      return res.json(data);
    }

    // Proxy générique
    const { data, hit } = await deezerGet(`${deezerPath}${req.query ? `?${new URLSearchParams(req.query)}` : ''}`);
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    res.json(data);

  } catch (err) {
    console.error('❌ Proxy Deezer error:', err.message);
    res.status(502).json({ error: err.message });
  }
};

app.use('/api/deezer', deezerProxyHandler);

// ─── Route Login ───────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  const scopes = [
    'ugc-image-upload',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'app-remote-control',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-follow-modify',
    'user-follow-read',
    'user-read-playback-position',
    'user-top-read',
    'user-read-recently-played',
    'user-library-modify',
    'user-library-read',
    'user-read-email',
    'user-read-private',
  ];

  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'state');
  console.log('🔗 Redirection vers URL Auth:', authorizeURL);
  res.redirect(authorizeURL);
});

// ─── Route Callback ────────────────────────────────────────────────────────
app.get('/callback', (req, res) => {
  const error = req.query.error;
  const code = req.query.code;

  if (error) {
    console.error('Callback Error:', error);
    res.redirect(`http://127.0.0.1:5173/?error=${encodeURIComponent(error)}`);
    return;
  }

  spotifyApi.authorizationCodeGrant(code)
    .then(data => {
      const { access_token, refresh_token, expires_in } = data.body;
      console.log('✅ Token récupéré avec succès');
      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);
      res.redirect(`http://127.0.0.1:5173/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
    })
    .catch(err => {
      console.error('❌ Erreur lors de l\'échange de code:', err);
      res.redirect(`http://127.0.0.1:5173/?error=auth_failed`);
    });
});

// ─── Route Refresh Token ───────────────────────────────────────────────────
app.post('/refresh-token', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.sendStatus(400);

  const refreshApi = new SpotifyWebApi({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    refreshToken: refresh_token
  });

  refreshApi.refreshAccessToken()
    .then(data => {
      console.log('✅ Token rafraîchi');
      res.json({
        access_token: data.body.access_token,
        expires_in: data.body.expires_in
      });
    })
    .catch(err => {
      console.error('❌ Erreur refresh token:', err);
      res.sendStatus(400);
    });
});

// ─── Route de santé du serveur ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const token = await getClientCredentialsToken();
    res.json({
      status: 'ok',
      ccToken: !!token,
      cacheSize: SERVER_CACHE.size,
      ccTokenExpiresIn: Math.round((ccTokenExpiry - Date.now()) / 1000) + 's'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Pré-chauffer le CC token au démarrage
getClientCredentialsToken().catch(err => {
  console.warn('⚠️  Impossible d\'obtenir le CC token au démarrage:', err.message);
});

app.listen(PORT, () => {
  console.log(`🎵 Spotify Auth Server running on port ${PORT}`);
  console.log(`📡 Proxy CC disponible sur http://127.0.0.1:${PORT}/api/spotify/*`);
});
