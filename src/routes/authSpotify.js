const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const { generateRandomString } = require('../utils/random');

function createSpotifyAuthRouter({ spotify }) {
  const router = express.Router();

  router.get('/login', (req, res) => {
    const scope =
      'user-read-private user-read-email user-modify-playback-state user-read-playback-state streaming user-library-modify user-library-read playlist-modify-public playlist-modify-private playlist-read-private';
    const state = generateRandomString(16);

    res.redirect(
      'https://accounts.spotify.com/authorize?' +
        querystring.stringify({
          response_type: 'code',
          client_id: spotify.clientId,
          scope,
          redirect_uri: spotify.redirectUri,
          state,
        }),
    );
  });

  router.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
      res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
      return;
    }

    try {
      const response = await axios({
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: querystring.stringify({
          code,
          redirect_uri: spotify.redirectUri,
          grant_type: 'authorization_code',
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' + Buffer.from(spotify.clientId + ':' + spotify.clientSecret).toString('base64'),
        },
      });

      const { access_token, refresh_token } = response.data;

      res.redirect(
        '/#' +
          querystring.stringify({
            access_token,
            refresh_token,
          }),
      );
    } catch (error) {
      console.error('Auth Error:', error.response ? error.response.data : error.message);
      res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
    }
  });

  router.get('/refresh_token', async (req, res) => {
    const refresh_token = req.query.refresh_token;
    try {
      const response = await axios({
        method: 'post',
        url: 'https://accounts.spotify.com/api/token',
        data: querystring.stringify({
          grant_type: 'refresh_token',
          refresh_token,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' + Buffer.from(spotify.clientId + ':' + spotify.clientSecret).toString('base64'),
        },
      });
      res.send({ access_token: response.data.access_token });
    } catch (error) {
      res.status(500).send(error.response ? error.response.data : error.message);
    }
  });

  return router;
}

module.exports = {
  createSpotifyAuthRouter,
};
