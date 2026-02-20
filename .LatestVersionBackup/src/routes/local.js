const express = require('express');

function createLocalRouter({ db }) {
  const router = express.Router();

  router.get('/artists', (req, res) => {
    const data = db.load();
    res.json(data.artists || []);
  });

  router.post('/artists', (req, res) => {
    const artist = req.body;
    if (!artist || !artist.id) return res.status(400).json({ error: 'Invalid artist' });

    const data = db.load();
    if (!data.artists) data.artists = [];

    const index = data.artists.findIndex((a) => a.id === artist.id);

    if (index === -1) {
      data.artists.push(artist);
      db.save(data);
      res.json({ followed: true });
    } else {
      res.json({ followed: true, message: 'Already followed' });
    }
  });

  router.delete('/artists/:id', (req, res) => {
    const { id } = req.params;
    const data = db.load();
    if (!data.artists) data.artists = [];

    const index = data.artists.findIndex((a) => a.id == id);

    if (index !== -1) {
      data.artists.splice(index, 1);
      db.save(data);
      res.json({ followed: false });
    } else {
      res.status(404).json({ error: 'Artist not found' });
    }
  });

  router.get('/artists/:id', (req, res) => {
    const { id } = req.params;
    const data = db.load();
    const isFollowed = data.artists && data.artists.some((a) => a.id == id);
    res.json({ followed: isFollowed || false });
  });

  router.get('/playlists', (req, res) => {
    const data = db.load();
    res.json(data.playlists);
  });

  router.post('/playlists', (req, res) => {
    const { name, description, cover, creator } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const data = db.load();
    const newPlaylist = {
      id: Date.now().toString(),
      name,
      description: description || '',
      cover: cover || null,
      creator: creator || 'You',
      tracks: [],
      createdAt: new Date().toISOString(),
    };

    data.playlists.push(newPlaylist);
    db.save(data);
    res.json(newPlaylist);
  });

  router.put('/playlists/:id', (req, res) => {
    const { id } = req.params;
    const { name, cover } = req.body;
    const data = db.load();
    const playlist = data.playlists.find((p) => p.id === id);

    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    if (name) playlist.name = name;
    if (cover !== undefined) playlist.cover = cover;

    db.save(data);
    res.json(playlist);
  });

  router.delete('/playlists/:id', (req, res) => {
    const { id } = req.params;
    const data = db.load();
    const index = data.playlists.findIndex((p) => p.id === id);

    if (index === -1) return res.status(404).json({ error: 'Playlist not found' });

    data.playlists.splice(index, 1);
    db.save(data);
    res.json({ success: true });
  });

  router.post('/playlists/:id/tracks', (req, res) => {
    const { id } = req.params;
    const body = req.body;

    const data = db.load();
    const playlist = data.playlists.find((p) => p.id === id);

    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const tracksToAdd = Array.isArray(body) ? body : [body];
    let addedCount = 0;

    tracksToAdd.forEach((track) => {
      if (!playlist.tracks.find((t) => t.id === track.id)) {
        playlist.tracks.push(track);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      db.save(data);
    }

    res.json({ ...playlist, added: addedCount });
  });

  router.delete('/playlists/:id/tracks/:trackId', (req, res) => {
    const { id, trackId } = req.params;

    const data = db.load();
    const playlist = data.playlists.find((p) => p.id === id);

    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const initialLength = playlist.tracks.length;
    playlist.tracks = playlist.tracks.filter((t) => t.id != trackId);

    if (playlist.tracks.length !== initialLength) {
      db.save(data);
    }

    res.json(playlist);
  });

  router.get('/likes', (req, res) => {
    const data = db.load();
    res.json(data.likes);
  });

  router.post('/likes', (req, res) => {
    const track = req.body;
    const data = db.load();

    const index = data.likes.findIndex((t) => t.id === track.id);

    if (index === -1) {
      data.likes.push(track);
      db.save(data);
      res.json({ liked: true, track });
    } else {
      data.likes.splice(index, 1);
      db.save(data);
      res.json({ liked: false, trackId: track.id });
    }
  });

  router.get('/likes/:id', (req, res) => {
    const { id } = req.params;
    const data = db.load();
    const isLiked = data.likes.some((t) => t.id == id);
    res.json({ liked: isLiked });
  });

  router.get('/history', (req, res) => {
    const data = db.load();
    res.json(data.history.slice(-20).reverse());
  });

  router.post('/history', (req, res) => {
    const track = req.body;
    if (!track || !track.id) return res.status(400).json({ error: 'Invalid track' });

    const data = db.load();

    const existingIndex = data.history.findIndex((t) => t.id === track.id);
    if (existingIndex !== -1) {
      data.history.splice(existingIndex, 1);
    }

    data.history.push(track);

    if (data.history.length > 50) {
      data.history.shift();
    }

    db.save(data);
    res.json({ success: true });
  });

  return router;
}

module.exports = {
  createLocalRouter,
};
