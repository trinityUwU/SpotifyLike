let currentArtistId = 1424821; // Default
let audioPlayer = new Audio();
let isPlaying = false;
let currentTrack = null;
let bgHistory = [];
let currentBgIndex = 0;

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

    // History Nav
    navBack: document.getElementById('nav-back'),
    navForward: document.getElementById('nav-forward'),

    // Liked tracks header
    detailHeaderLike: document.getElementById('detail-header-like')
};

let currentArtistData = null;
let currentDetailData = null;
let currentDetailTracks = [];
let currentDetailPage = 0;
const TRACKS_PER_PAGE = 50;

// History Navigation State
let historyBack = [];
let historyForward = [];
let isHistoryNavigating = false;
let currentAppState = null;

let likedTracks = [];

function isTrackLiked(trackId) {
    return likedTracks.some(t => t.id == trackId);
}

async function toggleLikeTrack(track, heartEl) {
    try {
        const res = await fetch('/api/local/likes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(track)
        }).then(r => r.json());

        if (res.liked) {
            likedTracks.push(track);
            heartEl.classList.remove('fa-regular');
            heartEl.classList.add('fa-solid', 'liked');
        } else {
            likedTracks = likedTracks.filter(t => t.id != track.id);
            heartEl.classList.remove('fa-solid', 'liked');
            heartEl.classList.add('fa-regular');
        }
    } catch (e) {
        console.error('Failed to toggle like', e);
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
    // Initial load - Home is default
    await loadHome();
    initBgCarousel(); // Dynamic background

    // Fetch Liked Tracks
    try {
        likedTracks = await fetch('/api/local/likes').then(r => r.json());
    } catch (e) {
        console.error('Failed to fetch likes', e);
    }

    // Global Player Events
    els.playBtn.addEventListener('click', togglePlay);
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', () => {
        isPlaying = false;
        updatePlayIcon();
    });

    // History Nav Events
    els.navBack.addEventListener('click', goBack);
    els.navForward.addEventListener('click', goForward);

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

    els.followBtn.addEventListener('click', toggleFollow);

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

    // Library Filters
    document.querySelectorAll('.library-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            const playlistsSection = document.getElementById('playlists-section');
            const artistsSection = document.getElementById('artists-section');

            if (filter === 'all') {
                playlistsSection.style.display = 'block';
                artistsSection.style.display = 'block';
            } else if (filter === 'playlists') {
                playlistsSection.style.display = 'block';
                artistsSection.style.display = 'none';
            } else if (filter === 'artists') {
                playlistsSection.style.display = 'none';
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

    document.addEventListener('click', () => {
        els.contextMenu.style.display = 'none';
    });
}

function switchView(viewName) {
    // Reset nav active states
    els.navHome.classList.remove('active');
    els.navPlaylists.classList.remove('active');

    // Hide all views
    els.artistView.style.display = 'none';
    els.searchView.style.display = 'none';
    els.homeView.style.display = 'none';
    els.playlistsView.style.display = 'none';
    els.detailView.style.display = 'none';

    if (viewName === 'artist') {
        els.artistView.style.display = 'flex';
    } else if (viewName === 'search') {
        els.searchView.style.display = 'flex';
    } else if (viewName === 'home') {
        els.homeView.style.display = 'flex';
        els.navHome.classList.add('active');
    } else if (viewName === 'playlists') {
        els.playlistsView.style.display = 'flex';
        els.navPlaylists.classList.add('active');
    } else if (viewName === 'detail') {
        els.detailView.style.display = 'flex';
    }
    window.scrollTo(0, 0);
}

async function loadHome() {
    switchView('home');
    pushHistory({ type: 'home' });
    try {
        // Fetch data for home - using Gims (4429712) for related artists
        // and top tracks to simulate user preferences
        const [artists, gimsTop] = await Promise.all([
            fetch('/api/deezer/artist/4429712/related').then(r => r.json()),
            fetch('/api/deezer/artist/4429712/top?limit=6').then(r => r.json())
        ]);

        // Fetch charts for trending section
        const charts = await fetch('/api/deezer/chart').then(r => r.json());

        // For the shortcuts, we'll use a mix of Gims top tracks and trending chart items
        const shortcuts = [...gimsTop.data.slice(0, 3), ...charts.tracks.data.slice(0, 3)];

        renderHome(artists.data, shortcuts, charts.albums.data);
    } catch (e) {
        console.error('Failed to load home', e);
    }
}

function renderHome(artists, tracks, albums) {
    // Shortcuts (using first 6 items from tracks/albums)
    els.homeShortcuts.innerHTML = '';
    const shortcutsData = [...tracks.slice(0, 3), ...albums.slice(0, 3)];
    shortcutsData.forEach(item => {
        const title = item.title || item.name;
        const img = item.album ? item.album.cover_medium : item.cover_medium;
        const div = document.createElement('div');
        div.className = 'shortcut-card group';
        div.innerHTML = `
            <img src="${img}" class="shortcut-img">
            <div class="shortcut-info">
                <span class="shortcut-name">${title}</span>
                <div class="shortcut-play-btn"><i class="fa-solid fa-play"></i></div>
            </div>
        `;
        div.addEventListener('click', () => {
            if (item.preview) playTrack(item);
            else if (item.type === 'album') openDetailView('album', item.id);
            else loadArtist(item.artist ? item.artist.id : item.id);
        });
        els.homeShortcuts.appendChild(div);
    });

    // Favorite Artists
    els.homeArtists.innerHTML = '';
    artists.slice(0, 6).forEach(artist => {
        const div = document.createElement('div');
        div.className = 'artist-card';
        div.innerHTML = `
            <div class="artist-card-img-wrapper">
                <img src="${artist.picture_big}" class="artist-card-img">
                <div class="artist-card-play"><i class="fa-solid fa-play"></i></div>
            </div>
            <p class="artist-card-name">${artist.name}</p>
            <p class="artist-card-type">Artiste</p>
        `;
        div.addEventListener('click', () => loadArtist(artist.id));
        els.homeArtists.appendChild(div);
    });

    // Trends (Albums)
    els.homeTrends.innerHTML = '';
    albums.slice(0, 6).forEach(album => {
        const div = document.createElement('div');
        div.className = 'album-card';
        div.innerHTML = `
            <img src="${album.cover_medium}" loading="lazy">
            <div class="album-card-title">${album.title}</div>
            <div class="album-card-year">${album.artist.name}</div>
        `;
        div.addEventListener('click', () => {
            openDetailView('album', album.id);
        });
        els.homeTrends.appendChild(div);
    });
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
        const isLiked = isTrackLiked(track.id);

        div.innerHTML = `
            <div class="track-left">
                <span class="track-index">${index + 1}</span>
                <i class="fa-solid fa-play track-play-icon"></i>
                <img src="${track.album.cover_small}" class="track-img">
                <div class="track-info">
                    <p class="track-name">${track.title}</p>
                    <p class="track-plays">${plays}</p>
                </div>
            </div>
            <div class="track-actions">
                 <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart track-icon heart ${isLiked ? 'liked' : ''}"></i>
                 <i class="fa-solid fa-ellipsis track-icon"></i>
            </div>
        `;

        const heart = div.querySelector('.heart');
        heart.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeTrack(track, heart);
        });

        const dots = div.querySelector('.fa-ellipsis');
        dots.addEventListener('click', (e) => {
            e.stopPropagation();
            // Future context menu implementation
        });

        div.addEventListener('click', () => playTrack(track));
        els.popularList.appendChild(div);
    });
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

// Playlists Logic
async function loadPlaylists() {
    switchView('playlists');
    pushHistory({ type: 'playlists' });

    // Reset filters to "All"
    document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.library-filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    const playlistsSection = document.getElementById('playlists-section');
    const artistsSection = document.getElementById('artists-section');
    if (playlistsSection) playlistsSection.style.display = 'block';
    if (artistsSection) artistsSection.style.display = 'block';

    try {
        const [playlists, followed] = await Promise.all([
            fetch('/api/local/playlists').then(r => r.json()),
            fetch('/api/local/artists').then(r => r.json())
        ]);
        renderPlaylists(playlists, followed);
    } catch (e) {
        console.error('Failed to load playlists', e);
    }
}

function renderPlaylists(playlists, followed) {
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
            els.modal.style.display = 'none';
            els.modalConfirm.removeEventListener('click', onConfirm);
            els.modalCancel.removeEventListener('click', onCancel);
            els.modalUploadBtn.removeEventListener('click', onUploadClick);
            els.modalFileInput.removeEventListener('change', onFileChange);
            els.modalFileInput.value = ''; // Reset
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
            const tracks = await fetch('/api/local/likes').then(r => r.json());
            likedTracks = tracks; // Sync
            currentDetailTracks = tracks;
            currentDetailData = { id: 'liked', name: 'Titres likés' };
            renderDetailView({
                type: 'PLAYLIST',
                title: 'Titres likés',
                cover: '', // Styled via background gradient
                ownerName: 'Votre bibliothèque',
                ownerImg: 'https://i.pravatar.cc/150?img=11',
                meta: `• ${tracks.length} titres`
            });
            els.detailFollowBtn.style.display = 'none';
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
        const globalIndex = start + i + 1;
        const div = document.createElement('div');
        div.className = 'detail-track-item group';
        const mins = Math.floor(t.duration / 60);
        const secs = (t.duration % 60).toString().padStart(2, '0');
        const isLiked = isTrackLiked(t.id);

        div.innerHTML = `
            <div class="flex items-center justify-center">
                <span class="track-num">${globalIndex}</span>
                <i class="fa-solid fa-play track-play-icon-inline"></i>
            </div>
            <div class="track-main-info">
                <p class="track-title-white">${t.title}</p>
                <p class="track-artist-gray">${t.artist.name}</p>
            </div>
            <div class="track-duration">${mins}:${secs}</div>
            <div class="detail-track-actions">
                <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart heart-icon ${isLiked ? 'liked' : ''}"></i>
                <i class="fa-solid fa-ellipsis dots-icon"></i>
            </div>
        `;

        const heart = div.querySelector('.heart-icon');
        heart.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeTrack(t, heart);
        });

        const dots = div.querySelector('.dots-icon');
        dots.addEventListener('click', (e) => {
            e.stopPropagation();
            // Future context menu implementation
        });

        div.addEventListener('click', () => playTrack(t));
        els.detailTracksList.appendChild(div);
    });

    // Scroll back up to the top of the layout
    els.detailLayout.scrollTo({ top: 0, behavior: 'smooth' });
}

// Player Logic
function playTrack(track) {
    currentTrack = track;
    audioPlayer.src = track.preview;
    audioPlayer.play();
    isPlaying = true;
    updatePlayerUI(track);
    updatePlayIcon();
    recordHistory(track); // Update history
}

function togglePlay() {
    if (!currentTrack) return;
    if (isPlaying) audioPlayer.pause();
    else audioPlayer.play();
    isPlaying = !isPlaying;
    updatePlayIcon();
}

function updatePlayIcon() {
    const iconClass = isPlaying ? 'fa-pause' : 'fa-play';
    els.playBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
}

function updatePlayerUI(track) {
    els.npTitle.innerText = track.title;
    els.npArtist.innerText = track.artist.name;
    els.npCover.src = track.album.cover_small;
    els.totalTime.innerText = "0:30";
}

function updateProgress() {
    if (!audioPlayer.duration) return;
    const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    els.progressFill.style.width = `${pct}%`;
    const curMin = Math.floor(audioPlayer.currentTime / 60);
    const curSec = Math.floor(audioPlayer.currentTime % 60);
    els.currentTime.innerText = `${curMin}:${curSec < 10 ? '0' : ''}${curSec}`;
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
    }

    // Tracks
    els.searchTracksList.innerHTML = '';
    tracks.forEach(t => {
        const div = document.createElement('div');
        div.className = 'track-item';
        const isLiked = isTrackLiked(t.id);
        div.innerHTML = `
            <div class="track-left">
                <img src="${t.album.cover_small}" class="track-img">
                <div class="track-info">
                    <p class="track-name">${t.title}</p>
                    <p class="track-plays">${t.artist.name}</p>
                </div>
            </div>
            <div class="track-actions">
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

        const dots = div.querySelector('.fa-ellipsis');
        dots.addEventListener('click', (e) => {
            e.stopPropagation();
            // Future context menu implementation
        });

        div.addEventListener('click', () => playTrack(t));
        els.searchTracksList.appendChild(div);
    });

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
}

init();