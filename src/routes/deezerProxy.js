const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

function createDeezerProxyRouter() {
  const router = express.Router();

  router.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    try {
      const deezerPath = (req.path || '').replace(/^\//, '');
      const query = querystring.stringify(req.query);
      const url = `https://api.deezer.com/${deezerPath}?${query}`;

      console.log(`[Deezer Proxy] ${deezerPath} -> ${url}`);

      const response = await axios.get(url);
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
