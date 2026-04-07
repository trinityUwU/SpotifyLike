const axios = require('axios');

/**
 * @param {object} options
 * @param {object} [options.db] - instance dbJson (optionnel) pour persister le cache entre redémarrages
 */
function createDeezerToSpotifyConverter({ db } = {}) {
  // Cache mémoire : deezerId (string) -> spotifyUri (string | null)
  const trackCache = new Map();

  // Pré-charger le cache depuis la DB si disponible
  if (db) {
    try {
      const data = db.load();
      const stored = data.conversionCache || {};
      for (const [id, uri] of Object.entries(stored)) {
        trackCache.set(id, uri);
      }
      console.log(`[ConversionCache] ${trackCache.size} entrées chargées depuis la DB`);
    } catch (e) {
      console.warn('[ConversionCache] Impossible de charger depuis la DB:', e.message);
    }
  }

  function persistToDb(deezerId, spotifyUri) {
    if (!db) return;
    try {
      const data = db.load();
      if (!data.conversionCache) data.conversionCache = {};
      data.conversionCache[deezerId] = spotifyUri;
      db.save(data); // écriture différée (flush périodique dans dbJson)
    } catch (e) {
      console.warn('[ConversionCache] Impossible de persister:', e.message);
    }
  }

  async function convert({ deezerId, spotifyToken }) {
    const key = String(deezerId);

    if (trackCache.has(key)) {
      console.log(`[Cache Hit] ${key} -> ${trackCache.get(key)}`);
      return { spotifyUri: trackCache.get(key) };
    }

    let spotifyUri = null;

    try {
      const deezerRes = await axios.get(`https://api.deezer.com/track/${key}`);
      const track = deezerRes.data;

      if (track.error) {
        const error = new Error('Deezer track not found');
        error.status = 404;
        throw error;
      }

      const { isrc, title, duration } = track;
      const artist = track.artist.name;

      // Tentative 1 : recherche par ISRC (précis, 1 seul appel Spotify)
      if (isrc) {
        try {
          const spotifyIsrcRes = await axios.get('https://api.spotify.com/v1/search', {
            params: { q: `isrc:${isrc}`, type: 'track', limit: 1 },
            headers: { Authorization: `Bearer ${spotifyToken}` },
          });

          const items = spotifyIsrcRes.data.tracks?.items;
          if (items && items.length > 0) {
            spotifyUri = items[0].uri;
            console.log(`[ISRC Match] ${isrc} -> ${spotifyUri}`);
          }
        } catch (err) {
          console.warn('Spotify ISRC Search failed:', err.message);
        }
      }

      // Tentative 2 : recherche floue titre+artiste (seulement si ISRC a échoué)
      if (!spotifyUri) {
        console.log(`[Fallback Search] ${title} - ${artist}`);
        try {
          const spotifySearchRes = await axios.get('https://api.spotify.com/v1/search', {
            params: { q: `track:${title} artist:${artist}`, type: 'track', limit: 5 },
            headers: { Authorization: `Bearer ${spotifyToken}` },
          });

          const items = spotifySearchRes.data.tracks?.items;
          if (items && items.length > 0) {
            items.sort((a, b) => {
              const durA = Math.abs(a.duration_ms / 1000 - duration);
              const durB = Math.abs(b.duration_ms / 1000 - duration);
              return durA - durB;
            });

            const best = items[0];
            if (Math.abs(best.duration_ms / 1000 - duration) < 10) {
              spotifyUri = best.uri;
              console.log(`[Fuzzy Match] ${best.name} -> ${spotifyUri}`);
            }
          }
        } catch (err) {
          console.warn('Spotify Fuzzy Search failed:', err.message);
        }
      }

      trackCache.set(key, spotifyUri);
      persistToDb(key, spotifyUri);
      return { spotifyUri };
    } catch (err) {
      // Mettre en cache même les échecs pour éviter de re-interroger
      trackCache.set(key, null);
      persistToDb(key, null);
      throw err;
    }
  }

  return { convert };
}

module.exports = {
  createDeezerToSpotifyConverter,
};
