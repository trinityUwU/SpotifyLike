const fs = require('fs');

function createJsonDb({ dbFilePath }) {
  function load() {
    if (!fs.existsSync(dbFilePath)) {
      return { playlists: [], likes: [], history: [] };
    }
    const data = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
    if (!data.playlists) data.playlists = [];
    if (!data.likes) data.likes = [];
    if (!data.history) data.history = [];
    if (!data.artists) data.artists = [];
    if (!data.playerState) {
      data.playerState = {
        currentTrack: null,
        playbackQueue: [],
        isShuffle: false,
        repeatMode: 'off',
        volume: 60,
        progressMs: 0
      };
    }
    return data;
  }

  function save(data) {
    fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2));
  }

  return { load, save };
}

module.exports = {
  createJsonDb,
};
