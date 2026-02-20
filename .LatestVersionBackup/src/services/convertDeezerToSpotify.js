const axios = require('axios');

function createDeezerToSpotifyConverter() {
  const trackCache = new Map();

  async function convert({ deezerId, spotifyToken }) {
    if (trackCache.has(deezerId)) {
      console.log(`[Cache Hit] ${deezerId} -> ${trackCache.get(deezerId)}`);
      return { spotifyUri: trackCache.get(deezerId) };
    }

    let spotifyUri = null;

    try {
      const deezerRes = await axios.get(`https://api.deezer.com/track/${deezerId}`);
      const track = deezerRes.data;

      if (track.error) {
        const error = new Error('Deezer track not found');
        error.status = 404;
        throw error;
      }

      const isrc = track.isrc;
      const title = track.title;
      const artist = track.artist.name;
      const duration = track.duration;

      if (isrc) {
        try {
          const spotifyIsrcRes = await axios.get(`https://api.spotify.com/v1/search`, {
            params: { q: `isrc:${isrc}`, type: 'track', limit: 1 },
            headers: { Authorization: `Bearer ${spotifyToken}` },
          });

          if (spotifyIsrcRes.data.tracks && spotifyIsrcRes.data.tracks.items.length > 0) {
            spotifyUri = spotifyIsrcRes.data.tracks.items[0].uri;
            console.log(`[ISRC Match] ${isrc} -> ${spotifyUri}`);
          }
        } catch (err) {
          console.warn('Spotify ISRC Search failed:', err.message);
        }
      }

      if (!spotifyUri) {
        console.log(`[Fallback Search] ${title} - ${artist}`);
        try {
          const query = `track:${title} artist:${artist}`;
          const spotifySearchRes = await axios.get(`https://api.spotify.com/v1/search`, {
            params: { q: query, type: 'track', limit: 5 },
            headers: { Authorization: `Bearer ${spotifyToken}` },
          });

          if (spotifySearchRes.data.tracks && spotifySearchRes.data.tracks.items.length > 0) {
            const items = spotifySearchRes.data.tracks.items;
            items.sort((a, b) => {
              const durA = Math.abs(a.duration_ms / 1000 - duration);
              const durB = Math.abs(b.duration_ms / 1000 - duration);
              return durA - durB;
            });

            const bestMatch = items[0];
            if (Math.abs(bestMatch.duration_ms / 1000 - duration) < 10) {
              spotifyUri = bestMatch.uri;
              console.log(`[Fuzzy Match] Found: ${bestMatch.name} (${bestMatch.uri})`);
            }
          }
        } catch (err) {
          console.warn('Spotify Fuzzy Search failed:', err.message);
        }
      }

      trackCache.set(deezerId, spotifyUri);
      return { spotifyUri };
    } catch (err) {
      trackCache.set(deezerId, spotifyUri);
      throw err;
    }
  }

  return { convert };
}

module.exports = {
  createDeezerToSpotifyConverter,
};
