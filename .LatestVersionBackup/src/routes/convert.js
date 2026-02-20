const express = require('express');

function createConvertRouter({ converter }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { deezerId, spotifyToken } = req.body;

    if (!deezerId || !spotifyToken) {
      return res.status(400).json({ error: 'Missing deezerId or spotifyToken' });
    }

    try {
      const { spotifyUri } = await converter.convert({ deezerId, spotifyToken });
      res.json({ spotifyUri });
    } catch (error) {
      if (error && error.status === 404) {
        res.status(404).json({ error: 'Deezer track not found' });
        return;
      }

      console.error('Conversion Error:', error.message);
      res.status(500).json({ error: 'Conversion failed' });
    }
  });

  return router;
}

module.exports = {
  createConvertRouter,
};
