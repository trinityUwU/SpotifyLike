// 1. Spotify Auth Helpers & Immediate Redirection
function getUrlParams() {
    const params = {};
    const hash = window.location.hash.substring(1);
    if (!hash) return params;
    hash.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        params[key] = decodeURIComponent(value);
    });
    return params;
}

function checkAuth() {
    const params = getUrlParams();
    if (params.access_token) {
        console.log('Token found in URL, saving to localStorage');
        localStorage.setItem('spotify_access_token', params.access_token);
        if (params.refresh_token) {
            localStorage.setItem('spotify_refresh_token', params.refresh_token);
        }
        window.location.hash = ''; // Clean URL
    }

    const token = localStorage.getItem('spotify_access_token');
    const isLoginPage = window.location.pathname.includes('login.html');

    console.log('Checking Auth - Token exists:', !!token, 'isLoginPage:', isLoginPage);

    if (!token && !isLoginPage) {
        console.log('No token and not on login page, redirecting to login.html');
        window.location.href = 'login.html';
        return false;
    }
    if (token && isLoginPage) {
        console.log('Token exists and on login page, redirecting to home');
        window.location.href = '/';
        return false;
    }
    return true;
}

// Enforce authentication on script load
if (!checkAuth()) {
    // If not authenticated, we stop here (browser will redirect)
    throw new Error('Authentication required. Redirecting to login.html...');
}

let currentArtistId = 1424821; // Default
let audioPlayer = new Audio();
let isPlaying = false;
let currentTrack = null;
let bgHistory = [];
let currentBgIndex = 0;

let spotifyPlayer = null;
let spotifyDeviceId = null;

// Détection Electron (userAgent contient "Electron") — le SDK Spotify y est inutilisable
// sans Widevine CDM. On utilise l'API REST Spotify Connect à la place.
const isElectron = /Electron\//.test(navigator.userAgent);
const hasMpris = isElectron && !!window.electronAPI;
let progressInterval = null;
let currentProgressMs = 0;
let currentDurationMs = 0;
let isShuffle = false;
let repeatMode = 'off'; // 'off', 'context', 'track'
let volume = 60;
let lastVolume = 60;
let playbackQueue = [];
let queueContext = null; // e.g. 'playlist:123', 'album:456'

// ── Cache Spotify API (évite les 429) ────────────────────────────────────────
const _spotifyCache = new Map();
function _getCached(key) {
    const e = _spotifyCache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > e.ttl) { _spotifyCache.delete(key); return null; }
    return e.data;
}
function _setCache(key, data, ttl) { _spotifyCache.set(key, { data, ts: Date.now(), ttl }); }
function cachedSpotifyFetch(key, endpoint, ttlMs) {
    const hit = _getCached(key);
    if (hit) return Promise.resolve(hit);
    return spotifyFetch(endpoint).then(data => {
        if (data && !data.error) _setCache(key, data, ttlMs);
        return data;
    });
}

async function refreshSpotifyToken() {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) return null;
    try {
        const res = await fetch(`/refresh_token?refresh_token=${refreshToken}`).then(r => r.json());
        if (res.access_token) {
            localStorage.setItem('spotify_access_token', res.access_token);
            return res.access_token;
        }
    } catch (e) {
        console.error('Failed to refresh token', e);
    }
    return null;
}

async function spotifyFetch(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('spotify_access_token');
    if (!token) return { error: 'No token' };

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, options);

    // Handle 204 No Content
    if (res.status === 204) return { success: true };

    if (res.status === 401) {
        const newToken = await refreshSpotifyToken();
        if (newToken) return spotifyFetch(endpoint, method, body);
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return res.json();
    } else {
        const text = await res.text();
        return { success: res.ok, text };
    }
}

async function resolveSpotifyUri(track) {
    if (!track) return null;

    // Déjà résolu lors d'un appel précédent
    if (track.spotify_uri) return track.spotify_uri;

    // 1. Passer par le backend /api/convert (cache mémoire + DB, ISRC via Deezer full-track)
    if (track.id) {
        const token = localStorage.getItem('spotify_access_token');
        try {
            const res = await fetch('/api/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deezerId: track.id, spotifyToken: token })
            }).then(r => r.json());

            if (res.spotifyUri) {
                track.spotify_uri = res.spotifyUri;
                const spotifyId = res.spotifyUri.split(':')[2];
                track.spotify_id = spotifyId;
                if (track.id && isTrackLiked(track.id)) {
                    fetch('/api/local/likes/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: track.id, spotify_id: spotifyId })
                    }).catch(() => {});
                    const liked = likedTracks.find(t => t.id == track.id);
                    if (liked && !liked.spotify_id) liked.spotify_id = spotifyId;
                }
                return res.spotifyUri;
            }
        } catch (e) {
            console.warn('Backend convert failed, falling back to direct search:', e.message);
        }
    }

    // 2. Fallback : recherche Spotify directe (piste sans ID Deezer, ou échec backend)
    let spotifyTrack = null;
    if (track.isrc) {
        const res = await spotifyFetch(`/search?q=isrc:${track.isrc}&type=track&limit=1`);
        if (res.tracks?.items?.length > 0) spotifyTrack = res.tracks.items[0];
    }
    if (!spotifyTrack && track.title && track.artist?.name) {
        const query = `track:"${track.title}" artist:"${track.artist.name}"`;
        const res = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
        if (res.tracks?.items?.length > 0) spotifyTrack = res.tracks.items[0];
    }
    if (spotifyTrack) {
        track.spotify_id = spotifyTrack.id;
        track.spotify_uri = spotifyTrack.uri;
        if (track.id && isTrackLiked(track.id)) {
            fetch('/api/local/likes/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: track.id, spotify_id: spotifyTrack.id })
            }).catch(() => {});
            const liked = likedTracks.find(t => t.id == track.id);
            if (liked && !liked.spotify_id) liked.spotify_id = spotifyTrack.id;
        }
        return spotifyTrack.uri;
    }
    return null;
}

/**
 * Fallback Spotify Connect : utilisé quand le Web Playback SDK n'est pas disponible
 * (ex. Electron sans Widevine). Cherche un appareil Spotify actif / disponible.
 */
async function findAvailableSpotifyDevice() {
    try {
        const res = await spotifyFetch('/me/player/devices');
        const devices = (res && res.devices) ? res.devices : [];
        const active = devices.find(d => d.is_active);
        const any    = devices.find(d => !d.is_restricted);
        const device = active || any;
        if (device) {
            console.log(`[Fallback] Spotify Connect → ${device.name} (${device.id})`);
            return device.id;
        }
    } catch (e) {
        console.warn('[Fallback] Impossible de trouver un appareil Spotify :', e.message);
    }
    return null;
}

window.onSpotifyWebPlaybackSDKReady = () => {
    const token = localStorage.getItem('spotify_access_token');
    if (!token) return;

    // SDK initialisé dans tous les contextes (Browser ET Electron avec castlabs/Widevine)
    spotifyPlayer = new Spotify.Player({
        name: 'SpotifyLIKE Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.5
    });

    spotifyPlayer.addListener('initialization_error', async ({ message }) => {
        console.error('SDK Init Error:', message);
        // Widevine absent (Electron sans castlabs) → fallback Spotify Connect
        const deviceId = await findAvailableSpotifyDevice();
        if (deviceId) {
            spotifyDeviceId = deviceId;
            console.warn('[Fallback] SDK indisponible, lecture via Spotify Connect →', deviceId);
            setTimeout(fetchSpotifyState, 800);
        } else {
            console.error('[Fallback] Aucun appareil Spotify Connect trouvé. Lancez Spotify sur un appareil.');
        }
    });
    spotifyPlayer.addListener('authentication_error', async ({ message }) => {
        console.error('SDK Auth Error:', message);
        const t = await refreshSpotifyToken();
        if (t) {
            window.location.reload();
        } else {
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('spotify_refresh_token');
            window.location.href = 'login.html';
        }
    });
    spotifyPlayer.addListener('account_error', ({ message }) => { console.error('SDK Account Error:', message); });
    spotifyPlayer.addListener('playback_error', ({ message }) => { console.error('SDK Playback Error:', message); });

    spotifyPlayer.addListener('player_state_changed', state => {
        if (!state) return;
        syncPlayerState(state);
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        spotifyDeviceId = device_id;
        // Transférer la lecture vers notre player Web
        spotifyFetch('/me/player', 'PUT', { device_ids: [device_id] });
        setTimeout(fetchSpotifyState, 500);
    });

    spotifyPlayer.connect();
};

function startProgressTicker() {
    stopProgressTicker();
    progressInterval = setInterval(() => {
        if (isPlaying) {
            currentProgressMs += 1000;
            if (currentProgressMs > currentDurationMs) currentProgressMs = currentDurationMs;
            updateProgressBarUI(currentProgressMs, currentDurationMs);
        }
    }, 1000);
}

function stopProgressTicker() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function updateProgressBarUI(position, duration) {
    if (!duration) return;
    const pct = (position / duration) * 100;
    els.progressFill.style.width = `${pct}%`;

    const curMin = Math.floor(position / 1000 / 60);
    const curSec = Math.floor((position / 1000) % 60);
    els.currentTime.innerText = `${curMin}:${curSec < 10 ? '0' : ''}${curSec}`;

    const totMin = Math.floor(duration / 1000 / 60);
    const totSec = Math.floor((duration / 1000) % 60);
    els.totalTime.innerText = `${totMin}:${totSec < 10 ? '0' : ''}${totSec}`;
}

// ID de la piste lors du dernier poll – sert à décider si la queue doit être re-fetchée
let _lastPolledTrackId = null;

async function fetchSpotifyState() {
    try {
        const state = await spotifyFetch('/me/player');
        if (state && state.item) {
            const trackChanged = state.item.id !== _lastPolledTrackId;
            _lastPolledTrackId = state.item.id;

            isPlaying = state.is_playing;
            currentProgressMs = state.progress_ms;
            currentDurationMs = state.item.duration_ms;
            isShuffle = state.shuffle_state;
            repeatMode = state.repeat_state;
            volume = state.device.volume_percent;

            updatePlayIcon();
            updateProgressBarUI(currentProgressMs, currentDurationMs);
            updateVolumeUI(volume);
            updateShuffleRepeatUI();
            updatePlayerLikeIcon(state.item.id);

            // Update metadata with links
            updatePlayerMetadata(state.item);

            if (isPlaying) startProgressTicker();
            else stopProgressTicker();

            // Persist the state we just fetched from global Spotify
            persistPlayerState();

            // Sync la queue uniquement si la piste a changé (économise 1 appel Spotify sur 2)
            if (trackChanged) {
                const queueRes = await spotifyFetch('/me/player/queue');
                if (queueRes && queueRes.queue) {
                    const globalQueue = queueRes.queue.map(t => ({
                        id: t.id,
                        title: t.name,
                        artist: { name: t.artists[0].name },
                        album: {
                            title: t.album.name,
                            images: t.album.images,
                            cover_small: t.album.images[t.album.images.length - 1].url
                        },
                        spotify_id: t.id,
                        duration: Math.floor(t.duration_ms / 1000)
                    }));

                    if (JSON.stringify(globalQueue) !== JSON.stringify(playbackQueue)) {
                        playbackQueue = globalQueue;
                        if (els.queueMenu.classList.contains('show')) {
                            renderQueue();
                        }
                        persistPlayerState();
                    }
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch Spotify state', e);
    }
}

function persistPlayerState() {
    const state = {
        currentTrack,
        playbackQueue,
        isShuffle,
        repeatMode,
        volume,
        currentProgressMs
    };
    fetch('/api/local/player-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
    }).catch(e => console.error('Failed to persist player state', e));
}

function updateVolumeUI(vol) {
    if (!els.volumeFill) return;
    els.volumeFill.style.width = `${vol}%`;
    // Update icon
    const iconClass = vol === 0 ? 'fa-volume-xmark' : (vol < 50 ? 'fa-volume-low' : 'fa-volume-high');
    if (els.volumeIcon) {
        els.volumeIcon.className = `fa-solid ${iconClass} volume-icon`;
    }
}

function updateShuffleRepeatUI() {
    if (!els.shuffleBtn || !els.repeatBtn) return;

    // Shuffle
    if (isShuffle) {
        els.shuffleBtn.classList.add('active');
        els.shuffleBtn.style.color = '#1db954';
    } else {
        els.shuffleBtn.classList.remove('active');
        els.shuffleBtn.style.color = '';
    }

    // Repeat
    if (repeatMode !== 'off') {
        els.repeatBtn.classList.add('active');
        els.repeatBtn.style.color = '#1db954';
    } else {
        els.repeatBtn.classList.remove('active');
        els.repeatBtn.style.color = '';
    }

    // MPRIS : synchroniser shuffle/loop
    mprisUpdatePlayback();
}

async function toggleShuffle() {
    const newState = !isShuffle;
    await spotifyFetch(`/me/player/shuffle?state=${newState}`, 'PUT');
    isShuffle = newState;
    updateShuffleRepeatUI();
    persistPlayerState();
}

async function toggleRepeat() {
    const modes = ['off', 'context', 'track'];
    let nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];

    await spotifyFetch(`/me/player/repeat?state=${nextMode}`, 'PUT');
    repeatMode = nextMode;
    updateShuffleRepeatUI();
    persistPlayerState();
}

async function setSpotifyVolume(vol) {
    if (vol < 0) vol = 0;
    if (vol > 100) vol = 100;

    if (spotifyPlayer) {
        spotifyPlayer.setVolume(vol / 100);
    }

    await spotifyFetch(`/me/player/volume?volume_percent=${vol}`, 'PUT');
    volume = vol;
    updateVolumeUI(vol);
    persistPlayerState();
}

function toggleMute() {
    if (volume > 0) {
        lastVolume = volume;
        setSpotifyVolume(0);
    } else {
        setSpotifyVolume(lastVolume || 60);
    }
}

let _lastLikeCheckedId = null;

async function updatePlayerLikeIcon(trackId) {
    if (!els.npLikeIcon || !trackId) return;

    // Local cache hit — réponse immédiate
    if (isTrackLiked(trackId)) {
        els.npLikeIcon.classList.remove('fa-regular');
        els.npLikeIcon.classList.add('fa-solid', 'liked');
        return;
    }

    // Pas en cache : vérifier auprès de Spotify (une seule fois par titre)
    if (_lastLikeCheckedId === trackId) return;
    _lastLikeCheckedId = trackId;

    try {
        const data = await spotifyFetch(`/me/tracks/contains?ids=${trackId}`);
        const liked = Array.isArray(data) && data[0] === true;
        if (liked) {
            els.npLikeIcon.classList.remove('fa-regular');
            els.npLikeIcon.classList.add('fa-solid', 'liked');
        } else {
            els.npLikeIcon.classList.remove('fa-solid', 'liked');
            els.npLikeIcon.classList.add('fa-regular');
        }
    } catch (_) {
        // Fallback silencieux — icône déjà en état non-liké
    }
}

function syncPlayerState(state) {
    if (!state) return;

    isPlaying = !state.paused;
    currentProgressMs = state.position;
    currentDurationMs = state.duration;
    isShuffle = state.shuffle;

    const modes = ['off', 'context', 'track'];
    repeatMode = modes[state.repeat_mode] || 'off';

    updatePlayIcon();
    updateProgressBarUI(currentProgressMs, currentDurationMs);
    updateShuffleRepeatUI();

    if (isPlaying) startProgressTicker();
    else stopProgressTicker();

    // Metadata & Like icon
    if (state.track_window && state.track_window.current_track) {
        const st = state.track_window.current_track;
        updatePlayerLikeIcon(st.id);

        // Always update metadata to ensure links are correct (in case ID matches currentTrack info)
        updatePlayerMetadata(st);
        highlightCurrentTrack();
    }
}

function updatePlayerMetadata(st) {
    if (!st) return;

    let albumId = null;
    let artists = [];

    // Try to reconcile with our current Deezer-backed track for IDs
    if (currentTrack && (currentTrack.id == st.id || currentTrack.spotify_id == st.id)) {
        albumId = currentTrack.album && currentTrack.album.id;
        artists = [{ name: currentTrack.artist.name, id: currentTrack.artist.id }];
    } else {
        // Fallback to what Spotify gives us
        if (st.artists) {
            artists = st.artists.map(a => ({ name: a.name }));
        }
        // If we have an album object with an ID and it's from Spotify directly, 
        // we can't open Deezer view with Spotify ID yet.
        // We might search for the album later, but for now just text or search link.
    }

    // 1. Update Title (Link to Album)
    const albumName = (st.album && st.album.name) ? st.album.name : '';
    const artistNameForSearch = artists[0] ? artists[0].name : '';

    if (albumId) {
        els.npTitle.innerHTML = `<span class="nav-link" onclick="openDetailView('album', ${albumId})">${st.name}</span>`;
    } else if (albumName) {
        els.npTitle.innerHTML = `<span class="nav-link" onclick="handleAlbumClick('${albumName.replace(/'/g, "\\'")}', '${artistNameForSearch.replace(/'/g, "\\'")}')">${st.name}</span>`;
    } else {
        els.npTitle.innerText = st.name;
    }

    // 2. Update Artists (Link to Profiles)
    if (artists.length > 0) {
        els.npArtist.innerHTML = artists.map(a => {
            if (a.id) {
                return `<span class="nav-link" onclick="loadArtist(${a.id})">${a.name}</span>`;
            } else {
                return `<span class="nav-link" onclick="handleArtistClick('${a.name.replace(/'/g, "\\'")}')">${a.name}</span>`;
            }
        }).join(', ');
    } else {
        els.npArtist.innerText = '-';
    }

    // 3. Update Cover
    if (st.album && st.album.images && st.album.images[0]) {
        els.npCover.src = st.album.images[0].url;
    }
}

async function showDeviceSelector(e) {
    if (e) e.stopPropagation();

    // Toggle if already open
    if (els.deviceMenu.classList.contains('show')) {
        _hideMenu(els.deviceMenu, () => els.deviceMenu.classList.remove('show'));
        return;
    }

    const res = await spotifyFetch('/me/player/devices');
    const devices = res.devices || [];

    if (devices.length === 0) {
        alert("Aucun appareil Spotify trouvé.");
        return;
    }

    let html = '';
    devices.forEach(d => {
        html += `
            <div class="device-item ${d.id === spotifyDeviceId ? 'active' : ''}" onclick="switchDevice('${d.id}')">
                <i class="fa-solid ${d.type === 'Computer' ? 'fa-laptop' : 'fa-mobile-screen'}"></i>
                <div class="flex-grow flex flex-col items-start px-2">
                    <span class="font-bold text-sm">${d.name}</span>
                    <span class="text-xs text-spotifyTextGray">${d.type}</span>
                </div>
                ${d.is_active ? '<span class="active-badge">Actif</span>' : ''}
            </div>
        `;
    });

    els.deviceListContainer.innerHTML = html;
    _showMenu(els.deviceMenu);
    els.deviceMenu.classList.add('show');
}

async function switchDevice(deviceId) {
    await spotifyFetch('/me/player', 'PUT', {
        device_ids: [deviceId],
        play: true
    });
    spotifyDeviceId = deviceId;
    els.deviceMenu.classList.remove('show');
    console.log('Switched to device', deviceId);
}

window.switchDevice = switchDevice; // Expose to global scope for onclick
window.openDetailView = openDetailView;
window.loadArtist = loadArtist;
window.handleSearch = handleSearch;
window.handleArtistClick = handleArtistClick;
window.handleAlbumClick = handleAlbumClick;
window.addToQueue = addToQueue;
window.removeFromQueue = removeFromQueue;

// DOM Elements
const els = {
    artistImage: document.getElementById('artist-image'),
    latestTracksCount: document.getElementById('latest-tracks-count'),
    name: document.getElementById('artist-name'),
    listeners: document.getElementById('artist-listeners'),
    latestCover: document.getElementById('latest-cover'),
    latestTitle: document.getElementById('latest-title'),
    latestDate: document.getElementById('latest-date'),
    popularList: document.getElementById('popular-tracks'),
    albumsList: document.getElementById('albums-list'),
    singlesList: document.getElementById('singles-list'),
    playBtn: document.getElementById('play-pause-btn'),
    npTitle: document.getElementById('np-title'),
    npArtist: document.getElementById('np-artist'),
    npCover: document.getElementById('np-cover'),
    currentTime: document.querySelector('.time-label.current'),
    totalTime: document.querySelector('.time-label.total'),
    progressFill: document.querySelector('.progress-fill'),
    featuredAlbumTitle: document.getElementById('featured-album-title'),
    featuredAlbumImg: document.getElementById('featured-album-img'),

    // Search elements
    searchInput: document.getElementById('search-input'),
    artistView: document.getElementById('artist-view'),
    searchView: document.getElementById('search-view'),
    homeView: document.getElementById('home-view'),
    bestResultCard: document.getElementById('best-result-card'),
    searchTracksList: document.getElementById('search-tracks-list'),
    searchAlbumsGrid: document.getElementById('search-albums-grid'),

    // Home elements
    homeShortcuts: document.getElementById('home-shortcuts'),
    homeArtists: document.getElementById('home-artists'),
    homeTrends: document.getElementById('home-trends'),
    navHome: document.getElementById('nav-home'),
    navPlaylists: document.getElementById('nav-playlists'),
    bgCarousel: document.getElementById('bg-carousel'),

    // Playlists View
    playlistsView: document.getElementById('playlists-view'),
    playlistsGrid: document.getElementById('playlists-grid'),
    spotifyPlaylistsGrid: document.getElementById('spotify-playlists-grid'),
    createPlaylistBtn: document.getElementById('create-playlist-btn'),
    followedArtistsGrid: document.getElementById('followed-artists-grid'),

    // Detail View
    detailView: document.getElementById('detail-view'),
    detailLayout: document.querySelector('.detail-layout'),
    detailCover: document.getElementById('detail-cover'),
    detailType: document.getElementById('detail-type'),
    detailTitle: document.getElementById('detail-title'),
    detailOwnerImg: document.getElementById('detail-owner-img'),
    detailOwnerName: document.getElementById('detail-owner-name'),
    detailMetaText: document.getElementById('detail-meta-text'),
    detailTracksList: document.getElementById('detail-tracks-list'),
    detailPlayBtn: document.getElementById('detail-play-btn'),
    followBtn: document.querySelector('.btn-follow-hero'),
    latestRelease: document.getElementById('latest-release'),
    featuredBanner: document.querySelector('.featured-banner'),

    // Pagination
    detailPagination: document.getElementById('detail-pagination'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),
    pageInfo: document.getElementById('page-info'),
    detailFollowBtn: document.getElementById('detail-follow-btn'),
    contextMenu: document.getElementById('context-menu'),

    // Modal
    modal: document.getElementById('custom-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalDesc: document.getElementById('modal-description'),
    modalInput: document.getElementById('modal-input'),
    modalUploadBtn: document.getElementById('modal-upload-btn'),
    modalFileInput: document.getElementById('modal-file-input'),
    modalConfirm: document.getElementById('modal-confirm'),
    modalCancel: document.getElementById('modal-cancel'),
    modalCloseX: document.getElementById('modal-close-x'),

    // Device Menu
    deviceMenu: document.getElementById('device-menu'),
    deviceListContainer: document.getElementById('device-list-container'),

    // History Nav
    navBack: document.getElementById('nav-back'),
    navForward: document.getElementById('nav-forward'),

    // Liked tracks header
    detailHeaderLike: document.getElementById('detail-header-like'),

    // Advanced controls
    shuffleBtn: document.getElementById('shuffle-btn'),
    repeatBtn: document.getElementById('repeat-btn'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    volumeIcon: document.getElementById('volume-icon'),
    volumeBar: document.getElementById('volume-bar-container'),
    volumeFill: document.getElementById('volume-fill'),
    npLikeIcon: document.getElementById('np-like-icon'),
    queueBtn: document.getElementById('queue-btn'),
    queueMenu: document.getElementById('queue-menu'),
    queueListContainer: document.getElementById('queue-list-container'),

    // User menu
    userAvatarBtn: document.getElementById('user-avatar-btn'),
    userDropdown: document.getElementById('user-dropdown'),
    userDropdownAvatar: document.getElementById('user-dropdown-avatar'),
    userDropdownName: document.getElementById('user-dropdown-name'),
    logoutBtn: document.getElementById('logout-btn')
};

let currentArtistData = null;
let currentDetailData = null;
let currentDetailTracks = [];
let currentDetailPage = 0;
const TRACKS_PER_PAGE = 50;

// Returns a normalized context descriptor for the currently open detail view
function getDetailContextInfo() {
    if (!currentDetailData) return null;
    if (currentDetailData.id === 'liked') return { type: 'liked', id: 'liked' };
    if (currentDetailData.type === 'spotify-playlist') return { type: 'spotify-playlist', id: currentDetailData.id };
    return null; // album / local playlist → fallback queue
}

// History Navigation State
let historyBack = [];
let historyForward = [];
let isHistoryNavigating = false;
let currentAppState = null;

let likedTracks = [];

function isTrackLiked(trackId) {
    if (!trackId) return false;
    return likedTracks.some(t => t.id == trackId || t.spotify_id == trackId);
}

async function toggleLikeTrack(track, heartEl) {
    // L'état visuel de l'icône est la source de vérité (géré par updatePlayerLikeIcon)
    const wasLiked = heartEl.classList.contains('liked');
    const spotifyId = track.spotify_id || (track.id && isNaN(track.id) ? track.id : null);

    // Mise à jour optimiste de l'icône
    if (wasLiked) {
        heartEl.classList.remove('fa-solid', 'liked');
        heartEl.classList.add('fa-regular');
    } else {
        heartEl.classList.remove('fa-regular');
        heartEl.classList.add('fa-solid', 'liked');
    }
    // Anime.js pulse on the heart icon
    _A.pulse(heartEl, { scale: wasLiked ? 1.2 : 1.5, duration: wasLiked ? 300 : 440 });

    try {
        if (wasLiked) {
            // ── Unlike ────────────────────────────────────────────────────────
            likedTracks = likedTracks.filter(t => t.id != track.id && t.spotify_id != (spotifyId || track.id));
            if (spotifyId) spotifyFetch(`/me/tracks?ids=${spotifyId}`, 'DELETE').catch(() => {});
            // Retirer de la DB locale (idempotent)
            fetch('/api/local/likes', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(track)
            }).catch(() => {});
        } else {
            // ── Like ──────────────────────────────────────────────────────────
            if (!likedTracks.some(t => t.id == track.id || t.spotify_id == (spotifyId || track.id))) {
                likedTracks.unshift(track);
            }
            if (spotifyId) spotifyFetch(`/me/tracks?ids=${spotifyId}`, 'PUT').catch(() => {});
            // Ajouter à la DB locale (idempotent)
            fetch('/api/local/likes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(track)
            }).catch(() => {});
        }

        // Si on est sur la vue "Titres likés", rafraîchir
        if (currentDetailData && currentDetailData.id === 'liked') {
            currentDetailTracks = [...likedTracks];
            renderPagedTracks();
            const metaEl = document.getElementById('detail-meta-text');
            if (metaEl) metaEl.innerText = `• ${likedTracks.length} titres`;
        }
    } catch (e) {
        console.error('Failed to toggle like', e);
        // Rétablir l'icône en cas d'erreur
        if (wasLiked) {
            heartEl.classList.remove('fa-regular');
            heartEl.classList.add('fa-solid', 'liked');
        } else {
            heartEl.classList.remove('fa-solid', 'liked');
            heartEl.classList.add('fa-regular');
        }
    }
}

// History Navigation Helpers
function pushHistory(state) {
    if (isHistoryNavigating) return;
    if (currentAppState) {
        const last = historyBack[historyBack.length - 1];
        if (!last || JSON.stringify(last) !== JSON.stringify(currentAppState)) {
            historyBack.push(currentAppState);
        }
    }
    currentAppState = state;
    historyForward = [];
    updateNavButtons();
}

function updateNavButtons() {
    if (els.navBack) els.navBack.disabled = historyBack.length === 0;
    if (els.navForward) els.navForward.disabled = historyForward.length === 0;
}

async function goBack() {
    if (historyBack.length === 0 || isHistoryNavigating) return;
    isHistoryNavigating = true;
    historyForward.push(currentAppState);
    const state = historyBack.pop();
    currentAppState = state;
    await applyState(state);
    updateNavButtons();
    isHistoryNavigating = false;
}

async function goForward() {
    if (historyForward.length === 0 || isHistoryNavigating) return;
    isHistoryNavigating = true;
    historyBack.push(currentAppState);
    const state = historyForward.pop();
    currentAppState = state;
    await applyState(state);
    updateNavButtons();
    isHistoryNavigating = false;
}

async function applyState(state) {
    if (!state) return;
    switch (state.type) {
        case 'home': await loadHome(); break;
        case 'playlists': await loadPlaylists(); break;
        case 'artist': await loadArtist(state.id); break;
        case 'album':
        case 'playlist':
        case 'detail':
            await openDetailView(state.type === 'detail' ? state.detailType : state.type, state.id);
            break;
        case 'search':
            els.searchInput.value = state.query || '';
            await handleSearch(state.query);
            break;
    }
}

async function init() {
    if (!checkAuth()) return;

    // Initial load - Home is default
    await loadHome();
    initBgCarousel(); // Dynamic background

    // Restore Persistent Player State
    try {
        const savedState = await fetch('/api/local/player-state').then(r => r.json());
        if (savedState) {
            currentTrack = savedState.currentTrack || null;
            playbackQueue = savedState.playbackQueue || [];
            isShuffle = savedState.isShuffle || false;
            repeatMode = savedState.repeatMode || 'off';
            volume = savedState.volume !== undefined ? savedState.volume : 60;
            currentProgressMs = savedState.currentProgressMs || 0;

            // Sync UI
            if (currentTrack) {
                updatePlayerUI(currentTrack);
                updatePlayerLikeIcon(currentTrack.id || currentTrack.spotify_id);
            }
            updatePlayIcon();
            updateVolumeUI(volume);
            updateShuffleRepeatUI();

            if (currentTrack) {
                // If we have a track, try to highlight it once views are loaded
                setTimeout(highlightCurrentTrack, 1000);
            }
        }
    } catch (e) {
        console.error('Failed to restore player state', e);
    }

    // Sync with global Spotify state
    setTimeout(fetchSpotifyState, 1500);

    // Start periodic polling for global sync (every 30 seconds – the progress bar
    // is handled locally by startProgressTicker, so no need to poll Spotify more often)
    setInterval(fetchSpotifyState, 30_000);

    // Fetch Liked Tracks (local + premières 50 Spotify pour l'icône cœur immédiate)
    try {
        const [localLikes, spotifyPage] = await Promise.all([
            fetch('/api/local/likes').then(r => r.json()),
            spotifyFetch('/me/tracks?limit=50').catch(() => null)
        ]);
        const spotifyLikes = spotifyPage?.items
            ? spotifyPage.items.map(item => normalizeSpotifyTrack(item)).filter(Boolean)
            : [];
        const spotifyIds = new Set(spotifyLikes.map(t => t.spotify_id).filter(Boolean));
        const uniqueLocals = localLikes.filter(t => !t.spotify_id || !spotifyIds.has(t.spotify_id));
        likedTracks = [...spotifyLikes, ...uniqueLocals];
    } catch (e) {
        console.error('Failed to fetch likes', e);
    }

    // Global Player Events
    els.playBtn.addEventListener('click', () => { _A.pop(els.playBtn); togglePlay(); });
    // audioPlayer events removed as we use SDK sync

    // Progress bar click to seek
    document.querySelector('.progress-bar-container').addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const duration = currentDurationMs;
        if (!duration) return;
        const positionMs = Math.floor(duration * pct);
        currentProgressMs = positionMs;
        updateProgressBarUI(positionMs, duration);
        if (spotifyPlayer) {
            spotifyPlayer.seek(positionMs);
        } else {
            spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, 'PUT');
        }
    });

    // History Nav Events
    els.navBack.addEventListener('click', goBack);
    els.navForward.addEventListener('click', goForward);

    // Device Picker
    const devicePickerBtn = document.getElementById('device-picker-btn');
    if (devicePickerBtn) devicePickerBtn.addEventListener('click', showDeviceSelector);

    // Next/Prev
    if (els.nextBtn) els.nextBtn.addEventListener('click', () => {
        if (spotifyPlayer) {
            spotifyPlayer.nextTrack();
        } else {
            spotifyFetch('/me/player/next', 'POST').then(() => setTimeout(fetchSpotifyState, 500));
        }
    });
    if (els.prevBtn) els.prevBtn.addEventListener('click', () => {
        if (spotifyPlayer) {
            spotifyPlayer.previousTrack();
        } else {
            spotifyFetch('/me/player/previous', 'POST').then(() => setTimeout(fetchSpotifyState, 500));
        }
    });

    // Queue Menu
    if (els.queueBtn) els.queueBtn.addEventListener('click', showQueueSelector);

    // Shuffle/Repeat
    if (els.shuffleBtn) els.shuffleBtn.addEventListener('click', toggleShuffle);
    if (els.repeatBtn) els.repeatBtn.addEventListener('click', toggleRepeat);

    // Volume controls
    if (els.volumeIcon) els.volumeIcon.addEventListener('click', toggleMute);

    const handleVolumeChange = (e) => {
        const rect = els.volumeBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSpotifyVolume(Math.round(pct));
    };

    let isVolumeDragging = false;
    if (els.volumeBar) {
        els.volumeBar.addEventListener('mousedown', (e) => {
            isVolumeDragging = true;
            handleVolumeChange(e);
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isVolumeDragging) handleVolumeChange(e);
    });

    document.addEventListener('mouseup', () => {
        isVolumeDragging = false;
    });

    // Search Events
    let debounceTimer;
    els.searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleSearch(e.target.value);
        }, 500);
    });

    // Nav Events
    els.navHome.addEventListener('click', (e) => {
        e.preventDefault();
        loadHome();
    });

    els.navPlaylists.addEventListener('click', (e) => {
        e.preventDefault();
        loadPlaylists();
    });

    els.createPlaylistBtn.addEventListener('click', createPlaylist);

    // ── Menu profil utilisateur ───────────────────────────────────────────────
    els.userAvatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (els.userDropdown.classList.contains('open')) {
            anime.remove(els.userDropdown);
            anime({ targets: els.userDropdown, opacity: [1, 0], translateY: [0, -8], scale: [1, 0.96], duration: _A.d(160), easing: 'easeInQuad', complete: () => els.userDropdown.classList.remove('open') });
        } else {
            els.userDropdown.classList.add('open');
            anime.remove(els.userDropdown);
            anime({ targets: els.userDropdown, opacity: [0, 1], translateY: [-10, 0], scale: [0.96, 1], duration: _A.d(200), easing: 'easeOutCubic' });
        }
    });
    document.addEventListener('click', () => {
        if (els.userDropdown.classList.contains('open')) {
            anime.remove(els.userDropdown);
            anime({ targets: els.userDropdown, opacity: [1, 0], translateY: [0, -8], duration: _A.d(150), easing: 'easeInQuad', complete: () => els.userDropdown.classList.remove('open') });
        }
    });

    els.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        window.location.href = 'login.html';
    });

    // Charger le vrai profil Spotify (photo + nom)
    // La photo Spotify n'écrase pas une photo personnalisée définie dans les settings
    spotifyFetch('/me').then(profile => {
        if (!profile || profile.error) return;
        if (profile.display_name) {
            els.userDropdownName.textContent = profile.display_name;
        }
        const img = profile.images && profile.images[0] ? profile.images[0].url : null;
        if (img && !appSettings.profilePhotoOverride) {
            els.userAvatarBtn.src = img;
            els.userDropdownAvatar.src = img;
        }
    }).catch(() => {});

    initSettings();
    initMpris();

    els.followBtn.addEventListener('click', toggleFollow);

    // Player Like icon event handler
    if (els.npLikeIcon) {
        els.npLikeIcon.addEventListener('click', async () => {
            // Utiliser l'état SDK si disponible, sinon currentTrack local
            let st;
            if (spotifyPlayer) {
                const state = await spotifyPlayer.getCurrentState();
                st = state?.track_window?.current_track || null;
            }
            if (!st) {
                if (!currentTrack) return;
                st = { id: currentTrack.spotify_id || currentTrack.id, name: currentTrack.title };
            }

            // Try to find if we have this track in our "currentTrack" object locally
            // to preserve more metadata (like Deezer ID if available)
            let trackToLike = null;
            if (currentTrack && (currentTrack.id == st.id || currentTrack.spotify_id == st.id)) {
                trackToLike = currentTrack;
            } else {
                trackToLike = {
                    id: st.id,
                    spotify_id: st.id,
                    title: st.name,
                    artist: {
                        name: st.artists && st.artists[0] ? st.artists[0].name : 'Unknown Artist',
                        id: null
                    },
                    album: {
                        id: st.album && st.album.uri ? st.album.uri.split(':')[2] : null,
                        title: st.album ? st.album.name : '',
                        cover_small: st.album && st.album.images && st.album.images[0] ? st.album.images[0].url : ''
                    },
                    duration: Math.floor((st.duration_ms || 0) / 1000)
                };
            }

            toggleLikeTrack(trackToLike, els.npLikeIcon);
        });
    }

    // Pagination Events
    els.prevPageBtn.addEventListener('click', () => {
        if (currentDetailPage > 0) {
            currentDetailPage--;
            renderPagedTracks();
        }
    });

    els.nextPageBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(currentDetailTracks.length / TRACKS_PER_PAGE) - 1;
        if (currentDetailPage < maxPage) {
            currentDetailPage++;
            renderPagedTracks();
        }
    });

    els.detailFollowBtn.addEventListener('click', toggleAlbumFollow);

    // Detail play button — lance toute la vue avec le contexte approprié
    if (els.detailPlayBtn) els.detailPlayBtn.addEventListener('click', () => {
        if (!currentDetailTracks || currentDetailTracks.length === 0) return;
        const ctx = getDetailContextInfo();
        // Si shuffle actif, choisir un titre aléatoire ; sinon le premier
        const startTrack = isShuffle
            ? currentDetailTracks[Math.floor(Math.random() * currentDetailTracks.length)]
            : currentDetailTracks[0];
        playTrack(startTrack, currentDetailTracks, ctx);
    });

    // Library Filters
    document.querySelectorAll('.library-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            const playlistsSection = document.getElementById('playlists-section');
            const spotifySection = document.getElementById('spotify-playlists-section');
            const artistsSection = document.getElementById('artists-section');

            if (filter === 'all') {
                playlistsSection.style.display = 'block';
                if (spotifySection) spotifySection.style.display = 'block';
                artistsSection.style.display = 'block';
            } else if (filter === 'playlists') {
                playlistsSection.style.display = 'block';
                if (spotifySection) spotifySection.style.display = 'block';
                artistsSection.style.display = 'none';
            } else if (filter === 'artists') {
                playlistsSection.style.display = 'none';
                if (spotifySection) spotifySection.style.display = 'none';
                artistsSection.style.display = 'block';
            }
        });
    });

    // Custom Context Menu
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const { clientX: x, clientY: y } = e;
        els.contextMenu.style.top = `${y}px`;
        els.contextMenu.style.left = `${x}px`;
        els.contextMenu.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
        els.contextMenu.style.display = 'none';

        // Close Device Menu when clicking outside
        if (els.deviceMenu && !els.deviceMenu.contains(e.target) && !e.target.closest('#device-picker-btn')) {
            els.deviceMenu.classList.remove('show');
        }
    });

    // Modal Events
    const closeModal = () => {
        els.modal.style.display = 'none';
    };

    if (els.modalCancel) els.modalCancel.addEventListener('click', closeModal);
    if (els.modalCloseX) els.modalCloseX.addEventListener('click', closeModal);

    // Escape Key to close all popups
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            if (els.deviceMenu) els.deviceMenu.classList.remove('show');
            els.contextMenu.style.display = 'none';
        }
    });
}

// ── Helpers menus (Anime.js) ─────────────────────────────────────────────────
function _showMenu(menuEl) {
    if (!menuEl) return;
    menuEl.style.display = 'block';
    anime.remove(menuEl);
    anime({ targets: menuEl, opacity: [0, 1], translateY: [-10, 0], scale: [0.97, 1], duration: _A.d(200), easing: 'easeOutCubic' });
}

function _hideMenu(menuEl, cb) {
    if (!menuEl) return;
    anime.remove(menuEl);
    anime({ targets: menuEl, opacity: [1, 0], translateY: [0, -8], scale: [1, 0.97], duration: _A.d(160), easing: 'easeInQuad', complete: () => {
        menuEl.style.display = 'none';
        if (cb) cb();
    }});
}

function switchView(viewName) {
    // Reset nav active states
    els.navHome.classList.remove('active');
    els.navPlaylists.classList.remove('active');

    // Hide all views instantly (no old-view fade-out to avoid blocking content load)
    [els.artistView, els.searchView, els.homeView, els.playlistsView, els.detailView].forEach(v => {
        if (v) { v.style.display = 'none'; v.style.opacity = ''; v.style.transform = ''; }
    });

    // Auto-close Queue on navigation
    if (els.queueMenu && els.queueMenu.classList.contains('show')) {
        _hideMenu(els.queueMenu, () => els.queueMenu.classList.remove('show'));
    }

    let target = null;
    if (viewName === 'artist') {
        els.artistView.style.display = 'flex'; target = els.artistView;
    } else if (viewName === 'search') {
        els.searchView.style.display = 'flex'; target = els.searchView;
    } else if (viewName === 'home') {
        els.homeView.style.display = 'flex'; target = els.homeView;
        els.navHome.classList.add('active');
    } else if (viewName === 'playlists') {
        els.playlistsView.style.display = 'flex'; target = els.playlistsView;
        els.navPlaylists.classList.add('active');
    } else if (viewName === 'detail') {
        els.detailView.style.display = 'flex'; target = els.detailView;
    }

    if (target) _A.fadeIn(target, { duration: 280, y: 14 });
    window.scrollTo(0, 0);
}

async function loadHome() {
    switchView('home');
    pushHistory({ type: 'home' });

    // Salutation dynamique
    const h = new Date().getHours();
    const greeting = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    const titleEl = document.getElementById('home-title');
    if (titleEl) titleEl.textContent = greeting;

    try {
        const TTL_LONG  = 60 * 60 * 1000; // 1h — top artists/tracks changent peu
        const TTL_SHORT =  2 * 60 * 1000; // 2min — recently played

        const [topArtists, recentlyPlayed, topTracks] = await Promise.all([
            cachedSpotifyFetch('home-top-artists', '/me/top/artists?limit=6&time_range=short_term', TTL_LONG),
            cachedSpotifyFetch('home-recently-played', '/me/player/recently-played?limit=20', TTL_SHORT),
            cachedSpotifyFetch('home-top-tracks', '/me/top/tracks?limit=6&time_range=short_term', TTL_LONG),
        ]);

        renderHomeSpotify(topArtists, recentlyPlayed, topTracks);
    } catch (e) {
        console.error('Failed to load home', e);
    }
}

function renderHomeSpotify(topArtists, recentlyPlayed, topTracks) {
    // ── Shortcuts : récemment joués (dédupliqués par contexte) ──────────────
    els.homeShortcuts.innerHTML = '';
    const recentItems = recentlyPlayed?.items || [];
    const seenKeys = new Set();
    const shortcuts = [];
    for (const item of recentItems) {
        if (!item?.track) continue;
        const key = item.context ? item.context.uri : item.track.id;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        shortcuts.push(item);
        if (shortcuts.length >= 6) break;
    }
    shortcuts.forEach(item => {
        const track = item.track;
        const img = track.album?.images?.[0]?.url || '';
        const div = document.createElement('div');
        div.className = 'shortcut-card group';
        div.innerHTML = `
            <img src="${img}" class="shortcut-img">
            <div class="shortcut-info">
                <span class="shortcut-name">${track.name}</span>
                <div class="shortcut-play-btn"><i class="fa-solid fa-play"></i></div>
            </div>
        `;
        const normalized = normalizeSpotifyTrack({ item: track });
        if (normalized) div.addEventListener('click', () => playTrack(normalized));
        els.homeShortcuts.appendChild(div);
    });
    _A.stagger('#home-shortcuts .shortcut-card', { duration: 360, staggerDelay: 55 });

    // ── Genres : extraits des top artists ────────────────────────────────────
    const genreSection = document.getElementById('home-genres-section');
    const genreContainer = document.getElementById('home-genres');
    const spotifyArtists = topArtists?.items || [];
    if (genreContainer && spotifyArtists.length > 0) {
        const genreCount = {};
        spotifyArtists.forEach(a => (a.genres || []).forEach(g => {
            genreCount[g] = (genreCount[g] || 0) + 1;
        }));
        const topGenres = Object.entries(genreCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([g]) => g);
        genreContainer.innerHTML = topGenres
            .map(g => `<span class="genre-pill">${g.charAt(0).toUpperCase() + g.slice(1)}</span>`)
            .join('');
        if (genreSection) genreSection.style.display = topGenres.length ? 'block' : 'none';
    }

    // ── Top Artists ──────────────────────────────────────────────────────────
    els.homeArtists.innerHTML = '';
    spotifyArtists.slice(0, 6).forEach(artist => {
        const img = artist.images?.[0]?.url || '';
        const div = document.createElement('div');
        div.className = 'artist-card';
        div.innerHTML = `
            <div class="artist-card-img-wrapper">
                <img src="${img}" class="artist-card-img" loading="lazy">
                <div class="artist-card-play"><i class="fa-solid fa-play"></i></div>
            </div>
            <p class="artist-card-name">${artist.name}</p>
            <p class="artist-card-type">Artiste</p>
        `;
        div.addEventListener('click', () => loadArtistByName(artist.name));
        els.homeArtists.appendChild(div);
    });
    _A.stagger('#home-artists .artist-card', { duration: 360, staggerDelay: 60 });

    // ── Top Tracks ───────────────────────────────────────────────────────────
    els.homeTrends.innerHTML = '';
    (topTracks?.items || []).slice(0, 6).forEach(track => {
        const img = track.album?.images?.[0]?.url || '';
        const div = document.createElement('div');
        div.className = 'album-card';
        div.innerHTML = `
            <img src="${img}" loading="lazy">
            <div class="album-card-title">${track.name}</div>
            <div class="album-card-year">${track.artists?.[0]?.name || ''}</div>
        `;
        const normalized = normalizeSpotifyTrack({ item: track });
        if (normalized) div.addEventListener('click', () => playTrack(normalized));
        els.homeTrends.appendChild(div);
    });
    _A.stagger('#home-trends .album-card', { duration: 360, staggerDelay: 60 });
}

async function loadArtistByName(name) {
    try {
        const res = await fetch(`/api/deezer/search/artist?q=${encodeURIComponent(name)}`).then(r => r.json());
        const artist = res.data?.[0];
        if (artist) loadArtist(artist.id);
    } catch (e) { console.error('loadArtistByName failed', e); }
}

// Background Carousel Logic
async function initBgCarousel() {
    try {
        const history = await fetch('/api/local/history').then(r => r.json());
        const seen = new Set();
        bgHistory = (history || [])
            .filter(t => t && t.album && t.album.id)
            .filter(t => {
                if (seen.has(t.album.id)) return false;
                seen.add(t.album.id);
                return true;
            })
            .map(t => t.album.cover_xl || t.album.cover_big)
            .slice(0, 10);

        if (bgHistory.length === 0) {
            bgHistory = [
                'https://e-cdn-images.dzcdn.net/images/cover/ba0af076249e9facf8114f664a7cc959/1000x1000-000000-80-0-0.jpg',
                'https://e-cdn-images.dzcdn.net/images/cover/0727f84e5c8ff1bf1aa37a804ef76c7c/1000x1000-000000-80-0-0.jpg'
            ];
        }

        startRotation();
    } catch (e) {
        console.error('Carousel init failed', e);
        // Fallback
        bgHistory = ['https://e-cdn-images.dzcdn.net/images/cover/ba0af076249e9facf8114f664a7cc959/1000x1000-000000-80-0-0.jpg'];
        startRotation();
    }
}

function startRotation() {
    const slides = els.bgCarousel.querySelectorAll('.bg-slide');
    let activeSlide = 0;

    const updateSlide = () => {
        const nextUrl = bgHistory[currentBgIndex];
        const nextSlide = (activeSlide + 1) % 2;

        slides[nextSlide].style.backgroundImage = `url(${nextUrl})`;
        slides[activeSlide].classList.remove('active');
        slides[nextSlide].classList.add('active');

        activeSlide = nextSlide;
        currentBgIndex = (currentBgIndex + 1) % bgHistory.length;
    };

    // First slide
    slides[0].style.backgroundImage = `url(${bgHistory[0]})`;
    currentBgIndex = (currentBgIndex + 1) % bgHistory.length;

    setInterval(updateSlide, 5500); // 5.5 seconds
}

async function recordHistory(track) {
    try {
        await fetch('/api/local/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(track)
        });
    } catch (e) {
        console.error('Failed to record history', e);
    }
}

async function loadArtist(artistId) {
    pushHistory({ type: 'artist', id: artistId });
    try {
        currentArtistId = artistId;
        switchView('artist');

        // Fetch Artist Data
        const artistData = await fetch(`/api/deezer/artist/${artistId}`).then(r => r.json());
        currentArtistData = artistData;
        renderArtist(artistData);

        // Check Follow state
        const followState = await fetch(`/api/local/artists/${artistId}`).then(r => r.json());
        updateFollowBtn(followState.followed);

        // Fetch Top Tracks
        const topTracks = await fetch(`/api/deezer/artist/${artistId}/top?limit=5`).then(r => r.json());
        renderTopTracks(topTracks.data);

        // Fetch Albums
        const albums = await fetch(`/api/deezer/artist/${artistId}/albums`).then(r => r.json());
        renderAlbums(albums.data);

    } catch (e) {
        console.error('Failed to load artist', e);
    }
}

function renderArtist(artist) {
    els.name.innerHTML = `${artist.name.toUpperCase()} <i class="fa-solid fa-circle-check verified-badge"></i>`;
    els.listeners.innerText = `${(artist.nb_fan || 0).toLocaleString()} MONTHLY LISTENERS`;
    const portrait = artist.picture_xl || artist.picture_big;
    els.artistImage.src = portrait;
}

function updateFollowBtn(isFollowed) {
    if (isFollowed) {
        els.followBtn.innerText = 'FOLLOWING';
        els.followBtn.classList.add('active');
    } else {
        els.followBtn.innerText = 'FOLLOW';
        els.followBtn.classList.remove('active');
    }
}

async function toggleFollow() {
    if (!currentArtistData) return;
    const isActive = els.followBtn.classList.contains('active');
    try {
        if (isActive) {
            await fetch(`/api/local/artists/${currentArtistData.id}`, { method: 'DELETE' });
        } else {
            await fetch('/api/local/artists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentArtistData)
            });
        }
        updateFollowBtn(!isActive);
    } catch (e) {
        console.error('Follow failed', e);
    }
}

function renderTopTracks(tracks) {
    els.popularList.innerHTML = '';
    tracks.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'track-item';
        const plays = (track.rank / 1000).toFixed(1) + 'M';
        const isLiked = isTrackLiked(track.id || track.spotify_id);

        div.innerHTML = `
            <div class="track-left">
                <span class="track-index">${index + 1}</span>
                <i class="fa-solid fa-play track-play-icon"></i>
                <img src="${track.album?.cover_small || 'https://via.placeholder.com/40'}" class="track-img">
                <div class="track-info">
                    <p class="track-name">${track.title}</p>
                    <p class="track-plays">${plays}</p>
                </div>
            </div>
            <div class="track-actions">
                 <i class="fa-solid fa-plus track-icon queue-add" title="Ajouter à la file d'attente"></i>
                 <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart track-icon heart ${isLiked ? 'liked' : ''}"></i>
                 <i class="fa-solid fa-ellipsis track-icon"></i>
            </div>
        `;

        const heart = div.querySelector('.heart');
        heart.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeTrack(track, heart);
        });

        const addBtn = div.querySelector('.queue-add');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToQueue(track);
        });

        const dots = div.querySelector('.fa-ellipsis');
        dots.addEventListener('click', (e) => {
            e.stopPropagation();
            // Future context menu implementation
        });

        if (track.id) div.setAttribute('data-id', track.id);
        if (track.spotify_id) div.setAttribute('data-spotify-id', track.spotify_id);

        div.addEventListener('click', () => playTrack(track, tracks));
        els.popularList.appendChild(div);
    });
    _A.stagger(els.popularList.querySelectorAll('.track-item'), { duration: 320, staggerDelay: 50, y: 14 });
}

function renderAlbums(albums) {
    const sorted = albums.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
    const latest = sorted[0];

    if (latest) {
        els.latestCover.src = latest.cover_medium;
        els.latestTitle.innerText = latest.title;
        els.latestDate.innerText = latest.release_date.split('-')[0];

        // Simplest way to replace old listeners is using .onclick
        els.latestRelease.onclick = () => openDetailView('album', latest.id);

        fetch(`/api/deezer/album/${latest.id}`)
            .then(r => r.json())
            .then(fullAlbum => {
                if (fullAlbum && fullAlbum.nb_tracks) {
                    els.latestTracksCount.innerText = `${fullAlbum.nb_tracks} tracks`;
                }
            });
    }

    const featured = sorted[1] || sorted[0];
    if (featured) {
        els.featuredAlbumTitle.innerText = featured.title;
        els.featuredAlbumImg.src = featured.cover_xl || featured.cover_big;

        els.featuredBanner.onclick = () => openDetailView('album', featured.id);
    }

    const fullAlbums = sorted.filter(a => a.record_type === 'album' || a.record_type === 'compile');
    const singles = sorted.filter(a => a.record_type === 'single' || a.record_type === 'ep');

    els.albumsList.innerHTML = '';
    fullAlbums.forEach(album => createAlbumCard(album, els.albumsList));

    els.singlesList.innerHTML = '';
    singles.forEach(single => createAlbumCard(single, els.singlesList));
}

function createAlbumCard(album, container) {
    const div = document.createElement('div');
    div.className = 'album-card';
    div.innerHTML = `
        <img src="${album.cover_medium}" loading="lazy">
        <div class="album-card-title">${album.title}</div>
        <div class="album-card-year">${album.release_date.split('-')[0]} • ${album.record_type.toUpperCase()}</div>
    `;
    div.addEventListener('click', () => openDetailView('album', album.id));
    container.appendChild(div);
}

// ── Spotify Playlists helpers ────────────────────────────────────────────────

/** Récupère toutes les pages de /me/playlists (owned + collaborative) — cache 5 min */
async function fetchAllSpotifyPlaylists() {
    const cached = _getCached('my-playlists');
    if (cached) return cached;
    const playlists = [];
    let endpoint = '/me/playlists?limit=50';
    while (endpoint) {
        const data = await spotifyFetch(endpoint);
        if (!data || !data.items) break;
        playlists.push(...data.items.filter(Boolean));
        endpoint = data.next
            ? data.next.replace('https://api.spotify.com/v1', '')
            : null;
    }
    if (playlists.length) _setCache('my-playlists', playlists, 5 * 60 * 1000);
    return playlists;
}

/** Récupère toutes les pistes d'une playlist Spotify (paginé) — cache 5 min */
async function fetchSpotifyPlaylistTracks(playlistId) {
    const cacheKey = `playlist-tracks:${playlistId}`;
    const cached = _getCached(cacheKey);
    if (cached) return cached;
    const tracks = [];
    let endpoint = `/playlists/${playlistId}/items?limit=100`;
    while (endpoint) {
        const data = await spotifyFetch(endpoint);
        if (!data || !data.items) break;
        tracks.push(...data.items.map(item => normalizeSpotifyTrack(item)).filter(Boolean));
        endpoint = data.next
            ? data.next.replace('https://api.spotify.com/v1', '')
            : null;
    }
    if (tracks.length) _setCache(cacheKey, tracks, 5 * 60 * 1000);
    return tracks;
}

/** Convertit un item de playlist Spotify au format interne de l'app */
function normalizeSpotifyTrack(item) {
    // /playlists/{id}/items → champ "item" ; /me/tracks → champ "track"
    const t = item && (item.item || item.track);
    if (!t || t.type === 'episode' || !t.id) return null; // ignore podcasts et locaux
    const images = t.album && t.album.images ? t.album.images : [];
    return {
        id: null,
        spotify_id: t.id,
        spotify_uri: t.uri,          // déjà résolu → pas d'appel API à la lecture
        title: t.name,
        artist: { name: t.artists && t.artists[0] ? t.artists[0].name : 'Inconnu', id: null },
        album: {
            title: t.album ? t.album.name : '',
            id: null,
            cover_small: images[images.length - 1] ? images[images.length - 1].url : '',
            cover_medium: images[1] ? images[1].url : '',
            cover_big: images[0] ? images[0].url : ''
        },
        duration: Math.floor(t.duration_ms / 1000),
        preview: null
    };
}

/** Récupère tous les titres likés Spotify (/v1/me/tracks, paginé) */
async function fetchSpotifyLikedTracks() {
    const tracks = [];
    let endpoint = '/me/tracks?limit=50';
    while (endpoint) {
        const data = await spotifyFetch(endpoint);
        if (!data || !data.items) break;
        const valid = data.items
            .map(item => normalizeSpotifyTrack(item))
            .filter(Boolean);
        tracks.push(...valid);
        endpoint = data.next
            ? data.next.replace('https://api.spotify.com/v1', '')
            : null;
    }
    return tracks;
}

// ── Playlists Logic ───────────────────────────────────────────────────────────
async function loadPlaylists() {
    switchView('playlists');
    pushHistory({ type: 'playlists' });

    // Reset filters to "All"
    document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.library-filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    const playlistsSection = document.getElementById('playlists-section');
    const spotifySection = document.getElementById('spotify-playlists-section');
    const artistsSection = document.getElementById('artists-section');
    if (playlistsSection) playlistsSection.style.display = 'block';
    if (spotifySection) spotifySection.style.display = 'block';
    if (artistsSection) artistsSection.style.display = 'block';

    try {
        const [localPlaylists, followed, spotifyPlaylists] = await Promise.all([
            fetch('/api/local/playlists').then(r => r.json()),
            fetch('/api/local/artists').then(r => r.json()),
            fetchAllSpotifyPlaylists()
        ]);
        renderPlaylists(localPlaylists, followed, spotifyPlaylists);
    } catch (e) {
        console.error('Failed to load playlists', e);
    }
}

function renderPlaylists(playlists, followed, spotifyPlaylists = []) {
    els.playlistsGrid.innerHTML = '';

    // Fixed "Liked Tracks" Playlist Virtual Card
    const likedDiv = document.createElement('div');
    likedDiv.className = 'playlist-card group';
    likedDiv.dataset.id = 'liked-tracks';
    likedDiv.innerHTML = `
        <div class="playlist-img-wrapper">
            <div class="playlist-img" style="background: linear-gradient(135deg, #450af5, #c4efd9); display: flex; align-items: center; justify-content: center;">
                <i class="fa-solid fa-heart liked-playlist-icon" style="font-size: 3rem; color: white;"></i>
            </div>
            <div class="playlist-actions-overlay">
                <button class="action-btn-sm" title="Lire"><i class="fa-solid fa-play"></i></button>
            </div>
        </div>
        <p class="font-bold text-sm mb-1 truncate">Titres likés</p>
        <p class="text-spotify-text-gray text-xs">${likedTracks.length} titres</p>
    `;
    likedDiv.addEventListener('click', async () => {
        // Sync likes before opening to ensure fresh data
        likedTracks = await fetch('/api/local/likes').then(r => r.json());
        openDetailView('liked', 'liked-tracks');
    });
    els.playlistsGrid.appendChild(likedDiv);

    playlists.forEach(p => {
        const div = document.createElement('div');
        div.className = 'playlist-card group';
        div.innerHTML = `
            <div class="playlist-img-wrapper">
                <img src="${p.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300'}" class="playlist-img">
                <div class="playlist-actions-overlay">
                    <button class="action-btn-sm" title="Renommer" onclick="event.stopPropagation(); renamePlaylist('${p.id}', '${p.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn-sm" title="Changer l'image" onclick="event.stopPropagation(); changePlaylistCover('${p.id}', '${p.cover || ''}')"><i class="fa-solid fa-image"></i></button>
                    <button class="action-btn-sm delete" title="Supprimer" onclick="event.stopPropagation(); deletePlaylist('${p.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <p class="font-bold text-sm mb-1 truncate">${p.name}</p>
            <p class="text-spotify-text-gray text-xs">Par ${p.creator} • ${p.tracks ? p.tracks.length : 0} titres</p>
        `;
        div.addEventListener('click', () => openDetailView('playlist', p.id));
        els.playlistsGrid.appendChild(div);
    });
    _A.stagger('#playlists-grid .playlist-card', { duration: 340, staggerDelay: 50 });

    // Spotify Playlists
    els.spotifyPlaylistsGrid.innerHTML = '';
    const spotifySection = document.getElementById('spotify-playlists-section');
    if (spotifyPlaylists.length > 0) {
        if (spotifySection) spotifySection.style.display = 'block';
        spotifyPlaylists.forEach(p => {
            const cover = p.images && p.images[0] ? p.images[0].url : '';
            const trackCount = p.tracks ? p.tracks.total : 0;
            const isCollab = p.collaborative;
            const div = document.createElement('div');
            div.className = 'playlist-card group';
            div.innerHTML = `
                <div class="playlist-img-wrapper">
                    <img src="${cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300'}" class="playlist-img" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300'">
                    <div class="playlist-actions-overlay">
                        <button class="action-btn-sm" title="Lire"><i class="fa-solid fa-play"></i></button>
                    </div>
                </div>
                <p class="font-bold text-sm mb-1 truncate">${p.name}</p>
                <p class="text-spotify-text-gray text-xs">${isCollab ? 'Collaborative' : 'Par ' + (p.owner ? p.owner.display_name : 'Spotify')} • ${trackCount} titres</p>
            `;
            div.addEventListener('click', () => openDetailView('spotify-playlist', p.id));
            els.spotifyPlaylistsGrid.appendChild(div);
        });
        _A.stagger('#spotify-playlists-grid .playlist-card', { duration: 340, staggerDelay: 50 });
    } else {
        if (spotifySection) spotifySection.style.display = 'none';
    }

    // Followed Artists
    els.followedArtistsGrid.innerHTML = '';
    followed.forEach(artist => {
        const div = document.createElement('div');
        div.className = 'artist-card flex flex-col items-center text-center';
        div.innerHTML = `
            <div class="artist-card-img-wrapper">
                <img src="${artist.picture_big || artist.picture_medium || 'https://e-cdn-images.dzcdn.net/images/artist//250x250-000000-80-0-0.jpg'}" class="artist-card-img" onerror="this.src='https://e-cdn-images.dzcdn.net/images/artist//250x250-000000-80-0-0.jpg'">
                <div class="artist-card-play"><i class="fa-solid fa-play"></i></div>
            </div>
            <p class="font-bold text-sm mt-2 w-full truncate">${artist.name}</p>
            <p class="text-spotify-text-gray text-xs uppercase tracking-widest w-full">Artiste</p>
        `;
        div.addEventListener('click', () => loadArtist(artist.id));
        els.followedArtistsGrid.appendChild(div);
    });
    _A.stagger('#followed-artists-grid .artist-card', { duration: 340, staggerDelay: 60 });
}

async function createPlaylist() {
    const name = await showCustomModal({
        title: 'Créer une playlist',
        description: 'Donnez un nom à votre nouvelle playlist.',
        showInput: true,
        confirmText: 'Créer'
    });

    if (!name) return;
    try {
        await fetch('/api/local/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        loadPlaylists();
    } catch (e) {
        console.error('Failed to create playlist', e);
    }
}

async function renamePlaylist(id, currentName) {
    const newName = await showCustomModal({
        title: 'Renommer la playlist',
        description: 'Saisissez le nouveau nom de la playlist.',
        showInput: true,
        defaultValue: currentName,
        confirmText: 'Renommer'
    });

    if (!newName || newName === currentName) return;
    try {
        await fetch(`/api/local/playlists/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        loadPlaylists();
    } catch (e) {
        console.error('Failed to rename playlist', e);
    }
}

async function changePlaylistCover(id, currentCover) {
    const newCover = await showCustomModal({
        title: 'Modifier l\'image',
        description: 'Collez l\'URL de la nouvelle image de miniature ou uploadez un fichier.',
        showInput: true,
        showUpload: true,
        defaultValue: currentCover,
        confirmText: 'Mettre à jour'
    });

    if (newCover === false || newCover === currentCover) return;
    try {
        await fetch(`/api/local/playlists/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cover: newCover })
        });
        loadPlaylists();
    } catch (e) {
        console.error('Failed to change playlist cover', e);
    }
}

function resizeImage(file, maxWidth = 300, maxHeight = 300) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function deletePlaylist(id) {
    const confirmed = await showCustomModal({
        title: 'Supprimer la playlist',
        description: 'Voulez-vous vraiment supprimer cette playlist ? Cette action est irréversible.',
        confirmText: 'Supprimer'
    });

    if (!confirmed) return;
    try {
        await fetch(`/api/local/playlists/${id}`, { method: 'DELETE' });
        loadPlaylists();
    } catch (e) {
        console.error('Failed to delete playlist', e);
    }
}

// Modal Helper
function showCustomModal({ title, description, showInput = false, showUpload = false, defaultValue = '', confirmText = 'Confirmer' }) {
    return new Promise((resolve) => {
        els.modalTitle.innerText = title;
        els.modalDesc.innerText = description;
        els.modalInput.style.display = showInput ? 'block' : 'none';
        els.modalInput.value = defaultValue;
        els.modalConfirm.innerText = confirmText;
        els.modal.style.display = 'flex';
        const modalContent = els.modal.querySelector('.modal-content');
        anime.remove(els.modal); anime.remove(modalContent);
        anime({ targets: els.modal, opacity: [0, 1], duration: _A.d(200), easing: 'linear' });
        if (modalContent) anime({ targets: modalContent, opacity: [0, 1], scale: [0.9, 1], translateY: [-14, 0], duration: _A.d(320), easing: 'easeOutBack' });

        // Upload button logic
        if (showUpload) {
            els.modalUploadBtn.style.display = 'flex';
            els.modalInput.classList.add('modal-input-with-upload');
        } else {
            els.modalUploadBtn.style.display = 'none';
            els.modalInput.classList.remove('modal-input-with-upload');
        }

        const onUploadClick = () => {
            els.modalFileInput.click();
        };

        const onFileChange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const resized = await resizeImage(file);
                els.modalInput.value = resized;
            }
        };

        const onConfirm = () => {
            const value = showInput ? els.modalInput.value : true;
            close();
            resolve(value);
        };

        const onCancel = () => {
            close();
            resolve(false);
        };

        const close = () => {
            const _cleanup = () => {
                els.modal.style.display = 'none';
                els.modalConfirm.removeEventListener('click', onConfirm);
                els.modalCancel.removeEventListener('click', onCancel);
                els.modalUploadBtn.removeEventListener('click', onUploadClick);
                els.modalFileInput.removeEventListener('change', onFileChange);
                els.modalFileInput.value = '';
            };
            const modalContent = els.modal.querySelector('.modal-content');
            anime.remove(els.modal); anime.remove(modalContent);
            anime({ targets: els.modal, opacity: [1, 0], duration: _A.d(180), easing: 'easeInQuad', complete: _cleanup });
            if (modalContent) anime({ targets: modalContent, scale: [1, 0.93], opacity: [1, 0], translateY: [0, 8], duration: _A.d(160), easing: 'easeInQuad' });
        };

        els.modalConfirm.addEventListener('click', onConfirm);
        els.modalCancel.addEventListener('click', onCancel);
        els.modalUploadBtn.addEventListener('click', onUploadClick);
        els.modalFileInput.addEventListener('change', onFileChange);

        // Clik outside to close
        els.modal.onclick = (e) => {
            if (e.target === els.modal) onCancel();
        };
    });
}

// Detail View (Shared for Album/Playlist)
async function openDetailView(type, id) {
    switchView('detail');
    pushHistory({ type: 'detail', detailType: type, id: id });
    currentDetailPage = 0;
    try {
        let data;
        els.detailHeaderLike.style.display = 'inline-block'; // Default to visible

        if (type === 'album') {
            data = await fetch(`/api/deezer/album/${id}`).then(r => r.json());
            currentDetailTracks = data.tracks.data;
            currentDetailData = data;
            renderDetailView({
                type: 'ALBUM',
                title: data.title,
                cover: data.cover_xl || data.cover_big,
                ownerName: data.artist.name,
                ownerImg: data.artist.picture_small,
                meta: `• ${data.release_date.split('-')[0]} • ${data.nb_tracks} titres`
            });
            updateAlbumFollowBtn(data);
            els.detailHeaderLike.style.display = 'none'; // Hide for albums as requested
        } else if (type === 'liked') {
            // Afficher loader pendant le chargement
            els.detailType.innerText = 'PLAYLIST';
            els.detailTitle.innerText = 'Chargement…';
            els.detailTracksList.innerHTML = '<p style="padding:1rem;color:var(--text-gray)">Chargement des titres likés…</p>';

            // Charger en parallèle : locaux + Spotify
            const [localTracks, spotifyTracks] = await Promise.all([
                fetch('/api/local/likes').then(r => r.json()),
                fetchSpotifyLikedTracks()
            ]);

            // Merger : Spotify est la source de vérité ; ajouter les locaux sans doublon (par spotify_id)
            const spotifyIds = new Set(spotifyTracks.map(t => t.spotify_id).filter(Boolean));
            const uniqueLocals = localTracks.filter(t => !t.spotify_id || !spotifyIds.has(t.spotify_id));
            const merged = [...spotifyTracks, ...uniqueLocals];

            likedTracks = merged;
            currentDetailTracks = merged;
            currentDetailData = { id: 'liked', name: 'Titres likés' };
            renderDetailView({
                type: 'PLAYLIST',
                title: 'Titres likés',
                cover: '',
                ownerName: 'Votre bibliothèque',
                ownerImg: 'https://i.pravatar.cc/150?img=11',
                meta: `• ${merged.length} titres`
            });
            els.detailFollowBtn.style.display = 'none';
        } else if (type === 'spotify-playlist') {
            // Afficher un état de chargement immédiatement
            els.detailType.innerText = 'PLAYLIST';
            els.detailTitle.innerText = 'Chargement…';
            els.detailTracksList.innerHTML = '<p style="padding:1rem;color:var(--text-gray)">Chargement des titres…</p>';
            els.detailFollowBtn.style.display = 'none';
            els.detailHeaderLike.style.display = 'none';

            // Récupérer les métadonnées de la playlist
            const playlistMeta = await spotifyFetch(`/playlists/${id}?fields=id,name,images,owner,tracks(total),collaborative,description`);
            const cover = playlistMeta.images && playlistMeta.images[0] ? playlistMeta.images[0].url : '';
            const ownerName = playlistMeta.collaborative
                ? 'Collaborative'
                : (playlistMeta.owner ? playlistMeta.owner.display_name : 'Spotify');

            // Récupérer toutes les pistes
            const tracks = await fetchSpotifyPlaylistTracks(id);
            currentDetailTracks = tracks;
            currentDetailData = { id, name: playlistMeta.name, type: 'spotify-playlist' };

            if (tracks.length === 0) {
                els.detailTracksList.innerHTML = '<p style="padding:2rem;color:#b3b3b3;text-align:center">Aucun titre disponible pour cette playlist.<br><small style="color:#535353">Les playlists générées par Spotify (Daily Mix, Discover Weekly…) ne sont pas accessibles via l\'API.</small></p>';
            }

            renderDetailView({
                type: 'PLAYLIST SPOTIFY',
                title: playlistMeta.name,
                cover,
                ownerName,
                ownerImg: 'https://i.pravatar.cc/150?img=11',
                meta: `• ${tracks.length} titres`
            });
        } else {
            const all = await fetch('/api/local/playlists').then(r => r.json());
            data = all.find(p => p.id === id);
            currentDetailTracks = data.tracks;
            currentDetailData = data;
            renderDetailView({
                type: 'PLAYLIST',
                title: data.name,
                cover: data.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300',
                ownerName: data.creator,
                ownerImg: 'https://i.pravatar.cc/150?img=11',
                meta: `• ${data.tracks.length} titres`
            });
            els.detailFollowBtn.style.display = 'none'; // Hide for local playlists (already "followed")
        }
    } catch (e) {
        console.error('Failed to load detail view', e);
    }
}

function renderDetailView(info) {
    els.detailCover.src = info.cover;
    if (!info.cover && info.title === 'Titres likés') {
        els.detailCover.style.background = 'linear-gradient(135deg, #450af5, #c4efd9)';
    } else {
        els.detailCover.style.background = 'none';
    }
    els.detailType.innerText = info.type;
    els.detailTitle.innerText = info.title;
    els.detailOwnerName.innerText = info.ownerName;
    els.detailOwnerImg.src = info.ownerImg;
    els.detailMetaText.innerText = info.meta;

    renderPagedTracks();
}

async function updateAlbumFollowBtn(album) {
    els.detailFollowBtn.style.display = 'inline-block';
    const playlists = await fetch('/api/local/playlists').then(r => r.json());
    // Check if a playlist already looks like this album
    const exists = playlists.some(p => p.name === album.title && p.creator === album.artist.name);

    if (exists) {
        els.detailFollowBtn.innerText = 'UNFOLLOW';
        els.detailFollowBtn.classList.add('active');
    } else {
        els.detailFollowBtn.innerText = 'FOLLOW';
        els.detailFollowBtn.classList.remove('active');
    }
}

async function toggleAlbumFollow() {
    if (!currentDetailData || els.detailType.innerText !== 'ALBUM') return;

    const isFollowed = els.detailFollowBtn.classList.contains('active');
    const album = currentDetailData;

    try {
        if (isFollowed) {
            // Unfollow: find and delete the playlist
            const playlists = await fetch('/api/local/playlists').then(r => r.json());
            const p = playlists.find(p => p.name === album.title && p.creator === album.artist.name);
            if (p) {
                await fetch(`/api/local/playlists/${p.id}`, { method: 'DELETE' });
            }
        } else {
            // Follow: create playlist and add all tracks
            const newP = await fetch('/api/local/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: album.title,
                    creator: album.artist.name,
                    cover: album.cover_medium,
                    description: `Album by ${album.artist.name}`
                })
            }).then(r => r.json());

            // Add tracks
            await fetch(`/api/local/playlists/${newP.id}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(album.tracks.data)
            });
        }
        updateAlbumFollowBtn(album);
    } catch (e) {
        console.error('Failed to toggle album follow', e);
    }
}

function renderPagedTracks() {
    els.detailTracksList.innerHTML = '';

    const start = currentDetailPage * TRACKS_PER_PAGE;
    const end = start + TRACKS_PER_PAGE;
    const pagedTracks = currentDetailTracks.slice(start, end);
    const totalPages = Math.ceil(currentDetailTracks.length / TRACKS_PER_PAGE);

    // Update Pagination UI
    if (currentDetailTracks.length > TRACKS_PER_PAGE) {
        els.detailPagination.style.display = 'flex';
        els.pageInfo.innerText = `Page ${currentDetailPage + 1} sur ${totalPages}`;
        els.prevPageBtn.disabled = currentDetailPage === 0;
        els.nextPageBtn.disabled = currentDetailPage === totalPages - 1;
    } else {
        els.detailPagination.style.display = 'none';
    }

    pagedTracks.forEach((t, i) => {
        if (!t) return;
        const globalIndex = start + i + 1;
        const div = document.createElement('div');
        div.className = 'detail-track-item group';
        if (t.id) div.setAttribute('data-id', t.id);
        if (t.spotify_id) div.setAttribute('data-spotify-id', t.spotify_id);

        const durationSecs = t.duration || 0;
        const mins = Math.floor(durationSecs / 60);
        const secs = (durationSecs % 60).toString().padStart(2, '0');

        const isLiked = isTrackLiked(t.id || t.spotify_id);
        const artistName = (t.artist && t.artist.name) ? t.artist.name : 'Unknown Artist';

        div.innerHTML = `
            <div class="flex items-center justify-center">
                <span class="track-num">${globalIndex}</span>
                <i class="fa-solid fa-play track-play-icon-inline"></i>
            </div>
            <div class="track-main-info">
                <p class="track-title-white">${t.title || 'Untitled'}</p>
                <p class="track-artist-gray">${artistName}</p>
            </div>
            <div class="track-duration">${mins}:${secs}</div>
            <div class="detail-track-actions">
                <i class="fa-solid fa-plus detail-icon queue-add" title="Ajouter à la file d'attente"></i>
                <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart heart-icon ${isLiked ? 'liked' : ''}"></i>
                <i class="fa-solid fa-ellipsis dots-icon"></i>
            </div>
        `;

        const heart = div.querySelector('.heart-icon');
        heart.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeTrack(t, heart);
        });

        const addBtn = div.querySelector('.queue-add');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToQueue(t);
        });

        const dots = div.querySelector('.dots-icon');
        dots.addEventListener('click', (e) => {
            e.stopPropagation();
            // Future context menu implementation
        });

        div.addEventListener('click', () => playTrack(t, currentDetailTracks, getDetailContextInfo()));
        els.detailTracksList.appendChild(div);
    });

    // Scroll back up to the top of the layout
    els.detailLayout.scrollTo({ top: 0, behavior: 'smooth' });
    _A.stagger(els.detailTracksList.querySelectorAll('.detail-track-item'), { duration: 300, staggerDelay: 30, y: 12 });
}

// Player Logic
// contextInfo: { type: 'spotify-playlist', id } | { type: 'liked', id: 'liked' } | null
async function playTrack(track, tracksArray = null, contextInfo = null) {
    if (!track) return;

    currentTrack = track;

    // Update local queue
    if (tracksArray && Array.isArray(tracksArray)) {
        playbackQueue = tracksArray;
    } else if (!playbackQueue.some(t => t.id === track.id || t.spotify_id === track.id)) {
        playbackQueue = [track];
    }

    // S'assurer qu'on a un device ID — fallback Spotify Connect si le SDK a échoué
    if (!spotifyDeviceId) {
        spotifyDeviceId = await findAvailableSpotifyDevice();
    }
    if (!spotifyDeviceId) {
        console.error('Aucun appareil Spotify disponible. Ouvrez Spotify sur un autre appareil.');
        return;
    }

    // ── Spotify playlist : context_uri → shuffle/repeat/next/prev natifs ─────
    if (contextInfo?.type === 'spotify-playlist' && track.spotify_uri) {
        await spotifyFetch(`/me/player/play?device_id=${spotifyDeviceId}`, 'PUT', {
            context_uri: `spotify:playlist:${contextInfo.id}`,
            offset: { uri: track.spotify_uri }
        });
        isPlaying = true;
        updatePlayerUI(track);
        updatePlayIcon();
        recordHistory(track);
        highlightCurrentTrack();
        persistPlayerState();
        return;
    }

    // ── Titres likés : uris[] complet → shuffle/repeat natifs Spotify ─────────
    if (contextInfo?.type === 'liked') {
        const trackUri = track.spotify_uri || (track.spotify_id ? `spotify:track:${track.spotify_id}` : null);
        if (trackUri) {
            const allUris = playbackQueue
                .map(t => t.spotify_uri || (t.spotify_id ? `spotify:track:${t.spotify_id}` : null))
                .filter(Boolean);
            if (allUris.length > 0) {
                const offsetPos = allUris.indexOf(trackUri);
                await spotifyFetch(`/me/player/play?device_id=${spotifyDeviceId}`, 'PUT', {
                    uris: allUris.slice(0, 750),
                    offset: offsetPos >= 0 ? { position: offsetPos } : { uri: trackUri }
                });
                isPlaying = true;
                updatePlayerUI(track);
                updatePlayIcon();
                recordHistory(track);
                highlightCurrentTrack();
                persistPlayerState();
                return;
            }
        }
    }

    // ── Fallback : résoudre l'URI Spotify + pré-remplir la queue ─────────────
    const uri = await resolveSpotifyUri(track);
    if (!uri) {
        console.error('Could not resolve Spotify URI for', track.title);
        if (track.preview) {
            audioPlayer.src = track.preview;
            audioPlayer.play();
        }
        return;
    }

    const trackIndex = playbackQueue.findIndex(t => t.id === track.id || t.spotify_id === track.id);
    const subsequentTracks = playbackQueue.slice(trackIndex, trackIndex + 50);

    await spotifyFetch(`/me/player/play?device_id=${spotifyDeviceId}`, 'PUT', { uris: [uri] });

    isPlaying = true;
    updatePlayerUI(track);
    updatePlayIcon();
    recordHistory(track);
    highlightCurrentTrack();
    persistPlayerState();

    // Pré-remplir la queue Spotify avec les 10 pistes suivantes (en parallèle)
    const nextTracks = subsequentTracks.slice(1, 11);
    if (nextTracks.length > 0) {
        Promise.allSettled(nextTracks.map(t => resolveSpotifyUri(t)))
            .then(results => {
                results.forEach(r => {
                    if (r.status === 'fulfilled' && r.value) {
                        spotifyFetch(`/me/player/queue?uri=${r.value}&device_id=${spotifyDeviceId}`, 'POST')
                            .catch(e => console.error('Failed to add to Spotify queue', e));
                    }
                });
            });
    }
}

async function addToQueue(track) {
    if (!track) return;

    // Add to local queue if not already there
    if (!playbackQueue.some(t => t.id === track.id || t.spotify_id === track.id)) {
        playbackQueue.push(track);
        persistPlayerState();
    }

    // If nothing is playing, play it
    if (!isPlaying && !currentTrack) {
        playTrack(track, playbackQueue);
        return;
    }

    // Add to Spotify queue
    const uri = await resolveSpotifyUri(track);
    if (uri) {
        await spotifyFetch(`/me/player/queue?uri=${uri}&device_id=${spotifyDeviceId}`, 'POST')
            .then(() => {
                console.log('Added to Spotify queue:', track.title);
                // Simple notification? Or UI feedback.
            })
            .catch(e => console.error('Failed to add to Spotify queue', e));
    }

    // Refresh queue UI if open
    if (els.queueMenu.classList.contains('show')) {
        renderQueue();
    }
}

async function togglePlay() {
    try {
        if (spotifyPlayer) {
            // SDK disponible (browser ou Electron+castlabs) : SDK gère tout
            const state = await spotifyPlayer.getCurrentState();
            if (!state) {
                if (currentTrack) playTrack(currentTrack);
                else await spotifyFetch('/me/player/play', 'PUT');
            } else {
                spotifyPlayer.togglePlay();
            }
        } else {
            // Fallback REST API (SDK absent / Connect externe)
            if (isPlaying) {
                await spotifyFetch('/me/player/pause', 'PUT');
                isPlaying = false;
            } else {
                if (currentTrack) {
                    await spotifyFetch(`/me/player/play?device_id=${spotifyDeviceId}`, 'PUT');
                } else {
                    await spotifyFetch('/me/player/play', 'PUT');
                }
                isPlaying = true;
            }
            updatePlayIcon();
            if (isPlaying) startProgressTicker(); else stopProgressTicker();
        }
    } catch (e) {
        console.error('Toggle play failed', e);
    }
}

function updatePlayIcon() {
    const iconClass = isPlaying ? 'fa-pause' : 'fa-play';
    els.playBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    // MPRIS : mettre à jour l'état play/pause
    mprisUpdatePlayback();
    if (isPlaying) startMprisPositionTick(); else stopMprisPositionTick();
}

function updatePlayerUI(track) {
    if (!track) return;

    // Animate now-playing info change
    if (els.npCover && els.npTitle && els.npArtist) {
        anime.remove([els.npCover, els.npTitle, els.npArtist]);
        anime({ targets: els.npCover, opacity: [0, 1], scale: [0.82, 1], duration: _A.d(380), easing: 'easeOutBack' });
        anime({ targets: [els.npTitle, els.npArtist], opacity: [0, 1], translateX: [12, 0], delay: anime.stagger(_A.d(50), { start: 60 }), duration: _A.d(300), easing: 'easeOutCubic' });
    }

    // Title link to album
    if (track.album && track.album.id) {
        els.npTitle.innerHTML = `<span class="nav-link" onclick="openDetailView('album', ${track.album.id})">${track.title}</span>`;
    } else if (track.album && track.album.title) {
        els.npTitle.innerHTML = `<span class="nav-link" onclick="handleAlbumClick('${track.album.title.replace(/'/g, "\\'")}', '${(track.artist ? track.artist.name : '').replace(/'/g, "\\'")}')">${track.title}</span>`;
    } else {
        els.npTitle.innerText = track.title;
    }

    // Artist link
    if (track.artist && track.artist.id) {
        els.npArtist.innerHTML = `<span class="nav-link" onclick="loadArtist(${track.artist.id})">${track.artist.name}</span>`;
    } else if (track.artist && track.artist.name) {
        els.npArtist.innerHTML = `<span class="nav-link" onclick="handleArtistClick('${track.artist.name.replace(/'/g, "\\'")}')">${track.artist.name}</span>`;
    } else {
        els.npArtist.innerText = track.artist ? track.artist.name : '-';
    }

    els.npCover.src = track.album ? track.album.cover_small : '';

    // MPRIS : notifier le changement de piste
    mprisUpdateTrack(track);
    startMprisPositionTick();
}

// updateProgress is now handled by syncPlayerState

// Helper for direct redirection when IDs are missing
async function handleArtistClick(name) {
    try {
        const res = await fetch(`/api/deezer/search/artist?q=${encodeURIComponent(name)}&limit=1`).then(r => r.json());
        if (res.data && res.data.length > 0) {
            loadArtist(res.data[0].id);
        } else {
            handleSearch(name);
        }
    } catch (e) {
        handleSearch(name);
    }
}

async function handleAlbumClick(albumTitle, artistName) {
    try {
        const query = `${albumTitle} ${artistName}`;
        const res = await fetch(`/api/deezer/search/album?q=${encodeURIComponent(query)}&limit=1`).then(r => r.json());
        if (res.data && res.data.length > 0) {
            openDetailView('album', res.data[0].id);
        } else {
            handleSearch(albumTitle);
        }
    } catch (e) {
        handleSearch(albumTitle);
    }
}

function highlightCurrentTrack() {
    // Remove highlight from all
    document.querySelectorAll('.playing-now').forEach(el => el.classList.remove('playing-now'));

    if (!currentTrack) return;

    const trackId = currentTrack.id;
    const spotifyId = currentTrack.spotify_id;

    // Find all track elements that match
    document.querySelectorAll('.detail-track-item, .track-item').forEach(el => {
        // This assumes we add data attributes during rendering
        const elId = el.getAttribute('data-id');
        const elSpId = el.getAttribute('data-spotify-id');

        if ((trackId && elId == trackId) || (spotifyId && elSpId == spotifyId)) {
            el.classList.add('playing-now');
        }
    });
}

function showQueueSelector() {
    if (els.queueMenu.classList.contains('show')) {
        _hideMenu(els.queueMenu, () => els.queueMenu.classList.remove('show'));
        return;
    }
    renderQueue();
    els.queueMenu.classList.add('show');
    _showMenu(els.queueMenu);
}

function renderQueue() {
    els.queueListContainer.innerHTML = '';

    if (playbackQueue.length === 0) {
        els.queueListContainer.innerHTML = '<div class="p-4 text-center text-spotifyTextGray text-sm">La file d\'attente est vide</div>';
        return;
    }

    playbackQueue.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = `queue-item ${currentTrack && (track.id === currentTrack.id || track.spotify_id === currentTrack.spotify_id) ? 'active' : ''}`;
        div.draggable = true;

        const coverUrl = track.album?.cover_small || (track.album?.images?.[0]?.url) || 'https://via.placeholder.com/40';

        div.innerHTML = `
            <img src="${coverUrl}" alt="Cover">
            <div class="queue-item-info">
                <div class="queue-item-title">${track.title}</div>
                <div class="queue-item-artist">${track.artist ? track.artist.name : 'Unknown Artist'}</div>
            </div>
            <div class="queue-remove-btn" title="Retirer" onclick="event.stopPropagation(); removeFromQueue(${index})">
                <i class="fa-solid fa-xmark"></i>
            </div>
        `;

        div.addEventListener('click', () => {
            playTrack(track, playbackQueue);
        });

        // Drag and Drop
        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            div.classList.add('dragging');
            // Set a transparent drag image or just rely on default.
            // Using a scale effect via CSS on .dragging
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });

        els.queueListContainer.appendChild(div);
    });

    els.queueListContainer.ondragover = (e) => {
        e.preventDefault();
        const draggingItem = document.querySelector('.dragging');
        if (!draggingItem) return;

        const siblings = [...els.queueListContainer.querySelectorAll('.queue-item:not(.dragging)')];

        // Use getBoundingClientRect to correctly handle scrolled containers
        let nextSibling = siblings.find(sibling => {
            const box = sibling.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return offset < 0;
        });

        els.queueListContainer.insertBefore(draggingItem, nextSibling);
    };

    els.queueListContainer.ondrop = (e) => {
        e.preventDefault();
        const oldIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const newIndex = [...els.queueListContainer.querySelectorAll('.queue-item')].indexOf(document.querySelector('.dragging'));

        if (oldIndex !== newIndex && !isNaN(oldIndex) && newIndex !== -1) {
            const track = playbackQueue.splice(oldIndex, 1)[0];
            playbackQueue.splice(newIndex, 0, track);
            renderQueue(); // Re-render to update indices if needed
            persistPlayerState();
        }
    };
}

function removeFromQueue(index) {
    playbackQueue.splice(index, 1);
    renderQueue();
    persistPlayerState();
}

// Search Logic
async function handleSearch(query) {
    if (!query) {
        switchView('artist');
        return;
    }
    switchView('search');
    pushHistory({ type: 'search', query: query });

    try {
        const [artistResults, trackResults, albumResults] = await Promise.all([
            fetch(`/api/deezer/search/artist?q=${query}&limit=1`).then(r => r.json()),
            fetch(`/api/deezer/search/track?q=${query}&limit=4`).then(r => r.json()),
            fetch(`/api/deezer/search/album?q=${query}&limit=5`).then(r => r.json())
        ]);

        renderSearchPage(artistResults.data[0], trackResults.data, albumResults.data);
    } catch (e) {
        console.error('Search failed', e);
    }
}

function renderSearchPage(bestArtist, tracks, albums) {
    // Best result
    els.bestResultCard.innerHTML = '';
    if (bestArtist) {
        const div = document.createElement('div');
        div.className = 'best-result-card group';
        div.innerHTML = `
            <img src="${bestArtist.picture_big}" class="best-result-img">
            <h3 class="best-result-name">${bestArtist.name}</h3>
            <div class="best-result-type">
                <span>Artiste</span>
                <i class="fa-solid fa-circle-check text-blue-500 text-sm"></i>
            </div>
            <div class="best-result-play"><i class="fa-solid fa-play"></i></div>
        `;
        div.addEventListener('click', () => loadArtist(bestArtist.id));
        els.bestResultCard.appendChild(div);
        _A.slideScale('#best-result-card', { duration: 320 });
    }

    // Tracks
    els.searchTracksList.innerHTML = '';
    tracks.forEach(t => {
        const div = document.createElement('div');
        div.className = 'track-item';
        if (t.id) div.setAttribute('data-id', t.id);
        if (t.spotify_id) div.setAttribute('data-spotify-id', t.spotify_id);
        const isLiked = isTrackLiked(t.id || t.spotify_id);
        div.innerHTML = `
            <div class="track-left">
                <img src="${t.album?.cover_small || 'https://via.placeholder.com/40'}" class="track-img">
                <div class="track-info">
                    <p class="track-name">${t.title}</p>
                    <p class="track-plays">${t.artist.name}</p>
                </div>
            </div>
            <div class="track-actions">
                 <i class="fa-solid fa-plus track-icon queue-add" title="Ajouter à la file d'attente"></i>
                 <span class="track-plays" style="margin-right: 1rem;">${Math.floor(t.duration / 60)}:${(t.duration % 60).toString().padStart(2, '0')}</span>
                 <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart track-icon heart ${isLiked ? 'liked' : ''}"></i>
                 <i class="fa-solid fa-ellipsis track-icon"></i>
            </div>
        `;

        const heart = div.querySelector('.heart');
        heart.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeTrack(t, heart);
        });

        const addBtn = div.querySelector('.queue-add');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToQueue(t);
        });

        const dots = div.querySelector('.fa-ellipsis');
        dots.addEventListener('click', (e) => {
            e.stopPropagation();
            // Future context menu implementation
        });

        div.addEventListener('click', () => playTrack(t, tracks));
        els.searchTracksList.appendChild(div);
    });
    _A.stagger('#search-tracks-list .track-item', { duration: 300, staggerDelay: 40, y: 10 });

    // Albums
    els.searchAlbumsGrid.innerHTML = '';
    albums.forEach(album => {
        const div = document.createElement('div');
        div.className = 'album-card';
        div.innerHTML = `
            <img src="${album.cover_medium}" loading="lazy">
            <div class="album-card-title">${album.title}</div>
            <div class="album-card-year">${album.artist ? album.artist.name : ''}</div>
        `;
        div.addEventListener('click', () => openDetailView('album', album.id));
        els.searchAlbumsGrid.appendChild(div);
    });
    _A.stagger('#search-albums-grid .album-card', { duration: 320, staggerDelay: 45 });
}

// ── MPRIS2 Integration (Electron + D-Bus) ─────────────────────────────────────
let _mprisPositionTimer = null;

function mprisUpdateTrack(track) {
    if (!hasMpris) return;
    const loopMap = { off: 'None', track: 'Track', context: 'Playlist' };
    window.electronAPI.updateMpris({
        playbackStatus: isPlaying ? 'Playing' : 'Paused',
        shuffle: isShuffle,
        loopStatus: loopMap[repeatMode] || 'None',
        volume,
        position: currentProgressMs,
        metadata: track ? {
            id:         String(track.spotify_id || track.id || '0'),
            title:      track.title || 'Unknown',
            artist:     track.artist ? track.artist.name : 'Unknown',
            album:      track.album  ? (track.album.title || track.album.name || '') : '',
            artUrl:     track.album  ? (track.album.cover_medium || track.album.cover_small || track.album.images?.[0]?.url || '') : '',
            duration:   track.duration || 0,
            spotifyUrl: track.spotify_uri ? `https://open.spotify.com/track/${track.spotify_id || track.id}` : '',
        } : null,
    });
}

function mprisUpdatePlayback() {
    if (!hasMpris) return;
    const loopMap = { off: 'None', track: 'Track', context: 'Playlist' };
    window.electronAPI.updateMpris({
        playbackStatus: isPlaying ? 'Playing' : 'Paused',
        shuffle: isShuffle,
        loopStatus: loopMap[repeatMode] || 'None',
        volume,
        position: currentProgressMs,
    });
}

// Met à jour la position MPRIS toutes les 5s pendant la lecture
function startMprisPositionTick() {
    if (!hasMpris) return;
    stopMprisPositionTick();
    _mprisPositionTimer = setInterval(() => {
        if (isPlaying) window.electronAPI.updateMpris({ position: currentProgressMs });
    }, 5000);
}
function stopMprisPositionTick() {
    if (_mprisPositionTimer) { clearInterval(_mprisPositionTimer); _mprisPositionTimer = null; }
}

function initMpris() {
    if (!hasMpris) return;

    window.electronAPI.onMprisCommand(({ cmd, ...data }) => {
        switch (cmd) {
            case 'play':
            case 'pause':
            case 'playpause':
                togglePlay();
                break;
            case 'stop':
                if (spotifyPlayer) spotifyPlayer.pause();
                else spotifyFetch('/me/player/pause', 'PUT').then(() => { isPlaying = false; mprisUpdatePlayback(); updatePlayIcon(); });
                break;
            case 'next':
                if (spotifyPlayer) spotifyPlayer.nextTrack();
                else spotifyFetch('/me/player/next', 'POST').then(() => setTimeout(fetchSpotifyState, 500));
                break;
            case 'previous':
                if (spotifyPlayer) spotifyPlayer.previousTrack();
                else spotifyFetch('/me/player/previous', 'POST').then(() => setTimeout(fetchSpotifyState, 500));
                break;
            case 'seek': {
                // offset en µs (peut être négatif pour rewind)
                const newPosMs = Math.max(0, currentProgressMs + Math.round((data.offset || 0) / 1000));
                currentProgressMs = newPosMs;
                updateProgressBarUI(newPosMs, currentDurationMs);
                if (spotifyPlayer) spotifyPlayer.seek(newPosMs);
                else spotifyFetch(`/me/player/seek?position_ms=${newPosMs}`, 'PUT');
                break;
            }
            case 'position': {
                // position absolue en µs
                const posMs = Math.max(0, Math.round((data.position || 0) / 1000));
                currentProgressMs = posMs;
                updateProgressBarUI(posMs, currentDurationMs);
                if (spotifyPlayer) spotifyPlayer.seek(posMs);
                else spotifyFetch(`/me/player/seek?position_ms=${posMs}`, 'PUT');
                break;
            }
            case 'shuffle':
                if (data.shuffle !== isShuffle) toggleShuffle();
                break;
            case 'loopStatus': {
                const loopToRepeat = { None: 'off', Track: 'track', Playlist: 'context' };
                const next = loopToRepeat[data.loopStatus];
                if (next && next !== repeatMode) {
                    spotifyFetch(`/me/player/repeat?state=${next}`, 'PUT').then(() => {
                        repeatMode = next;
                        updateShuffleRepeatUI();
                        persistPlayerState();
                        mprisUpdatePlayback();
                    });
                }
                break;
            }
            case 'volume':
                if (data.volume !== undefined) setSpotifyVolume(data.volume);
                break;
        }
    });

    console.log('[MPRIS] Renderer connecté au service D-Bus');
}

// ── Settings ──────────────────────────────────────────────────────────────────
const SETTINGS_DEFAULT = {
    streamQuality: 'auto',
    normalizeVolume: false,
    crossfade: 0,
    autoplay: true,
    defaultShuffle: false,
    downloadQuality: 'high',
    animatedBg: true,
    showGenres: true,
    profilePhotoOverride: null
};

let appSettings = { ...SETTINGS_DEFAULT };

function loadAppSettings() {
    try {
        const saved = localStorage.getItem('appSettings');
        if (saved) appSettings = { ...SETTINGS_DEFAULT, ...JSON.parse(saved) };
    } catch (_) {}
}

function saveAppSettings() {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
}

function applyAppSettings() {
    // Photo de profil personnalisée
    if (appSettings.profilePhotoOverride) {
        if (els.userAvatarBtn) els.userAvatarBtn.src = appSettings.profilePhotoOverride;
        if (els.userDropdownAvatar) els.userDropdownAvatar.src = appSettings.profilePhotoOverride;
    }
    // Fond animé
    const bgCarousel = document.getElementById('bg-carousel');
    if (bgCarousel) bgCarousel.style.display = appSettings.animatedBg ? '' : 'none';
    // Genres (appliqué au prochain loadHome)
}

function openSettingsPanel() {
    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const panel = overlay.querySelector('.settings-panel');
    if (panel) {
        anime.remove(panel); anime.remove(overlay);
        anime({ targets: overlay, opacity: [0, 1], duration: _A.d(250), easing: 'linear' });
        anime({ targets: panel, opacity: [0, 1], scale: [0.95, 1], translateY: [-18, 0], duration: _A.d(360), easing: 'easeOutBack' });
    }
    els.userDropdown.classList.remove('open');

    // Photo
    const avatarEl = document.getElementById('settings-avatar');
    if (avatarEl) avatarEl.src = appSettings.profilePhotoOverride || els.userAvatarBtn.src;

    // Nom
    const nameEl = document.getElementById('settings-display-name');
    if (nameEl) nameEl.textContent = els.userDropdownName.textContent || '—';

    // Valeurs des contrôles
    _setVal('settings-stream-quality', appSettings.streamQuality);
    _setChecked('settings-normalize', appSettings.normalizeVolume);
    _setVal('settings-crossfade', appSettings.crossfade);
    const cfVal = document.getElementById('settings-crossfade-val');
    if (cfVal) cfVal.textContent = `${appSettings.crossfade} s`;
    _setChecked('settings-autoplay', appSettings.autoplay);
    _setChecked('settings-default-shuffle', appSettings.defaultShuffle);
    _setVal('settings-download-quality', appSettings.downloadQuality);
    _setChecked('settings-animated-bg', appSettings.animatedBg);
    _setChecked('settings-show-genres', appSettings.showGenres);

    // Aller sur l'onglet Profil
    document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    const firstBtn = document.querySelector('.settings-nav-item[data-section="profile"]');
    const firstSection = document.getElementById('section-profile');
    if (firstBtn) firstBtn.classList.add('active');
    if (firstSection) firstSection.classList.add('active');

    // Données Spotify
    spotifyFetch('/me').then(p => {
        if (!p || p.error) return;
        const emailEl = document.getElementById('settings-email');
        const planEl = document.getElementById('settings-plan');
        const countryEl = document.getElementById('settings-country');
        if (emailEl) emailEl.textContent = p.email || '—';
        if (planEl) planEl.textContent = p.product === 'premium' ? '✓ Premium' : 'Gratuit';
        if (countryEl) countryEl.textContent = p.country || '—';
    }).catch(() => {});
}

function closeSettingsPanel() {
    const overlay = document.getElementById('settings-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    const panel = overlay.querySelector('.settings-panel');
    anime.remove(overlay); anime.remove(panel);
    anime({ targets: overlay, opacity: [1, 0], duration: _A.d(220), easing: 'easeInQuad', complete: () => { overlay.style.display = 'none'; } });
    if (panel) anime({ targets: panel, opacity: [1, 0], scale: [1, 0.95], translateY: [0, -12], duration: _A.d(200), easing: 'easeInQuad' });
}

function _setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function _setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }

function initSettings() {
    loadAppSettings();
    applyAppSettings();

    // Bouton Settings dans le dropdown
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsPanel);

    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;

    // Fermer
    document.getElementById('settings-close-btn').addEventListener('click', closeSettingsPanel);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSettingsPanel(); });

    // Navigation entre sections
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            const sec = document.getElementById(`section-${btn.dataset.section}`);
            if (sec) sec.classList.add('active');
        });
    });

    // ── Profil : photo ────────────────────────────────────────────────────────
    const avatarInput = document.getElementById('settings-avatar-input');
    const triggerUpload = () => avatarInput && avatarInput.click();
    document.getElementById('settings-avatar-overlay').addEventListener('click', triggerUpload);
    document.getElementById('settings-upload-photo').addEventListener('click', triggerUpload);

    avatarInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const dataUrl = ev.target.result;
            appSettings.profilePhotoOverride = dataUrl;
            saveAppSettings();
            document.getElementById('settings-avatar').src = dataUrl;
            if (els.userAvatarBtn) els.userAvatarBtn.src = dataUrl;
            if (els.userDropdownAvatar) els.userDropdownAvatar.src = dataUrl;
        };
        reader.readAsDataURL(file);
        avatarInput.value = ''; // reset pour pouvoir ré-importer le même fichier
    });

    document.getElementById('settings-reset-photo').addEventListener('click', () => {
        appSettings.profilePhotoOverride = null;
        saveAppSettings();
        spotifyFetch('/me').then(p => {
            const img = p?.images?.[0]?.url;
            if (img) {
                document.getElementById('settings-avatar').src = img;
                if (els.userAvatarBtn) els.userAvatarBtn.src = img;
                if (els.userDropdownAvatar) els.userDropdownAvatar.src = img;
            }
        }).catch(() => {});
    });

    // ── Audio ─────────────────────────────────────────────────────────────────
    document.getElementById('settings-stream-quality').addEventListener('change', e => {
        appSettings.streamQuality = e.target.value;
        saveAppSettings();
    });

    document.getElementById('settings-normalize').addEventListener('change', e => {
        appSettings.normalizeVolume = e.target.checked;
        saveAppSettings();
    });

    document.getElementById('settings-crossfade').addEventListener('input', e => {
        appSettings.crossfade = parseInt(e.target.value);
        const cfVal = document.getElementById('settings-crossfade-val');
        if (cfVal) cfVal.textContent = `${appSettings.crossfade} s`;
        saveAppSettings();
    });

    // ── Lecture ───────────────────────────────────────────────────────────────
    document.getElementById('settings-autoplay').addEventListener('change', e => {
        appSettings.autoplay = e.target.checked;
        saveAppSettings();
    });

    document.getElementById('settings-default-shuffle').addEventListener('change', e => {
        appSettings.defaultShuffle = e.target.checked;
        saveAppSettings();
    });

    document.getElementById('settings-download-quality').addEventListener('change', e => {
        appSettings.downloadQuality = e.target.value;
        saveAppSettings();
    });

    // ── Affichage ─────────────────────────────────────────────────────────────
    document.getElementById('settings-animated-bg').addEventListener('change', e => {
        appSettings.animatedBg = e.target.checked;
        saveAppSettings();
        const bgCarousel = document.getElementById('bg-carousel');
        if (bgCarousel) bgCarousel.style.display = e.target.checked ? '' : 'none';
    });

    document.getElementById('settings-show-genres').addEventListener('change', e => {
        appSettings.showGenres = e.target.checked;
        saveAppSettings();
        const genreSection = document.getElementById('home-genres-section');
        if (genreSection) genreSection.style.display = e.target.checked ? 'block' : 'none';
    });

    // ── Compte ────────────────────────────────────────────────────────────────
    document.getElementById('settings-reset-all').addEventListener('click', () => {
        if (!confirm('Réinitialiser tous les paramètres ?')) return;
        appSettings = { ...SETTINGS_DEFAULT };
        saveAppSettings();
        applyAppSettings();
        openSettingsPanel();
    });

    document.getElementById('settings-logout-btn').addEventListener('click', () => {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        window.location.href = 'login.html';
    });
}

// ── Anime.js — utilitaires d'animation ────────────────────────────────────────
const _A = {
    d: (ms) => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms,

    fadeIn(targets, { duration = 300, y = 16, delay = 0 } = {}) {
        anime.remove(targets);
        return anime({ targets, opacity: [0, 1], translateY: [y, 0], duration: _A.d(duration), delay, easing: 'easeOutCubic' });
    },

    popIn(targets, { duration = 320 } = {}) {
        anime.remove(targets);
        return anime({ targets, opacity: [0, 1], scale: [0.93, 1], translateY: [-12, 0], duration: _A.d(duration), easing: 'easeOutBack' });
    },

    fadeOut(targets, { duration = 160, cb } = {}) {
        anime.remove(targets);
        return anime({ targets, opacity: [1, 0], translateY: [0, -8], duration: _A.d(duration), easing: 'easeInQuad', complete: () => { if (cb) cb(); } });
    },

    stagger(targets, { duration = 340, staggerDelay = 45, y = 18 } = {}) {
        const els = typeof targets === 'string' ? document.querySelectorAll(targets) : targets;
        if (!els || !els.length) return;
        anime.remove(els);
        return anime({ targets: els, opacity: [0, 1], translateY: [y, 0], duration: _A.d(duration), delay: anime.stagger(_A.d(staggerDelay), { start: 20 }), easing: 'easeOutCubic' });
    },

    pulse(targets, { scale = 1.45, duration = 420 } = {}) {
        anime.remove(targets);
        return anime({ targets, scale: [1, scale, 1], duration: _A.d(duration), easing: 'easeInOutElastic(1, .6)' });
    },

    pop(targets) {
        anime.remove(targets);
        return anime({ targets, scale: [1, 0.87, 1.07, 1], duration: _A.d(260), easing: 'easeOutElastic(1, .8)' });
    },

    slideScale(targets, { duration = 280 } = {}) {
        anime.remove(targets);
        return anime({ targets, opacity: [0, 1], scale: [0.95, 1], duration: _A.d(duration), easing: 'easeOutCubic' });
    }
};

init();