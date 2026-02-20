const path = require('path');

const PORT = Number(process.env.PORT || 8888);

const paths = {
  publicDir: path.join(__dirname, '..', 'public'),
  dbFile: path.join(__dirname, '..', 'data', 'db.json'),
};

const spotify = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: `http://127.0.0.1:${PORT}/callback`,
};

module.exports = {
  PORT,
  paths,
  spotify,
};
