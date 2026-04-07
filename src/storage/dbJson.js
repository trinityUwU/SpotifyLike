const fs = require('fs');

const FLUSH_INTERVAL_MS = 10_000; // flush sur disque toutes les 10s

function createJsonDb({ dbFilePath }) {
  let cache = null;
  let dirty = false;

  const defaultData = () => ({
    playlists: [],
    likes: [],
    history: [],
    artists: [],
    conversionCache: {},
    playerState: {
      currentTrack: null,
      playbackQueue: [],
      isShuffle: false,
      repeatMode: 'off',
      volume: 60,
      progressMs: 0,
    },
  });

  function load() {
    if (cache) return cache;

    if (!fs.existsSync(dbFilePath)) {
      cache = defaultData();
      return cache;
    }

    cache = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
    if (!cache.playlists) cache.playlists = [];
    if (!cache.likes) cache.likes = [];
    if (!cache.history) cache.history = [];
    if (!cache.artists) cache.artists = [];
    if (!cache.conversionCache) cache.conversionCache = {};
    if (!cache.playerState) {
      cache.playerState = {
        currentTrack: null,
        playbackQueue: [],
        isShuffle: false,
        repeatMode: 'off',
        volume: 60,
        progressMs: 0,
      };
    }
    return cache;
  }

  function save(data) {
    cache = data;
    dirty = true;
  }

  function flush() {
    if (dirty && cache) {
      fs.writeFileSync(dbFilePath, JSON.stringify(cache, null, 2));
      dirty = false;
    }
  }

  // Flush périodique (évite les écritures disque à chaque requête)
  const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  // Ne pas bloquer le process si c'est le seul timer restant
  if (flushTimer.unref) flushTimer.unref();

  // Flush propre à l'arrêt du process
  process.on('exit', flush);
  process.on('SIGINT', () => { flush(); process.exit(); });
  process.on('SIGTERM', () => { flush(); process.exit(); });

  return { load, save, flush };
}

module.exports = {
  createJsonDb,
};
