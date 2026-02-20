const fs = require('fs');

function createJsonDb({ dbFilePath }) {
  function load() {
    if (!fs.existsSync(dbFilePath)) {
      return { playlists: [], likes: [], history: [] };
    }
    const data = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
    if (!data.history) data.history = [];
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
