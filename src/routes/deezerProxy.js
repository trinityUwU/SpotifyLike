const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

// TTL par type de ressource Deezer (en ms)
const CACHE_TTL = {
  chart:   10 * 60 * 1000,  // 10 min  – les charts changent peu
  search:   2 * 60 * 1000,  //  2 min  – résultats de recherche
  artist:  30 * 60 * 1000,  // 30 min  – métadonnées artiste
  album:   30 * 60 * 1000,  // 30 min  – métadonnées album
  track:   60 * 60 * 1000,  // 60 min  – métadonnées piste
  default:  5 * 60 * 1000,  //  5 min  – tout le reste
};

function getTTL(path) {
  for (const [key, ttl] of Object.entries(CACHE_TTL)) {
    if (key !== 'default' && path.startsWith(key)) return ttl;
  }
  return CACHE_TTL.default;
}

function createDeezerProxyRouter() {
  const router = express.Router();
  const cache = new Map(); // cacheKey -> { data, expiresAt }

  router.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
      const deezerPath = (req.path || '').replace(/^\//, '');
      const query = querystring.stringify(req.query);
      const cacheKey = `${deezerPath}?${query}`;

      // Servir depuis le cache si valide
      const cached = cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.set('X-Cache', 'HIT');
        return res.json(cached.data);
      }

      const url = `https://api.deezer.com/${deezerPath}?${query}`;
      console.log(`[Deezer Proxy] MISS ${deezerPath}`);

      const response = await axios.get(url);
      const ttl = getTTL(deezerPath);
      cache.set(cacheKey, { data: response.data, expiresAt: Date.now() + ttl });

      res.set('X-Cache', 'MISS');
      res.json(response.data);
    } catch (error) {
      console.error('Deezer Proxy Error:', error.message);
      res.status(500).json({ error: 'Deezer API Error' });
    }
  });

  return router;
}

module.exports = {
  createDeezerProxyRouter,
};
