
/* --- Global Variables --- */
const stateKey = 'spotify_auth_state';
let accessToken = null;
let player = null;
let deviceId = null;
let isSdkReady = false;
let progressInterval = null; // New
let currentTrackDuration = 0; // New
let currentTrackPosition = 0; // New

// Store current playing context IDs for navigation
let currentDeezerIds = {
    artist: null,
    album: null,
    track: null
};

// Store local playlists for sidebar highlighting
let localPlaylistsData = [];

// --- Navigation History System ---
const appHistory = [];
let historyIndex = -1;

function navigate(page, params = {}, addToHistory = true) {
    if (addToHistory) {
        // Truncate forward history if we are in the middle
        if (historyIndex < appHistory.length - 1) {
            appHistory.splice(historyIndex + 1);
        }
        appHistory.push({ page, params });
        historyIndex++;
    }

    updateHistoryButtons();

    // Execute View Logic
    switch (page) {
        case 'home':
            showView('home-view');
            loadHome();
            break;
        case 'search':
            showView('search-view');
            if (params.query) {
                document.getElementById('search-input').value = params.query;
                handleSearch(params.query);
            }
            break;
        case 'library':
            showView('library-view');
            loadLibrary();
            break;
        case 'album':
            // loadAlbumPage handles fetching and rendering
            // We call showView here to ensure immediate switch
            showView('album-view'); 
            loadAlbumPage(params.id);
            break;
        case 'artist':
            showView('artist-view');
            loadArtistPage(params.id);
            break;
        case 'playlist':
            showView('playlist-view');
            loadLocalPlaylistView(params.playlist);
            break;
        case 'liked':
            showView('playlist-view');
            loadLikedSongs();
            break;
        case 'lyrics':
            // Special case: Lyrics might overlay or be a view
            // Currently implemented as a view
            showView('lyrics-view');
            if (currentDeezerIds.track) {
                loadLyrics(currentDeezerIds.track);
            }
            break;
    }
}

function updateHistoryButtons() {
    const backBtn = document.getElementById('history-back');
    const fwdBtn = document.getElementById('history-forward');
    
    if (backBtn) {
        backBtn.disabled = historyIndex <= 0;
        backBtn.style.opacity = historyIndex <= 0 ? '0.5' : '1';
        backBtn.style.cursor = historyIndex <= 0 ? 'default' : 'pointer';
    }
    
    if (fwdBtn) {
        fwdBtn.disabled = historyIndex >= appHistory.length - 1;
        fwdBtn.style.opacity = historyIndex >= appHistory.length - 1 ? '0.5' : '1';
        fwdBtn.style.cursor = historyIndex >= appHistory.length - 1 ? 'default' : 'pointer';
    }
}

function handleBack() {
    if (historyIndex > 0) {
        historyIndex--;
        const state = appHistory[historyIndex];
        navigate(state.page, state.params, false);
    }
}

function handleForward() {
    if (historyIndex < appHistory.length - 1) {
        historyIndex++;
        const state = appHistory[historyIndex];
        navigate(state.page, state.params, false);
    }
}
// --------------------------------

// Player State
let playerState = {
    shuffled: false,
    repeatMode: 0, // 0: off, 1: context, 2: track
    paused: true
};

/* --- 1. Define SDK Callback IMMEDIATELY --- */
// This must be defined before the SDK script loads
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log("Spotify SDK is Ready");
    isSdkReady = true;
    if (accessToken) {
        initializePlayer();
    }
};

/* --- Auth & DOM Logic --- */
document.addEventListener('DOMContentLoaded', () => {
    // Auth Handling
    const params = getHashParams();
    if (params.access_token) {
        accessToken = params.access_token;
        localStorage.setItem('spotify_access_token', accessToken);
        window.location.hash = '';
        updateUIState(true);
        // Load initial data
        loadSidebarPlaylists();
        navigate('home');
    } else {
        accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
            updateUIState(true);
            // Load initial data
            loadSidebarPlaylists();
            navigate('home');
        } else {
            // Not logged in, show default home view or login prompt?
            // Just show home view with empty/placeholder or force login?
            // Let's show Home View but it will fail to load personal data.
            // Maybe show Trending only.
            navigate('home');
        }
    }

    // Try to init player if SDK was already ready before DOM (unlikely but possible)
    if (isSdkReady && accessToken) {
        initializePlayer();
    }

    // Event Listeners
    document.getElementById('login-btn').addEventListener('click', () => {
        window.location.href = '/login';
    });
    
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Player Info Click Listeners
    document.getElementById('np-title').addEventListener('click', () => {
        if (currentDeezerIds.album) {
            navigate('album', { id: currentDeezerIds.album });
        }
    });

    document.getElementById('np-artist').addEventListener('click', () => {
        if (currentDeezerIds.artist) {
            navigate('artist', { id: currentDeezerIds.artist });
        }
    });

    document.getElementById('search-btn').addEventListener('click', () => handleSearch());
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Navigation
    document.getElementById('nav-home').addEventListener('click', () => navigate('home'));
    document.getElementById('nav-search').addEventListener('click', () => navigate('search'));
    document.getElementById('nav-library').addEventListener('click', () => navigate('library'));

    // History Buttons
    document.getElementById('history-back').addEventListener('click', handleBack);
    document.getElementById('history-forward').addEventListener('click', handleForward);

    // Modal
    document.querySelector('.close-modal').addEventListener('click', closePlaylistModal);
    document.getElementById('create-playlist-btn').addEventListener('click', createPlaylist);
    window.onclick = (event) => {
        if (event.target == document.getElementById('playlist-modal')) {
            closePlaylistModal();
        }
    };

    // Player Controls
    document.getElementById('play-btn').addEventListener('click', togglePlay);
    document.getElementById('prev-btn').addEventListener('click', previousTrack);
    document.getElementById('next-btn').addEventListener('click', nextTrack);
    
    document.getElementById('shuffle-btn').addEventListener('click', toggleShuffle);
    document.getElementById('repeat-btn').addEventListener('click', toggleRepeat);
    document.getElementById('lyrics-btn').addEventListener('click', toggleLyrics);
    document.getElementById('device-btn').addEventListener('click', transferPlayback);

    // Volume Control - MOVED to updateProgressUI section to avoid duplication or conflict
    // const volumeSlider = document.getElementById('volume-slider');
    // if(volumeSlider) {
    //     volumeSlider.addEventListener('input', (e) => {
    //         player?.setVolume(e.target.value / 100);
    //     });
    // }
});

/* --- Data Loading Functions --- */

function handleLogout() {
    localStorage.removeItem('spotify_access_token');
    window.location.href = '/';
}

async function loadHome() {
    // 1. Recently Played (Local) -> Display as Albums
    const recentContainer = document.getElementById('home-recent');
    recentContainer.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const res = await fetch('/api/local/history');
        const tracks = await res.json();
        
        recentContainer.innerHTML = '';
        
        if (tracks.length === 0) {
            recentContainer.innerHTML = '<div>Play some tracks to see history here!</div>';
        } else {
            // Deduplicate Albums
            const seenAlbums = new Set();
            const uniqueAlbums = [];
            
            tracks.forEach(track => {
                if (track.album && !seenAlbums.has(track.album.id)) {
                    seenAlbums.add(track.album.id);
                    // Enrich album with artist if missing
                    const albumData = { ...track.album };
                    if (!albumData.artist && track.artist) {
                        albumData.artist = track.artist;
                    }
                    uniqueAlbums.push(albumData);
                }
            });

            // Limit to 6
            uniqueAlbums.slice(0, 6).forEach(album => {
                const div = document.createElement('div');
                div.className = 'track-card'; // Use standard card styling
                
                const img = album.cover_medium || album.cover_big || album.cover || 'https://via.placeholder.com/150';
                const artistName = album.artist ? album.artist.name : 'Unknown Artist';

                div.innerHTML = `
                    <div class="card-image">
                        <img src="${img}" alt="${album.title}">
                        <button class="play-overlay-btn">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                    </div>
                    <div class="card-content">
                        <div class="track-title" title="${album.title}">${album.title}</div>
                        <div class="track-artist">${artistName}</div>
                    </div>
                `;
                
                div.addEventListener('click', () => navigate('album', { id: album.id }));
                
                // Play button on card should play the album
                const playBtn = div.querySelector('.play-overlay-btn');
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playAlbum(album);
                });

                recentContainer.appendChild(div);
            });
        }
    } catch (e) {
        console.error("Recent load error", e);
        recentContainer.innerHTML = '<div>Error loading history</div>';
    }

    // 2.// Trending (Deezer Charts)
    loadTrending().then(() => updateActiveTrackVisuals());
}

async function loadTrending() {
    // Trending Tracks
    const tracksContainer = document.getElementById('home-trending-tracks');
    // Trending Albums
    const albumsContainer = document.getElementById('home-trending-albums');
    // Trending Playlists
    const playlistsContainer = document.getElementById('home-trending-playlists');

    try {
        const res = await fetch('/api/deezer/chart');
        const data = await res.json();
        
        // Tracks (Limit 5)
        tracksContainer.innerHTML = '';
        data.tracks.data.slice(0, 5).forEach((track, index) => {
             // Reuse track row style
            const div = document.createElement('div');
            div.className = 'track-row';
            div.dataset.trackId = track.id; // Add ID for highlighting
            
            const dur = `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}`;
            div.innerHTML = `
                <div class="track-index">${index + 1}</div>
                <div class="track-info">
                    <img src="${track.album.cover_small}" alt="">
                    <span>${track.title}</span>
                </div>
                <div class="track-album">${track.album.title}</div>
                <div class="track-actions">
                    <button class="track-btn like-btn" title="Save to Liked Songs">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 17.5 3 20.58 3 23 5.42 23 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>
                    <button class="track-btn add-btn" title="Add to Playlist">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </button>
                </div>
                <div class="track-duration">${dur}</div>
            `;
            
            const likeBtn = div.querySelector('.like-btn');
            likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(e, track); });

            const addBtn = div.querySelector('.add-btn');
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddToPlaylistModal(e, track); });

            div.addEventListener('click', () => playTrack(track));
            tracksContainer.appendChild(div);
        });

        // Albums (Limit 6)
        albumsContainer.innerHTML = '';
        data.albums.data.slice(0, 6).forEach(album => createAlbumCard(album, albumsContainer));

        // Playlists (Limit 6)
        playlistsContainer.innerHTML = '';
        data.playlists.data.slice(0, 6).forEach(playlist => {
             const div = document.createElement('div');
             div.className = 'track-card'; // Reuse
             div.innerHTML = `
                <div class="card-image">
                    <img src="${playlist.picture_medium}" alt="${playlist.title}">
                </div>
                <div class="card-content">
                    <div class="track-title">${playlist.title}</div>
                    <div class="track-artist">${playlist.user.name}</div>
                </div>
             `;
             // Playlist playback logic? 
             // Deezer playlist -> Spotify? Hard.
             // Just ignore playback for now or try to fetch tracks.
             div.style.opacity = '0.7'; // Indicate maybe not fully functional
             div.title = "Deezer Playlist (Preview Only)";
             playlistsContainer.appendChild(div);
        });

    } catch (e) {
        console.error("Trending load error", e);
    }
}

async function loadSidebarPlaylists() {
    const list = document.getElementById('sidebar-playlists');
    try {
        const res = await fetch('/api/local/playlists');
        const data = await res.json();
        
        // Update global cache
        localPlaylistsData = data;
        
        list.innerHTML = '';
        
        data.forEach(playlist => {
            const li = document.createElement('li');
            li.innerText = playlist.name;
            li.dataset.playlistId = playlist.id; // Store ID for highlighting
            li.addEventListener('click', () => {
                // Open Playlist View (Local)
                navigate('playlist', { playlist: playlist });
            });
            list.appendChild(li);
        });
        
        // Update highlights in case we reloaded sidebar while playing
        updateSidebarHighlights();
        
    } catch (e) { console.error(e); }
}

async function loadLibrary() {
    const container = document.getElementById('library-playlists');
    container.innerHTML = '<div class="loading">Loading playlists...</div>';
    
    try {
        const res = await fetch('/api/local/playlists');
        const data = await res.json();
        container.innerHTML = '';
        
        // Add "Liked Songs" card
        const likedDiv = document.createElement('div');
        likedDiv.className = 'playlist-card';
        likedDiv.innerHTML = `
            <div style="width:100%; height:100%; background: linear-gradient(135deg, #450af5, #c4efd9); display:flex; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="white"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 17.5 3 20.58 3 23 5.42 23 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
            <div class="playlist-name">Liked Songs</div>
            <div class="playlist-desc">Your local favorites</div>
        `;
        likedDiv.addEventListener('click', () => navigate('liked'));
        container.appendChild(likedDiv);

        data.forEach(playlist => {
            const div = document.createElement('div');
            div.className = 'playlist-card';
            
            // Use cover if available, else placeholder
            let imgHtml = '';
            if (playlist.cover) {
                imgHtml = `<img src="${playlist.cover}" alt="${playlist.name}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                imgHtml = `
                <div style="width:100%; height:100%; background: #333; display:flex; align-items:center; justify-content:center; color:#b3b3b3;">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
                </div>`;
            }

            div.innerHTML = `
                ${imgHtml}
                <div class="playlist-name">${playlist.name}</div>
                <div class="playlist-desc">${playlist.description || (playlist.tracks.length + ' tracks')}</div>
            `;
            div.addEventListener('click', () => navigate('playlist', { playlist: playlist }));
            container.appendChild(div);
        });
        
    } catch (e) {
        console.error(e);
        container.innerHTML = 'Error loading library';
    }
}

/* --- Helper Functions --- */

async function resolveSpotifyUri(deezerTrack) {
    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deezerId: deezerTrack.id, spotifyToken: accessToken })
        });
        const data = await response.json();
        return data.spotifyUri;
    } catch (error) {
        console.error('Conversion failed', error);
        return null;
    }
}

async function toggleLike(event, deezerTrack) {
    const btn = event.currentTarget;
    const isLiked = btn.classList.contains('liked');
    
    // Optimistic UI update
    if (isLiked) {
        btn.classList.remove('liked');
        btn.style.color = 'inherit';
    } else {
        btn.classList.add('liked');
        btn.style.color = '#1db954';
    }

    try {
        const res = await fetch('/api/local/likes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deezerTrack)
        });
        const data = await res.json();
        console.log("Like toggled:", data);
    } catch (e) {
        console.error("Error toggling like", e);
        // Revert UI if error
        if (isLiked) btn.classList.add('liked');
        else btn.classList.remove('liked');
    }
}

async function loadSidebarPlaylists() {
    const list = document.getElementById('sidebar-playlists');
    try {
        const [playlistsRes, artistsRes] = await Promise.all([
            fetch('/api/local/playlists'),
            fetch('/api/local/artists')
        ]);
        
        const playlists = await playlistsRes.json();
        const artists = await artistsRes.json();
        
        // Update global cache
        localPlaylistsData = playlists;
        
        // Render
        list.innerHTML = '';
        
        // 1. Playlists
        playlists.forEach(playlist => {
            const li = document.createElement('li');
            li.innerText = playlist.name;
            li.dataset.playlistId = playlist.id; // Store ID for highlighting
            li.addEventListener('click', () => {
                // Open Playlist View (Local)
                navigate('playlist', { playlist: playlist });
            });
            list.appendChild(li);
        });

        // 2. Followed Artists (Separator)
        if (artists.length > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = "margin: 10px 0 5px 0; padding: 0 24px; font-size: 11px; font-weight: bold; color: #b3b3b3; letter-spacing: 1px;";
            separator.innerText = "ARTISTS";
            list.appendChild(separator);

            artists.forEach(artist => {
                const li = document.createElement('li');
                
                // Artist Image + Name
                const img = artist.picture_medium || 'https://via.placeholder.com/24';
                li.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${img}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                        <span>${artist.name}</span>
                    </div>
                `;
                
                li.addEventListener('click', () => {
                    navigate('artist', { id: artist.id });
                });
                list.appendChild(li);
            });
        }
        
        // Update highlights in case we reloaded sidebar while playing
        updateSidebarHighlights();
        
    } catch (e) {
        console.error("Error loading sidebar:", e);
    }
}

/* --- Playlist Modal Logic --- */
let selectedTrackForPlaylist = null;
let selectedAlbumForPlaylist = null; // New variable for album

function openAddToPlaylistModal(event, deezerTrack) {
    selectedTrackForPlaylist = deezerTrack;
    selectedAlbumForPlaylist = null; // Reset album
    const modal = document.getElementById('playlist-modal');
    modal.classList.remove('hidden');
    loadPlaylists();
}

// Replaced by direct "Save Album" action
async function saveAlbumToLibrary(album) {
    if (!album) return;
    
    const btn = document.getElementById('album-add-btn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<div class="loading-spinner" style="width:20px; height:20px; border:2px solid #fff; border-top:2px solid transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>';
    
    try {
        // 1. Create Playlist with Album Name & Cover
        const createRes = await fetch('/api/local/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: album.title,
                description: `Album by ${album.artist.name}`,
                cover: album.cover_medium || album.cover_small,
                creator: { name: album.artist.name, id: album.artist.id }
            })
        });
        const playlist = await createRes.json();
        
        if (!playlist.id) throw new Error("Failed to create playlist");

        // 2. Add Tracks
        const tracksToAdd = album.tracks.data.map(t => ({
            ...t,
            album: { 
                id: album.id, 
                title: album.title, 
                cover_small: album.cover_small, 
                cover_medium: album.cover_medium 
            }
        }));

        await fetch(`/api/local/playlists/${playlist.id}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tracksToAdd)
        });
        
        // Success Feedback
        btn.innerHTML = 'Ne plus suivre';
        btn.title = "Remove from Library";
        btn.style.color = "var(--text-gray)";
        btn.style.width = "auto";
        btn.style.padding = "0 15px";
        btn.style.fontSize = "12px";
        btn.style.fontWeight = "bold";
        btn.style.borderColor = "var(--text-gray)";
        
        // Refresh sidebar
        await loadSidebarPlaylists();
        
        // Refresh button logic to enable remove
        loadAlbumPage(album.id);

    } catch (e) {
        console.error("Error saving album", e);
        alert("Error saving album to library");
        btn.innerHTML = originalContent;
    }
}

function closePlaylistModal() {
    document.getElementById('playlist-modal').classList.add('hidden');
    selectedTrackForPlaylist = null;
    selectedAlbumForPlaylist = null;
}

async function loadPlaylists() {
    const list = document.getElementById('playlist-list');
    list.innerHTML = '<div style="color:white; padding:10px;">Loading...</div>';
    
    try {
        const res = await fetch('/api/local/playlists');
        const data = await res.json();
        
        list.innerHTML = '';
        data.forEach(playlist => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.innerText = playlist.name;
            div.addEventListener('click', () => addToPlaylist(playlist.id));
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<div style="color:red; padding:10px;">Error loading playlists</div>';
    }
}

async function createPlaylist() {
    const nameInput = document.getElementById('new-playlist-name');
    const name = nameInput.value.trim();
    if (!name) return alert("Please enter a name");
    
    try {
        const res = await fetch('/api/local/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const playlist = await res.json();
        
        if (playlist.id) {
            await addToPlaylist(playlist.id);
            nameInput.value = '';
            // Refresh sidebar/library
            loadSidebarPlaylists();
        }
    } catch (e) {
        console.error(e);
        alert("Error creating playlist");
    }
}

async function addToPlaylist(playlistId) {
    // Determine what to add
    const itemsToAdd = selectedAlbumForPlaylist || (selectedTrackForPlaylist ? [selectedTrackForPlaylist] : []);
    
    if (itemsToAdd.length === 0) return;
    
    const btn = document.getElementById('create-playlist-btn');
    const originalText = btn.innerText;
    btn.innerText = "Adding...";
    
    try {
        const res = await fetch(`/api/local/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemsToAdd)
        });
        
        const data = await res.json();
        
        if (data.added > 0) {
            alert(`Added ${data.added} tracks to playlist!`);
        } else {
            alert("Tracks already in playlist.");
        }
        
        closePlaylistModal();
        // Refresh sidebar/library if needed
        loadSidebarPlaylists();
    } catch (e) {
        console.error(e);
        alert("Error adding to playlist");
    } finally {
        btn.innerText = originalText;
    }
}

function updatePlayerControlsUI() {
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');

    if (playerState.shuffled) {
        shuffleBtn.classList.add('active');
        shuffleBtn.style.color = 'var(--primary)';
    } else {
        shuffleBtn.classList.remove('active');
        shuffleBtn.style.color = 'var(--text-gray)';
    }

    if (playerState.repeatMode > 0) {
        repeatBtn.classList.add('active');
        repeatBtn.style.color = 'var(--primary)';
        // Could change icon for repeat-1
    } else {
        repeatBtn.classList.remove('active');
        repeatBtn.style.color = 'var(--text-gray)';
    }
}

async function togglePlay() {
    if (playerState.paused) {
        // Play
        await fetch(`https://api.spotify.com/v1/me/player/play`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
    } else {
        // Pause
        await fetch(`https://api.spotify.com/v1/me/player/pause`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
    }
    // Sync state
    setTimeout(syncCurrentPlayback, 200);
}

async function nextTrack() {
    await fetch(`https://api.spotify.com/v1/me/player/next`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    setTimeout(syncCurrentPlayback, 500);
}

async function previousTrack() {
    await fetch(`https://api.spotify.com/v1/me/player/previous`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    setTimeout(syncCurrentPlayback, 500);
}

async function toggleShuffle() {
    const newState = !playerState.shuffled;
    // Remove device_id to target the currently active device
    await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${newState}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Sync state to reflect changes
    setTimeout(syncCurrentPlayback, 200);
}

async function toggleRepeat() {
    // Cycle: off -> context -> track -> off
    let newMode = 'off';
    if (playerState.repeatMode === 0) newMode = 'context';
    else if (playerState.repeatMode === 1) newMode = 'track';
    
    // Remove device_id to target the currently active device
    await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${newMode}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    // Sync state to reflect changes
    setTimeout(syncCurrentPlayback, 200);
}

async function transferPlayback() {
    const deviceList = document.getElementById('device-list');
    
    // Toggle visibility
    if (!deviceList.classList.contains('hidden')) {
        deviceList.classList.add('hidden');
        document.getElementById('device-btn').classList.remove('active');
        return;
    }

    // Show loading
    deviceList.classList.remove('hidden');
    document.getElementById('device-btn').classList.add('active');
    document.getElementById('device-btn').style.color = 'var(--primary)';
    deviceList.innerHTML = '<div style="padding:10px; color:white; font-size:12px;">Scanning devices...</div>';

    try {
        const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        const devices = data.devices;

        deviceList.innerHTML = '';

        if (devices.length === 0) {
            deviceList.innerHTML = '<div style="padding:10px; color:white; font-size:12px;">No devices found.</div>';
            return;
        }

        const title = document.createElement('div');
        title.innerText = 'Connect to a device';
        title.style.cssText = 'padding:8px 10px; color:white; font-weight:bold; font-size:14px; border-bottom:1px solid #3e3e3e; margin-bottom:4px;';
        deviceList.appendChild(title);

        devices.forEach(device => {
            const div = document.createElement('div');
            div.className = `device-item ${device.is_active ? 'active' : ''}`;
            
            // Icon based on type
            let icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v16h12V4H6z"/></svg>'; // default/smartphone
            if (device.type.toLowerCase() === 'computer') {
                icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 0v10h16V5H4zm2 14h12v2H6v-2z"/></svg>';
            } else if (device.type.toLowerCase() === 'speaker') {
                icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 2a2 2 0 00-2 2v16a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H8zm0 2h8v16H8V4zM10 6h4v2h-4V6zm0 4h4v8h-4v-8z"/></svg>';
            }

            div.innerHTML = `
                <div class="device-icon">${icon}</div>
                <div class="device-name">${device.name}</div>
                ${device.is_active ? '<div style="font-size:10px;">Listening</div>' : ''}
            `;
            
            div.addEventListener('click', async () => {
                await activateDevice(device.id);
                // Refresh list to update active state
                transferPlayback(); 
                // Close after short delay
                setTimeout(() => {
                    deviceList.classList.add('hidden');
                    document.getElementById('device-btn').classList.remove('active');
                }, 500);
            });
            
            deviceList.appendChild(div);
        });

    } catch (e) {
        console.error("Error fetching devices", e);
        deviceList.innerHTML = '<div style="padding:10px; color:red; font-size:12px;">Error loading devices.</div>';
    }
}

async function activateDevice(id) {
    try {
        await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            body: JSON.stringify({ device_ids: [id], play: true }),
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}` 
            }
        });
        // Update local deviceId if we switch to this web player (though usually this function switches TO another device)
        if (id === deviceId) {
             document.getElementById('device-status').innerText = 'Connected';
             document.getElementById('device-status').style.color = '#1db954';
        } else {
             document.getElementById('device-status').innerText = 'Remote Playback';
             document.getElementById('device-status').style.color = '#1db954';
        }
    } catch (e) {
        console.error("Error transferring playback", e);
    }
}

async function toggleLyrics() {
    const lyricsView = document.getElementById('lyrics-view');
    const isHidden = lyricsView.classList.contains('hidden');
    
    if (isHidden) {
        navigate('lyrics');
        document.getElementById('lyrics-btn').classList.add('active');
        document.getElementById('lyrics-btn').style.color = 'var(--primary)';
    } else {
        // Go back to previous view? For now just hide lyrics view is handled by showView logic when clicking other nav items
        // But if we want to toggle "off" we need to know where we were.
        // Simplification: Navigation buttons handle leaving lyrics view.
        // This button just opens it.
        // We can just go back in history if the previous page wasn't lyrics.
        handleBack();
    }
}

async function loadLyrics(deezerId) {
    document.getElementById('lyrics-content').innerText = "Loading lyrics...";
    
    try {
        const res = await fetch(`/api/deezer/track/${deezerId}`);
        const track = await res.json();
        
        // Deezer API public doesn't always give full lyrics in simple object?
        // Actually public API might not expose lyrics directly in track object.
        // Let's check if we can get them.
        // Documentation says: /track/{id} has no lyrics field usually.
        // But let's try.
        // If not, we might need a workaround or just show "Lyrics not available via this API".
        // Wait, Deezer API *does not* provide lyrics in public API.
        // We might need to rely on a different source or scrape.
        // BUT user asked for it. Let's try to mock or see if we can find a workaround.
        // Actually, sometimes 'lyrics' connection exists? /track/{id}/lyrics? No.
        
        // Alternative: Use a different service or just display a placeholder message explaining limitation.
        document.getElementById('lyrics-content').innerText = "Lyrics are not available in the public Deezer API.\n(Implementation Pending)";
        
    } catch (e) {
        document.getElementById('lyrics-content').innerText = "Failed to load lyrics.";
    }
}

function showView(viewId) {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('search-view').classList.add('hidden');
    document.getElementById('artist-view').classList.add('hidden');
    document.getElementById('album-view').classList.add('hidden');
    document.getElementById('playlist-view').classList.add('hidden'); // Add this
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('lyrics-view').classList.add('hidden');
    
    document.getElementById(viewId).classList.remove('hidden');

    // Update Nav Active State
    document.querySelectorAll('.nav-menu li').forEach(li => li.classList.remove('active'));
    if (viewId === 'home-view') document.getElementById('nav-home').classList.add('active');
    if (viewId === 'search-view') document.getElementById('nav-search').classList.add('active');
    if (viewId === 'library-view') document.getElementById('nav-library').classList.add('active');

    // Reset Lyrics Button State if leaving lyrics view
    if (viewId !== 'lyrics-view') {
        document.getElementById('lyrics-btn').classList.remove('active');
        document.getElementById('lyrics-btn').style.color = 'var(--text-gray)';
    }
}

function getHashParams() {
    var hashParams = {};
    var e, r = /([^&;=]+)=?([^&;]*)/g,
        q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
        hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
}

function updateUIState(isLoggedIn) {
    if (isLoggedIn) {
        document.getElementById('login-btn').classList.add('hidden');
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-name').innerText = 'Premium User';
    }
}

function initializePlayer() {
    if (player) return; // Already initialized

    console.log("Initializing Spotify Player...");
    
    // Check if Spotify is defined (double check)
    if (typeof Spotify === 'undefined') {
        console.error("Spotify SDK not loaded yet.");
        return;
    }

    player = new Spotify.Player({
        name: 'SpotifyLIKE Web Player',
        getOAuthToken: cb => { cb(accessToken); },
        volume: localStorage.getItem('spotify_volume') ? parseFloat(localStorage.getItem('spotify_volume')) : 0.5
    });

    // Error handling
    player.addListener('initialization_error', ({ message }) => { console.error('Init Error:', message); });
    player.addListener('authentication_error', ({ message }) => { 
        console.error('Auth Error:', message); 
        // Token might be expired
        if (message.includes("token")) {
             alert("Session expired. Please login again.");
             localStorage.removeItem('spotify_access_token');
             window.location.reload();
        }
    });
    player.addListener('account_error', ({ message }) => { console.error('Account Error:', message); });
    player.addListener('playback_error', ({ message }) => { 
        console.error('Playback Error:', message); 
        
        // Handle "No list loaded" error (occurs when clicking Next/Prev on a single track)
        if (message.includes('Cannot perform operation; no list was loaded')) {
            const statusEl = document.getElementById('device-status');
            if (statusEl) {
                const originalText = statusEl.innerText;
                const originalColor = statusEl.style.color;
                
                // Show visual feedback
                statusEl.innerText = 'No more tracks';
                statusEl.style.color = '#e91429'; // Red
                
                // Revert after 2 seconds
                setTimeout(() => {
                    statusEl.innerText = originalText;
                    statusEl.style.color = originalColor;
                }, 2000);
            }
        }
    });

    // Playback status updates
    player.addListener('player_state_changed', state => {
        if (!state) return;

        playerState.paused = state.paused;
        playerState.shuffled = state.shuffle;
        playerState.repeatMode = state.repeat_mode;
        
        updatePlayerControlsUI();
        
        // Disable Next/Prev buttons if no tracks available
        const nextBtn = document.getElementById('next-btn');
        const prevBtn = document.getElementById('prev-btn');
        
        // Only update button state if state.track_window exists
        if (state.track_window) {
            if (nextBtn) {
                // Disable if no next tracks in window
                const hasNext = state.track_window.next_tracks && state.track_window.next_tracks.length > 0;
                nextBtn.style.opacity = hasNext ? '1' : '0.5';
                nextBtn.style.cursor = hasNext ? 'pointer' : 'default';
            }

            if (prevBtn) {
                // Disable if no previous tracks in window
                const hasPrev = state.track_window.previous_tracks && state.track_window.previous_tracks.length > 0;
                prevBtn.style.opacity = hasPrev ? '1' : '0.5';
                prevBtn.style.cursor = hasPrev ? 'pointer' : 'default';
            }
        }

        const track = state.track_window.current_track;
        if (track) {
            document.getElementById('np-title').innerText = track.name;
            document.getElementById('np-artist').innerText = track.artists.map(a => a.name).join(', ');
            document.getElementById('np-cover').src = track.album.images[0]?.url || 'https://via.placeholder.com/60';
            
        // Progress Update
        if (state.duration) {
            currentTrackDuration = state.duration;
            currentTrackPosition = state.position;
            updateProgressUI();
            
            // Handle Timer
            if (progressInterval) clearInterval(progressInterval);
            if (!state.paused) {
                progressInterval = setInterval(() => {
                    currentTrackPosition += 1000;
                    if (currentTrackPosition > currentTrackDuration) currentTrackPosition = currentTrackDuration;
                    updateProgressUI();
                }, 1000);
            }
        }

            updatePlayButtonUI();
            
            // Sync Lyrics if open
            if (!document.getElementById('lyrics-view').classList.contains('hidden') && currentDeezerIds.track) {
                // Ideally we check if track changed, but for now we rely on user click or manual sync
            }
            
            // Update Visuals
            updateActiveTrackVisuals();
            updateSidebarHighlights();
        }
    });

    // Ready
    player.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        deviceId = device_id;
        const statusEl = document.getElementById('device-status');
        if(statusEl) statusEl.innerText = 'Connected';
        statusEl.style.color = '#1db954';
        
        // Sync state from Spotify (what is currently playing on account)
        syncCurrentPlayback();
    });

    // Not Ready
    player.addListener('not_ready', ({ device_id }) => {
        console.log('Device ID has gone offline', device_id);
        const statusEl = document.getElementById('device-status');
        if(statusEl) statusEl.innerText = 'Offline';
        statusEl.style.color = '#e91429';
    });

    player.connect();
    
    // Polling for external playback state (e.g. mobile app)
    setInterval(syncCurrentPlayback, 3000);
}

/* --- Progress & State Persistence Logic --- */

function updateProgressUI() {
    // If duration is invalid or 0, reset to 0:00
    if (!currentTrackDuration || currentTrackDuration <= 0) {
        document.getElementById('progress-bar-fill').style.width = `0%`;
        document.getElementById('current-time').innerText = "0:00";
        document.getElementById('total-time').innerText = "0:00";
        return;
    }
    
    const percent = Math.min(100, (currentTrackPosition / currentTrackDuration) * 100);
    document.getElementById('progress-bar-fill').style.width = `${percent}%`;
    
    // Time Format
    const curr = formatTime(currentTrackPosition);
    const total = formatTime(currentTrackDuration);
    
    document.getElementById('current-time').innerText = curr;
    document.getElementById('total-time').innerText = total;
}

function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Seek Functionality & Volume Persistence
document.addEventListener('DOMContentLoaded', () => {
    // Seek Functionality
    const progressBar = document.getElementById('progress-bar-bg');
    if (progressBar) {
        progressBar.addEventListener('click', async (e) => {
            if (!accessToken || currentTrackDuration <= 0) return;
            
            const bar = e.currentTarget;
            const rect = bar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            
            const newPos = Math.floor(currentTrackDuration * percent);
            currentTrackPosition = newPos; // Optimistic update
            updateProgressUI();
            
            // Use API instead of local player.seek to support external devices
            try {
                await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${newPos}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                // Sync shortly after to confirm
                setTimeout(syncCurrentPlayback, 500);
            } catch (err) {
                console.error("Seek error:", err);
            }
        });
    }

    // Persist Volume
    const volumeSlider = document.getElementById('volume-slider');
    if(volumeSlider) {
        // Load Volume
        const storedVol = localStorage.getItem('spotify_volume');
        if (storedVol) {
            volumeSlider.value = storedVol * 100;
        }
        
        volumeSlider.addEventListener('input', (e) => {
            const vol = e.target.value / 100;
            player?.setVolume(vol);
            localStorage.setItem('spotify_volume', vol);
        });
    }
});

function updatePlayButtonUI() {
    document.getElementById('play-btn').innerHTML = playerState.paused ? 
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : 
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
}

async function syncCurrentPlayback() {
    if (!accessToken) return;
    try {
        const res = await fetch('https://api.spotify.com/v1/me/player', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (res.status === 204) {
             console.log("No active playback found.");
             return;
        }
        
        const data = await res.json();
        
        if (data && data.item) {
            console.log("Synced Playback:", data);
            
            // Update Visuals
            document.getElementById('np-title').innerText = data.item.name;
            document.getElementById('np-artist').innerText = data.item.artists.map(a => a.name).join(', ');
            const img = data.item.album.images[0]?.url;
            if (img) document.getElementById('np-cover').src = img;
            
            // Update State
            playerState.paused = !data.is_playing;
            playerState.shuffled = data.shuffle_state;
            playerState.repeatMode = (data.repeat_state === 'off' ? 0 : (data.repeat_state === 'track' ? 2 : 1));
            
            // Sync Time & Progress
            currentTrackDuration = data.item.duration_ms;
            currentTrackPosition = data.progress_ms;
            updateProgressUI();
            
            // Handle Interval for External Playback
            if (progressInterval) clearInterval(progressInterval);
            if (!playerState.paused) {
                // If playing, simulate progress locally between syncs
                progressInterval = setInterval(() => {
                    currentTrackPosition += 1000;
                    if (currentTrackPosition > currentTrackDuration) currentTrackPosition = currentTrackDuration;
                    updateProgressUI();
                }, 1000);
            }
            
            updatePlayButtonUI();
            updatePlayerControlsUI(); // Ensure controls reflect state
            
            // Try to resolve Deezer Context for other features
            resolveDeezerIdsFromSpotify(data.item);
            
            // Visual Updates
            updateActiveTrackVisuals();
            updateSidebarHighlights();
        }
    } catch (e) {
        console.error("Sync error", e);
    }
}

async function resolveDeezerIdsFromSpotify(spotifyTrack) {
    // Search Deezer for this track to get IDs (for Artist page navigation etc)
    try {
        const query = `track:"${spotifyTrack.name}" artist:"${spotifyTrack.artists[0].name}"`;
        const res = await fetch(`/api/deezer/search?q=${encodeURIComponent(query)}&limit=1`);
        const data = await res.json();
        
        if (data.data && data.data.length > 0) {
            const dt = data.data[0];
            currentDeezerIds.track = dt.id;
            currentDeezerIds.album = dt.album.id;
            currentDeezerIds.artist = dt.artist.id;
        }
    } catch (e) {
        // Silent fail
    }
}

async function handleSearch(queryOverride = null) {
    const query = queryOverride || document.getElementById('search-input').value;
    if (!query) return;

    if (!queryOverride) {
        // Called from UI, push to history
        navigate('search', { query });
        return;
    }

    // If we are here, navigate() called us, so just run the search
    showView('search-view');

    // Show loading state
    const tracksContainer = document.getElementById('results-container');
    const artistsContainer = document.getElementById('artists-container');
    
    tracksContainer.innerHTML = '<div class="loading">Searching tracks...</div>';
    artistsContainer.innerHTML = '<div class="loading">Searching artists...</div>';
    document.getElementById('artists-section').classList.remove('hidden');

    try {
        // Parallel requests for Tracks and Artists
        const [tracksRes, artistsRes] = await Promise.all([
            fetch(`/api/deezer/search/track?q=${encodeURIComponent(query)}`),
            fetch(`/api/deezer/search/artist?q=${encodeURIComponent(query)}`)
        ]);

        const tracksData = await tracksRes.json();
        const artistsData = await artistsRes.json();

        displayResults(tracksData.data);
        displayArtists(artistsData.data);

    } catch (error) {
        console.error("Search error:", error);
        tracksContainer.innerHTML = '<div class="error">Search failed.</div>';
        artistsContainer.innerHTML = '';
    }
}

function displayResults(tracks) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<div class="empty">No results found</div>';
        return;
    }

    tracks.forEach(track => {
        const div = document.createElement('div');
        div.className = 'track-card';
        
        // Find best image
        const imgUrl = track.album.cover_medium || track.album.cover_small;
        
        div.innerHTML = `
            <div class="card-image">
                <img src="${imgUrl}" alt="${track.title}">
                <button class="play-overlay-btn" title="Play on Spotify">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>
            <div class="card-content">
                <div class="track-title" title="${track.title}">${track.title}</div>
                <div class="track-artist">${track.artist.name}</div>
            </div>
        `;
        div.addEventListener('click', () => playTrack(track));
        container.appendChild(div);
    });
}

/* --- Artist Follow Logic (Local) --- */

async function updateArtistFollowButton(artist) {
    const btn = document.getElementById('artist-follow-btn');
    if (!btn) return;

    // Reset state
    btn.innerText = 'Loading...';
    btn.style.display = 'inline-block';
    btn.disabled = true;
    btn.onclick = null;

    // Check if user is already following (Locally)
    try {
        const res = await fetch(`/api/local/artists/${artist.id}`);
        const data = await res.json();
        const isFollowing = data.followed;

        renderFollowButtonState(btn, isFollowing, artist);
    } catch (e) {
        console.error("Error checking follow status:", e);
        btn.innerText = 'Error';
    }
}

function renderFollowButtonState(btn, isFollowing, artist) {
    btn.disabled = false;
    
    if (isFollowing) {
        btn.innerText = 'Following';
        btn.style.backgroundColor = 'transparent';
        btn.style.color = 'white';
        btn.style.borderColor = 'white';
        btn.title = "Unfollow Artist";
    } else {
        btn.innerText = 'Follow';
        btn.style.backgroundColor = 'transparent';
        btn.style.color = 'white';
        btn.style.borderColor = '#b3b3b3';
        btn.title = "Follow Artist";
    }

    // Unbind old listeners to prevent duplicates
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => toggleArtistFollow(artist, isFollowing));
}

async function toggleArtistFollow(artist, isCurrentlyFollowing) {
    const btn = document.getElementById('artist-follow-btn');
    
    // Optimistic UI Update
    renderFollowButtonState(btn, !isCurrentlyFollowing, artist);

    try {
        let res;
        if (isCurrentlyFollowing) {
            // Unfollow
            res = await fetch(`/api/local/artists/${artist.id}`, { method: 'DELETE' });
        } else {
            // Follow
            res = await fetch('/api/local/artists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: artist.id,
                    name: artist.name,
                    picture_medium: artist.picture_medium || artist.picture_big,
                    nb_fan: artist.nb_fan
                })
            });
        }
        
        if (!res.ok) throw new Error("Request failed");
        
        // REFRESH SIDEBAR TO SHOW/HIDE ARTIST
        loadSidebarPlaylists();
        
    } catch (e) {
        console.error("Error toggling follow:", e);
        // Revert on error
        renderFollowButtonState(btn, isCurrentlyFollowing, artist);
        alert("Failed to update follow status");
    }
}

function displayArtists(artists) {
    const container = document.getElementById('artists-container');
    container.innerHTML = '';

    if (!artists || artists.length === 0) {
        container.innerHTML = '<div>No artists found</div>';
        return;
    }

    const seenIds = new Set();
    
    artists.forEach(artist => {
        if (seenIds.has(artist.id)) return;
        seenIds.add(artist.id);

        const div = document.createElement('div');
        div.className = 'artist-card';
        div.innerHTML = `
            <div class="artist-image">
                <img src="${artist.picture_medium}" alt="${artist.name}">
            </div>
            <div class="artist-name">${artist.name}</div>
            <div class="track-artist">Artist</div>
        `;
        div.addEventListener('click', () => navigate('artist', { id: artist.id }));
        container.appendChild(div);
    });
}

/* --- Artist Page Logic --- */

async function loadArtistPage(artistId) {
    showView('artist-view');
    
    // Clear previous data
    document.getElementById('artist-name-hero').innerText = 'Loading...';
    document.getElementById('artist-fans').innerText = '';
    document.getElementById('artist-top-tracks').innerHTML = '<div class="loading">Loading top tracks...</div>';
    document.getElementById('artist-albums').innerHTML = '<div class="loading">Loading albums...</div>';
    document.getElementById('artist-related').innerHTML = '<div class="loading">Loading related artists...</div>';

    try {
        // Fetch Artist Details, Top Tracks, Albums, AND Related Artists
        const [artistRes, topRes, albumsRes, relatedRes] = await Promise.all([
            fetch(`/api/deezer/artist/${artistId}`),
            fetch(`/api/deezer/artist/${artistId}/top?limit=5`),
            fetch(`/api/deezer/artist/${artistId}/albums`),
            fetch(`/api/deezer/artist/${artistId}/related`)
        ]);

        const artist = await artistRes.json();
        const topTracks = await topRes.json();
        const albums = await albumsRes.json();
        const related = await relatedRes.json();

        // Render Hero
        document.getElementById('artist-name-hero').innerText = artist.name;
        document.getElementById('artist-hero-image').src = artist.picture_xl || artist.picture_big;
        document.getElementById('artist-fans').innerText = `${artist.nb_fan.toLocaleString()} Fans`;
        
        // Update Follow Button
        updateArtistFollowButton(artist);

        // Render Top Tracks
        renderTopTracks(topTracks.data);

        // Render Albums
        renderAlbums(albums.data);

        // Render Related Artists
        renderRelatedArtists(related.data);
        
        // --- NEW: Set Dynamic Background Overlay from Latest Album ---
        const overlay = document.getElementById('artist-background-overlay');
        if (overlay && albums.data && albums.data.length > 0) {
            // Sort by release date descending to get the latest
            const sortedAlbums = albums.data.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
            const latestAlbum = sortedAlbums[0];
            const bgImage = latestAlbum.cover_xl || latestAlbum.cover_big || latestAlbum.cover_medium;
            
            overlay.style.backgroundImage = `url('${bgImage}')`;
        } else if (overlay) {
             overlay.style.backgroundImage = 'none';
        }
        
        updateActiveTrackVisuals();

    } catch (error) {
        console.error("Error loading artist page:", error);
        alert("Failed to load artist details.");
    }
}

function renderTopTracks(tracks) {
    const container = document.getElementById('artist-top-tracks');
    container.innerHTML = '';

    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<div>No top tracks available.</div>';
        return;
    }

    tracks.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'track-row';
        div.dataset.trackId = track.id; // For highlighting
        
        // Duration fmt
        const min = Math.floor(track.duration / 60);
        const sec = track.duration % 60;
        const dur = `${min}:${sec < 10 ? '0' : ''}${sec}`;

        div.innerHTML = `
            <div class="track-index">${index + 1}</div>
            <div class="track-info">
                <img src="${track.album.cover_small}" alt="">
                <span>${track.title}</span>
            </div>
            <div class="track-album">${track.album.title}</div>
            <div class="track-actions">
                <button class="track-btn like-btn" title="Save to Liked Songs">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 17.5 3 20.58 3 23 5.42 23 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>
                <button class="track-btn add-btn" title="Add to Playlist">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
            </div>
            <div class="track-duration">${dur}</div>
        `;
        
        const likeBtn = div.querySelector('.like-btn');
        likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(e, track); });

        const addBtn = div.querySelector('.add-btn');
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddToPlaylistModal(e, track); });

        div.addEventListener('click', () => playTrack(track));
        container.appendChild(div);
    });
}

function renderAlbums(albums) {
    const container = document.getElementById('artist-albums');
    container.innerHTML = '';

    if (!albums || albums.length === 0) {
        container.innerHTML = '<div>No albums available.</div>';
        return;
    }

    // Deduplicate albums by title (Deezer sometimes returns duplicates with different IDs)
    const uniqueAlbums = [];
    const seenTitles = new Set();
    
    albums.forEach(album => {
        if (!seenTitles.has(album.title)) {
            seenTitles.add(album.title);
            uniqueAlbums.push(album);
        }
    });

    // Split into Albums and Singles
    const fullAlbums = uniqueAlbums.filter(a => a.record_type === 'album' || a.record_type === 'compile');
    const singles = uniqueAlbums.filter(a => a.record_type === 'single' || a.record_type === 'ep');

    if (fullAlbums.length > 0) {
        const title = document.createElement('h3');
        title.innerText = 'Albums';
        title.className = 'section-title';
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'grid-container';
        fullAlbums.forEach(album => createAlbumCard(album, grid));
        container.appendChild(grid);
    }

    if (singles.length > 0) {
        const title = document.createElement('h3');
        title.innerText = 'Singles & EPs';
        title.className = 'section-title';
        title.style.marginTop = '32px';
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'grid-container';
        singles.forEach(album => createAlbumCard(album, grid));
        container.appendChild(grid);
    }
}

function createAlbumCard(album, container) {
    const div = document.createElement('div');
    div.className = 'track-card';
    div.innerHTML = `
        <div class="card-image">
            <img src="${album.cover_medium}" alt="${album.title}">
            <button class="play-overlay-btn">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
        </div>
        <div class="card-content">
            <div class="track-title" title="${album.title}">${album.title}</div>
            <div class="track-artist">${(album.release_date || '????').split('-')[0]} • ${album.record_type}</div>
        </div>
    `;
    
    div.addEventListener('click', () => navigate('album', { id: album.id }));
    container.appendChild(div);
}

async function loadAlbumPage(albumId) {
    // showView('album-view'); // Handled by navigate
    
    // Reset UI
    document.getElementById('album-title-hero').innerText = 'Loading...';
    document.getElementById('album-artist-name').innerText = '';
    document.getElementById('album-year').innerText = '';
    document.getElementById('album-track-count').innerText = '';
    document.getElementById('album-cover-hero').src = '';
    document.getElementById('album-tracks-list').innerHTML = '<div class="loading">Loading tracks...</div>';

    try {
        const res = await fetch(`/api/deezer/album/${albumId}`);
        const album = await res.json();

        if (album.error) throw new Error(album.error.message);

        // Fill Header
        document.getElementById('album-title-hero').innerText = album.title;
        document.getElementById('album-cover-hero').src = album.cover_medium; // medium or big
        document.getElementById('album-artist-name').innerText = album.artist.name;
        document.getElementById('album-year').innerText = album.release_date.split('-')[0];
        document.getElementById('album-track-count').innerText = `${album.nb_tracks} songs`;
        document.getElementById('album-type').innerText = album.record_type;

        // Set artist click handler
        document.getElementById('album-artist-name').onclick = () => navigate('artist', { id: album.artist.id });
        document.getElementById('album-artist-name').style.cursor = 'pointer';

        // Set Play Album button
        // We pass the full album object to playAlbum
        document.getElementById('album-play-btn').onclick = () => playAlbum(album);
        
        // Set Add Album button (Direct Save)
        const addBtn = document.getElementById('album-add-btn');
        
        // Check if album is already saved in local playlists
        const isSaved = localPlaylistsData.some(p => p.name === album.title && p.description === `Album by ${album.artist.name}`);
        
        if (isSaved) {
             // Show "Ne plus suivre"
             addBtn.innerHTML = 'Ne plus suivre';
             addBtn.style.borderColor = "var(--text-gray)";
             addBtn.style.color = "var(--text-gray)";
             addBtn.style.fontSize = "12px";
             addBtn.style.fontWeight = "bold";
             addBtn.style.width = "auto";
             addBtn.style.padding = "0 15px";
             addBtn.title = "Remove from Library";
             
             // Toggle Logic: Remove
             addBtn.onclick = async () => {
                  if(confirm("Remove this album from your library?")) {
                       // Find playlist ID
                       const playlist = localPlaylistsData.find(p => p.name === album.title && p.description === `Album by ${album.artist.name}`);
                       if(playlist) {
                           await fetch(`/api/local/playlists/${playlist.id}`, { method: 'DELETE' });
                           await loadSidebarPlaylists(); // Refresh sidebar data first
                           loadAlbumPage(albumId); // Refresh UI
                       }
                  }
             };
        } else {
            // Show "Suivre"
            addBtn.innerHTML = 'Suivre';
            addBtn.style.borderColor = "var(--text-gray)";
            addBtn.style.color = "white";
            addBtn.style.fontSize = "12px";
            addBtn.style.fontWeight = "bold";
            addBtn.style.width = "auto";
            addBtn.style.padding = "0 15px";
            addBtn.title = "Save Album to Library";
            
            // Toggle Logic: Add
            addBtn.onclick = () => saveAlbumToLibrary(album);
        }

        // Render Tracks
        renderAlbumTracks(album.tracks.data, album);
        updateActiveTrackVisuals();

    } catch (error) {
        console.error("Error loading album:", error);
        alert("Failed to load album details.");
    }
}

function renderAlbumTracks(tracks, albumContext) {
    const container = document.getElementById('album-tracks-list');
    container.innerHTML = '';

    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<div>No tracks available.</div>';
        return;
    }

    tracks.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'track-row';
        div.dataset.trackId = track.id; // Highlight
        
        // Duration fmt
        const min = Math.floor(track.duration / 60);
        const sec = track.duration % 60;
        const dur = `${min}:${sec < 10 ? '0' : ''}${sec}`;

        div.innerHTML = `
            <div class="track-index">${index + 1}</div>
            <div class="track-info">
                <span>${track.title}</span>
                <span style="display:block; font-size:12px; color:var(--text-gray); margin-top:4px;">${track.artist.name}</span>
            </div>
            <div class="track-actions">
                <button class="track-btn like-btn" title="Save to Liked Songs">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 17.5 3 20.58 3 23 5.42 23 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>
                <button class="track-btn add-btn" title="Add to Playlist">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
            </div>
            <div class="track-duration">${dur}</div>
        `;
        
        const likeBtn = div.querySelector('.like-btn');
        likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(e, track); });

        const addBtn = div.querySelector('.add-btn');
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddToPlaylistModal(e, track); });

        // When playing a track from an album view, we might want to pass the album context
        // But our current playTrack logic resolves single tracks.
        // Ideally, we'd queue the whole album starting from this track, but let's stick to single track playback for now or try context.
        // For simplicity: Play single track.
        div.addEventListener('click', () => {
            // Ensure track object has full context for playTrack to extract IDs
            const trackWithContext = { ...track };
            // Add Album context explicitly if missing (for Top Tracks view)
            if (!trackWithContext.album) {
                // For top tracks, album is inside, but sometimes we need to be sure
            }
            // Add Artist context
            if (!trackWithContext.artist && albumContext) {
                 trackWithContext.artist = albumContext.artist;
            }
            if (albumContext) {
                 // Ensure album structure matches what playTrack expects
                 if (!trackWithContext.album) trackWithContext.album = {};
                 trackWithContext.album.id = albumContext.id;
                 trackWithContext.album.title = albumContext.title;
            }
            
            playTrack(trackWithContext);
        });
        container.appendChild(div);
    });
}

function renderRelatedArtists(artists) {
    const container = document.getElementById('artist-related');
    container.innerHTML = '';

    if (!artists || artists.length === 0) {
        container.innerHTML = '<div>No related artists found.</div>';
        return;
    }

    // Reuse the same style as search results
    artists.forEach(artist => {
        const div = document.createElement('div');
        div.className = 'artist-card';
        div.innerHTML = `
            <div class="artist-image">
                <img src="${artist.picture_medium}" alt="${artist.name}">
            </div>
            <div class="artist-name">${artist.name}</div>
            <div class="track-artist">Artist</div>
        `;
        div.addEventListener('click', () => {
            // Scroll to top when loading new artist
            document.getElementById('artist-view').scrollTo(0, 0);
            navigate('artist', { id: artist.id });
        });
        container.appendChild(div);
    });
}

async function playAlbum(deezerAlbum) {
    if (!deviceId) return alert("Player not ready");
    
    // Update global IDs for navigation
    if (deezerAlbum.artist && deezerAlbum.artist.id) {
        currentDeezerIds.artist = deezerAlbum.artist.id;
    }
    if (deezerAlbum.id) {
        currentDeezerIds.album = deezerAlbum.id;
    }

    console.log("Playing Album:", deezerAlbum);
    const statusEl = document.getElementById('device-status');
    const originalText = statusEl.innerText;
    statusEl.innerText = 'Resolving Album...';

    // Strategy: Search Spotify for "album:{name} artist:{artist}"
    // This is client-side logic but uses the existing proxy/token
    try {
        const query = `album:${deezerAlbum.title} artist:${document.getElementById('artist-name-hero').innerText}`;
        const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        
        if (data.albums && data.albums.items.length > 0) {
            const spotifyAlbumUri = data.albums.items[0].uri;
            console.log("Found Spotify Album:", spotifyAlbumUri);
            
            // If playing a specific track, find its offset
            let offset = undefined;
            if (deezerAlbum.trackId) { // Check if we passed a trackId context
                 // Strategy: We need the Spotify URI of the track to use offset.
                 // This requires searching for the track within the album or just trusting the track conversion logic.
                 // BUT, playAlbum is usually called with an ALBUM object.
                 // Let's modify playTrack to call a new function playContext instead.
            }

            statusEl.innerText = 'Playing Album...';
            
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    context_uri: spotifyAlbumUri
                    // offset: ... if needed
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
            });
        } else {
            alert("Album not found on Spotify");
            statusEl.innerText = originalText;
        }
    } catch (e) {
        console.error(e);
        alert("Error playing album");
        statusEl.innerText = originalText;
    }
}

/* --- Visual Highlighting Logic --- */

function updateActiveTrackVisuals() {
    // 1. Remove active class from all tracks
    document.querySelectorAll('.track-row.active-track').forEach(el => {
        el.classList.remove('active-track');
        // Restore index number if needed
        const indexEl = el.querySelector('.track-index');
        if (indexEl && indexEl.dataset.originalIndex) {
            indexEl.innerHTML = indexEl.dataset.originalIndex;
        }
    });

    if (!currentDeezerIds.track) return;

    // 2. Add active class to matching tracks
    // We use a loose check because sometimes IDs are strings vs numbers
    const tracks = document.querySelectorAll(`.track-row[data-track-id="${currentDeezerIds.track}"]`);
    
    tracks.forEach(el => {
        el.classList.add('active-track');
        
        // Replace index with playing icon
        const indexEl = el.querySelector('.track-index');
        if (indexEl) {
            if (!indexEl.dataset.originalIndex) {
                indexEl.dataset.originalIndex = indexEl.innerText;
            }
            // Playing icon HTML
            indexEl.innerHTML = `
                <div class="playing-icon">
                    <div class="playing-icon-bar"></div>
                    <div class="playing-icon-bar"></div>
                    <div class="playing-icon-bar"></div>
                </div>
            `;
        }
    });
}

function updateSidebarHighlights() {
    // Remove previous highlights
    document.querySelectorAll('#sidebar-playlists li.active-playlist').forEach(el => {
        el.classList.remove('active-playlist');
    });

    if (!currentDeezerIds.track) return;

    // Find which playlists contain this track
    const matchingPlaylistIds = new Set();
    
    localPlaylistsData.forEach(playlist => {
        // Check if track exists in playlist
        const hasTrack = playlist.tracks.some(t => t.id == currentDeezerIds.track);
        if (hasTrack) {
            matchingPlaylistIds.add(playlist.id);
        }
    });

    // Highlight sidebar items
    const sidebarItems = document.querySelectorAll('#sidebar-playlists li');
    sidebarItems.forEach(li => {
        if (matchingPlaylistIds.has(li.dataset.playlistId)) {
            li.classList.add('active-playlist');
        }
    });
}

/* --- Player Logic (Conversion) --- */

/* --- Smart Playback Logic --- */

async function addToHistory(track) {
    if (!track || !track.id) return;
    try {
        await fetch('/api/local/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(track)
        });
        // Optionally refresh home view if currently visible
        if (!document.getElementById('home-view').classList.contains('hidden')) {
            loadHome();
        }
    } catch (e) {
        console.error("Error adding to history", e);
    }
}

async function playTrack(deezerTrack) {
    if (!deviceId) return alert('Player not ready.');

    // Update navigation context
    if (deezerTrack.artist && deezerTrack.artist.id) currentDeezerIds.artist = deezerTrack.artist.id;
    if (deezerTrack.album && deezerTrack.album.id) currentDeezerIds.album = deezerTrack.album.id;
    if (deezerTrack.id) currentDeezerIds.track = deezerTrack.id;

    // Add to Local History
    addToHistory(deezerTrack);

    console.log('Selected Track:', deezerTrack);
    const statusEl = document.getElementById('device-status');
    statusEl.innerText = 'Resolving...';

    // 1. Check if we have an Album Context (playing from Album View)
    if (deezerTrack.album && deezerTrack.album.title && deezerTrack.artist) {
        // Try to play as Album Context with Offset
        const success = await playAlbumContext(deezerTrack);
        if (success) return;
    }

    // 2. Fallback: Play single track (old method)
    console.log("Fallback to single track playback");
    
    const uri = await resolveSpotifyUri(deezerTrack);
    
    if (uri) {
        statusEl.innerText = 'Playing...';
        await fetch(`https://api.spotify.com/v1/me/player/play`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [uri] }),
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
    } else {
        alert('Track not found on Spotify.');
        statusEl.innerText = 'Error';
    }
}

async function playAlbumContext(deezerTrack) {
    const statusEl = document.getElementById('device-status');
    const albumName = deezerTrack.album.title;
    const artistName = deezerTrack.artist.name;
    const trackName = deezerTrack.title;

    try {
        // Find Spotify Album
        const query = `album:${albumName} artist:${artistName}`;
        const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const searchData = await searchRes.json();

        if (searchData.albums && searchData.albums.items.length > 0) {
            const spotifyAlbumUri = searchData.albums.items[0].uri;
            console.log(`Found Album URI: ${spotifyAlbumUri}`);

            // Now we need the Spotify URI of the specific track to set the offset.
            // We can't use Deezer ID here. We must find the track INSIDE this Spotify Album.
            // Or we can search for the track on Spotify and hope it matches the one in the album.
            
            // Strategy: Convert the track first to get its URI
            const uri = await resolveSpotifyUri(deezerTrack);

            if (uri) {
                // Play Album with Offset
                console.log(`Playing Album Context with Offset: ${uri}`);
                const playRes = await fetch(`https://api.spotify.com/v1/me/player/play`, {
                    method: 'PUT',
                    body: JSON.stringify({ 
                        context_uri: spotifyAlbumUri,
                        offset: { uri: uri }
                    }),
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                });

                if (playRes.status === 204) {
                    statusEl.innerText = 'Playing Album...';
                    return true;
                } else {
                    console.warn("Context play failed, maybe track not in album version found.");
                    return false;
                }
            }
        }
    } catch (e) {
        console.error("Smart Album Play failed", e);
    }
    return false;
}

/* --- Local Views --- */

async function loadLocalPlaylistView(playlist) {
    // showView('playlist-view'); // Handled by navigate
    
    document.getElementById('playlist-title-hero').innerText = playlist.name;
    document.getElementById('playlist-track-count').innerText = `${playlist.tracks.length} songs`;
    
    const ownerEl = document.getElementById('playlist-owner');
    if (playlist.creator && typeof playlist.creator === 'object') {
        ownerEl.innerHTML = `<span class="hover-underline">${playlist.creator.name}</span>`;
        ownerEl.onclick = () => navigate('artist', { id: playlist.creator.id });
        ownerEl.style.cursor = 'pointer';
    } else if (playlist.creator) {
        ownerEl.innerText = playlist.creator;
        ownerEl.onclick = null;
        ownerEl.style.cursor = 'default';
    } else {
        ownerEl.innerText = 'You';
        ownerEl.onclick = null;
        ownerEl.style.cursor = 'default';
    }
    
    // Set playlist cover
    const coverDiv = document.getElementById('playlist-cover-hero');
    if (playlist.cover) {
        coverDiv.innerHTML = `<img src="${playlist.cover}" alt="${playlist.name}" style="width:100%; height:100%; object-fit:cover; box-shadow: 0 4px 60px rgba(0,0,0,0.5);">`;
        coverDiv.style.background = 'transparent';
    } else {
        // Reset to placeholder
        coverDiv.innerHTML = '<svg viewBox="0 0 24 24" width="64" height="64" fill="#b3b3b3"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>';
        coverDiv.style.background = '#333';
    }

    // Tracks
    const container = document.getElementById('playlist-tracks-list');
    container.innerHTML = '';
    
    if (playlist.tracks.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:#b3b3b3;">This playlist is empty.</div>';
        return;
    }
    
    playlist.tracks.forEach((track, index) => {
        renderTrackRow(track, index, container, playlist);
    });
    updateActiveTrackVisuals();

    // Play Button
    document.getElementById('playlist-play-btn').onclick = () => {
        if (playlist.tracks.length > 0) {
            playTrack(playlist.tracks[0]);
            // Ideally queue the rest
        }
    };

    // Delete Button Logic
    const deleteBtn = document.getElementById('playlist-delete-btn');
    // Only show delete button for custom playlists (not "Liked Songs")
    if (playlist.id !== 'liked') {
        deleteBtn.classList.remove('hidden');
        deleteBtn.onclick = async () => {
            if (confirm(`Are you sure you want to delete playlist "${playlist.name}"?`)) {
                try {
                    const res = await fetch(`/api/local/playlists/${playlist.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        alert("Playlist deleted");
                        loadSidebarPlaylists(); // Refresh sidebar
                        navigate('library'); // Go back to library
                    } else {
                        alert("Failed to delete playlist");
                    }
                } catch (e) {
                    console.error(e);
                    alert("Error deleting playlist");
                }
            }
        };
    } else {
        deleteBtn.classList.add('hidden');
    }
}

async function loadLikedSongs() {
    showView('playlist-view');
    
    document.getElementById('playlist-title-hero').innerText = 'Liked Songs';
    document.getElementById('playlist-owner').innerText = 'You';
    
    // Custom cover for Liked Songs
    const coverDiv = document.getElementById('playlist-cover-hero');
    coverDiv.innerHTML = '<svg viewBox="0 0 24 24" width="64" height="64" fill="white"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 17.5 3 20.58 3 23 5.42 23 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    coverDiv.style.background = 'linear-gradient(135deg, #450af5, #c4efd9)';

    const container = document.getElementById('playlist-tracks-list');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const res = await fetch('/api/local/likes');
        const tracks = await res.json();
        
        document.getElementById('playlist-track-count').innerText = `${tracks.length} songs`;
        container.innerHTML = '';
        
        if (tracks.length === 0) {
            container.innerHTML = '<div style="padding:20px; color:#b3b3b3;">No liked songs yet.</div>';
            return;
        }
        
        tracks.forEach((track, index) => {
            renderTrackRow(track, index, container, { id: 'liked', title: 'Liked Songs' });
        });
        updateActiveTrackVisuals();

        // Play Button
        document.getElementById('playlist-play-btn').onclick = () => {
            if (tracks.length > 0) {
                playTrack(tracks[0]);
            }
        };
        
        // Hide delete button for Liked Songs
        document.getElementById('playlist-delete-btn').classList.add('hidden');
        
    } catch (e) {
        container.innerHTML = 'Error loading liked songs';
    }
}

function renderTrackRow(track, index, container, context) {
    const div = document.createElement('div');
    div.className = 'track-row';
    div.dataset.trackId = track.id; // For highlighting
    
    const min = Math.floor(track.duration / 60);
    const sec = track.duration % 60;
    const dur = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    // Check if we are in a custom playlist (not Liked Songs)
    const isCustomPlaylist = context && context.id && context.id !== 'liked';

    div.innerHTML = `
        <div class="track-index">${index + 1}</div>
        <div class="track-info">
            <img src="${track.album.cover_small}" alt="">
            <span>${track.title}</span>
            <span style="display:block; font-size:12px; color:var(--text-gray); margin-top:4px;">${track.artist.name}</span>
        </div>
        <div class="track-actions">
            <button class="track-btn like-btn" title="Save to Liked Songs">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 17.5 3 20.58 3 23 5.42 23 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
            <button class="track-btn add-btn" title="Add to Playlist">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            ${isCustomPlaylist ? `
            <button class="track-btn remove-btn" title="Remove from Playlist" style="color: #b3b3b3;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
            ` : ''}
        </div>
        <div class="track-duration">${dur}</div>
    `;
    
    // Like button logic
    const likeBtn = div.querySelector('.like-btn');
    // Check if liked locally
    fetch(`/api/local/likes/${track.id}`).then(r => r.json()).then(d => {
        if (d.liked) {
            likeBtn.classList.add('liked');
            likeBtn.style.color = '#1db954';
        }
    });

    likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(e, track); });

    const addBtn = div.querySelector('.add-btn');
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddToPlaylistModal(e, track); });

    if (isCustomPlaylist) {
        const removeBtn = div.querySelector('.remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Remove "${track.title}" from playlist?`)) {
                    try {
                        const res = await fetch(`/api/local/playlists/${context.id}/tracks/${track.id}`, {
                            method: 'DELETE'
                        });
                        if (res.ok) {
                            // Remove row from UI immediately
                            div.remove();
                            // Update count in header
                            const countEl = document.getElementById('playlist-track-count');
                            const currentCount = parseInt(countEl.innerText);
                            if (!isNaN(currentCount)) {
                                countEl.innerText = `${currentCount - 1} songs`;
                            }
                            // Refresh sidebar count if needed
                            loadSidebarPlaylists(); 
                        } else {
                            alert("Failed to remove track");
                        }
                    } catch (err) {
                        console.error(err);
                        alert("Error removing track");
                    }
                }
            });
        }
    }

    div.addEventListener('click', () => {
        // Play track
        // Ensure we pass full track object
        playTrack(track);
    });
    
    container.appendChild(div);
}

