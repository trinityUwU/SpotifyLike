require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const querystring = require('querystring');
const open = require('open');
const fs = require('fs');

const app = express();
const PORT = 8888; // Default Spotify redirect port usually involves 8888 or 3000
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Local Database Logic ---

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        return { playlists: [], likes: [], history: [] };
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.history) data.history = []; // Ensure history exists for old DBs
    return data;
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- Local API Endpoints ---

// Get followed artists
app.get('/api/local/artists', (req, res) => {
    const db = loadDB();
    res.json(db.artists || []);
});

// Follow Artist
app.post('/api/local/artists', (req, res) => {
    const artist = req.body; // { id, name, picture... }
    if (!artist || !artist.id) return res.status(400).json({ error: 'Invalid artist' });
    
    const db = loadDB();
    if (!db.artists) db.artists = [];
    
    const index = db.artists.findIndex(a => a.id === artist.id);
    
    if (index === -1) {
        db.artists.push(artist);
        saveDB(db);
        res.json({ followed: true });
    } else {
        res.json({ followed: true, message: 'Already followed' });
    }
});

// Unfollow Artist
app.delete('/api/local/artists/:id', (req, res) => {
    const { id } = req.params;
    const db = loadDB();
    if (!db.artists) db.artists = [];
    
    const index = db.artists.findIndex(a => a.id == id); // Loose equality for string/number
    
    if (index !== -1) {
        db.artists.splice(index, 1);
        saveDB(db);
        res.json({ followed: false });
    } else {
        res.status(404).json({ error: 'Artist not found' });
    }
});

// Check if artist is followed
app.get('/api/local/artists/:id', (req, res) => {
    const { id } = req.params;
    const db = loadDB();
    const isFollowed = db.artists && db.artists.some(a => a.id == id);
    res.json({ followed: isFollowed || false });
});

// Get all playlists
app.get('/api/local/playlists', (req, res) => {
    const db = loadDB();
    res.json(db.playlists);
});

// Create playlist
app.post('/api/local/playlists', (req, res) => {
    const { name, description, cover, creator } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const db = loadDB();
    const newPlaylist = {
        id: Date.now().toString(),
        name,
        description: description || '',
        cover: cover || null,
        creator: creator || 'You', // Store creator/author
        tracks: [],
        createdAt: new Date().toISOString()
    };
    
    db.playlists.push(newPlaylist);
    saveDB(db);
    res.json(newPlaylist);
});

// Delete playlist
app.delete('/api/local/playlists/:id', (req, res) => {
    const { id } = req.params;
    const db = loadDB();
    const index = db.playlists.findIndex(p => p.id === id);
    
    if (index === -1) return res.status(404).json({ error: 'Playlist not found' });
    
    db.playlists.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
});

// Add track(s) to playlist
app.post('/api/local/playlists/:id/tracks', (req, res) => {
    const { id } = req.params;
    const body = req.body; // Can be single track or array of tracks
    
    const db = loadDB();
    const playlist = db.playlists.find(p => p.id === id);
    
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    
    const tracksToAdd = Array.isArray(body) ? body : [body];
    let addedCount = 0;

    tracksToAdd.forEach(track => {
        // Check if track already exists in playlist
        if (!playlist.tracks.find(t => t.id === track.id)) {
            playlist.tracks.push(track);
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        saveDB(db);
    }
    
    res.json({ ...playlist, added: addedCount });
});

// Remove track from playlist
app.delete('/api/local/playlists/:id/tracks/:trackId', (req, res) => {
    const { id, trackId } = req.params;
    
    const db = loadDB();
    const playlist = db.playlists.find(p => p.id === id);
    
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    
    const initialLength = playlist.tracks.length;
    // Filter out the track (handle string/number mismatch)
    playlist.tracks = playlist.tracks.filter(t => t.id != trackId);
    
    if (playlist.tracks.length !== initialLength) {
        saveDB(db);
    }
    
    res.json(playlist);
});

// Get liked tracks
app.get('/api/local/likes', (req, res) => {
    const db = loadDB();
    res.json(db.likes);
});

// Toggle Like (Add/Remove)
app.post('/api/local/likes', (req, res) => {
    const track = req.body;
    const db = loadDB();
    
    const index = db.likes.findIndex(t => t.id === track.id);
    
    if (index === -1) {
        // Add
        db.likes.push(track);
        saveDB(db);
        res.json({ liked: true, track });
    } else {
        // Remove
        db.likes.splice(index, 1);
        saveDB(db);
        res.json({ liked: false, trackId: track.id });
    }
});

// Check if track is liked
app.get('/api/local/likes/:id', (req, res) => {
    const { id } = req.params;
    const db = loadDB();
    const isLiked = db.likes.some(t => t.id == id); // Use loose equality for string/number ID mismatch
    res.json({ liked: isLiked });
});


// --- History Logic ---

// Get history
app.get('/api/local/history', (req, res) => {
    const db = loadDB();
    // Return last 6 items, most recent first
    res.json(db.history.slice(-6).reverse());
});

// Add to history
app.post('/api/local/history', (req, res) => {
    const track = req.body;
    if (!track || !track.id) return res.status(400).json({ error: 'Invalid track' });

    const db = loadDB();
    
    // Remove if already exists (to move it to the end)
    const existingIndex = db.history.findIndex(t => t.id === track.id);
    if (existingIndex !== -1) {
        db.history.splice(existingIndex, 1);
    }
    
    // Add to end
    db.history.push(track);
    
    // Limit history size (keep last 50)
    if (db.history.length > 50) {
        db.history.shift();
    }
    
    saveDB(db);
    res.json({ success: true });
});



// In-memory cache for Deezer -> Spotify mapping to minimize API calls
// Format: { deezerId: spotifyUri }
const trackCache = new Map();

// --- Configuration ---
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

// --- Spotify Auth Endpoints ---

app.get('/login', (req, res) => {
    const scope = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state streaming user-library-modify user-library-read playlist-modify-public playlist-modify-private playlist-read-private';
    const state = generateRandomString(16);
    
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: state
        }));
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        try {
            const response = await axios({
                method: 'post',
                url: 'https://accounts.spotify.com/api/token',
                data: querystring.stringify({
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code'
                }),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
                }
            });

            const { access_token, refresh_token } = response.data;
            
            // Redirect back to main page with tokens in hash
            res.redirect('/#' + querystring.stringify({
                access_token: access_token,
                refresh_token: refresh_token
            }));
        } catch (error) {
            console.error('Auth Error:', error.response ? error.response.data : error.message);
            res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
        }
    }
});

app.get('/refresh_token', async (req, res) => {
    const refresh_token = req.query.refresh_token;
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });
        res.send({
            'access_token': response.data.access_token
        });
    } catch (error) {
        res.status(500).send(error.response ? error.response.data : error.message);
    }
});

// --- Deezer Proxy (Public Metadata) ---

app.use('/api/deezer', async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
        const path = req.path.substring(1); // Remove leading slash
        const query = querystring.stringify(req.query);
        const url = `https://api.deezer.com/${path}?${query}`;
        
        console.log(`[Deezer Proxy] ${path} -> ${url}`);

        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error('Deezer Proxy Error:', error.message);
        res.status(500).json({ error: 'Deezer API Error' });
    }
});

// --- Core Logic: Deezer ID -> Spotify URI Conversion ---

app.post('/api/convert', async (req, res) => {
    const { deezerId, spotifyToken } = req.body;

    if (!deezerId || !spotifyToken) {
        return res.status(400).json({ error: 'Missing deezerId or spotifyToken' });
    }

    // 1. Check Cache
    if (trackCache.has(deezerId)) {
        console.log(`[Cache Hit] ${deezerId} -> ${trackCache.get(deezerId)}`);
        return res.json({ spotifyUri: trackCache.get(deezerId) });
    }

    try {
        // 2. Fetch Deezer Track Details (to get ISRC and metadata)
        const deezerRes = await axios.get(`https://api.deezer.com/track/${deezerId}`);
        const track = deezerRes.data;

        if (track.error) {
            return res.status(404).json({ error: 'Deezer track not found' });
        }

        const isrc = track.isrc;
        const title = track.title;
        const artist = track.artist.name;
        const duration = track.duration; // in seconds

        let spotifyUri = null;

        // 3. Search Spotify by ISRC (Primary Strategy)
        if (isrc) {
            try {
                const spotifyIsrcRes = await axios.get(`https://api.spotify.com/v1/search`, {
                    params: {
                        q: `isrc:${isrc}`,
                        type: 'track',
                        limit: 1
                    },
                    headers: { 'Authorization': `Bearer ${spotifyToken}` }
                });

                if (spotifyIsrcRes.data.tracks && spotifyIsrcRes.data.tracks.items.length > 0) {
                    spotifyUri = spotifyIsrcRes.data.tracks.items[0].uri;
                    console.log(`[ISRC Match] ${isrc} -> ${spotifyUri}`);
                }
            } catch (err) {
                console.warn('Spotify ISRC Search failed:', err.message);
            }
        }

        // 4. Fallback: Search by Title + Artist (Secondary Strategy)
        if (!spotifyUri) {
            console.log(`[Fallback Search] ${title} - ${artist}`);
            try {
                const query = `track:${title} artist:${artist}`;
                const spotifySearchRes = await axios.get(`https://api.spotify.com/v1/search`, {
                    params: {
                        q: query,
                        type: 'track',
                        limit: 5 // Get a few to compare duration
                    },
                    headers: { 'Authorization': `Bearer ${spotifyToken}` }
                });

                if (spotifySearchRes.data.tracks && spotifySearchRes.data.tracks.items.length > 0) {
                    // Find best match by duration
                    const items = spotifySearchRes.data.tracks.items;
                    // Sort by duration difference
                    items.sort((a, b) => {
                        const durA = Math.abs((a.duration_ms / 1000) - duration);
                        const durB = Math.abs((b.duration_ms / 1000) - duration);
                        return durA - durB;
                    });
                    
                    // Take the closest if within reasonable margin (e.g., 5 seconds)
                    const bestMatch = items[0];
                    if (Math.abs((bestMatch.duration_ms / 1000) - duration) < 10) {
                        spotifyUri = bestMatch.uri;
                        console.log(`[Fuzzy Match] Found: ${bestMatch.name} (${bestMatch.uri})`);
                    }
                }
            } catch (err) {
                console.warn('Spotify Fuzzy Search failed:', err.message);
            }
        }

        // 5. Cache and Return
        trackCache.set(deezerId, spotifyUri); // Cache even if null (to avoid repeated failed lookups)
        res.json({ spotifyUri });

    } catch (error) {
        console.error('Conversion Error:', error.message);
        res.status(500).json({ error: 'Conversion failed' });
    }
});

// Helper
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

app.listen(PORT, () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
    // open(`http://127.0.0.1:${PORT}`);
});
