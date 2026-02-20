const express = require('express');
const cors = require('cors');

const { createJsonDb } = require('./storage/dbJson');
const { createLocalRouter } = require('./routes/local');
const { createSpotifyAuthRouter } = require('./routes/authSpotify');
const { createDeezerProxyRouter } = require('./routes/deezerProxy');
const { createDeezerToSpotifyConverter } = require('./services/convertDeezerToSpotify');
const { createConvertRouter } = require('./routes/convert');

function createApp({ config }) {
  const app = express();

  app.use(cors());
  app.use(express.static(config.paths.publicDir));
  app.use(express.json());

  const db = createJsonDb({ dbFilePath: config.paths.dbFile });
  const converter = createDeezerToSpotifyConverter();

  app.use('/', createSpotifyAuthRouter({ spotify: config.spotify }));
  app.use('/api/local', createLocalRouter({ db }));
  app.use('/api/deezer', createDeezerProxyRouter());
  app.use('/api/convert', createConvertRouter({ converter }));

  return app;
}

module.exports = {
  createApp,
};
