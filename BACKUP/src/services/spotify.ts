
// Scopes are now handled by the backend
export const loginUrl = "http://127.0.0.1:3001/login";

export const getTokenFromUrl = () => {
    return window.location.hash
        .substring(1)
        .split("&")
        .reduce((initial: any, item) => {
            let parts = item.split("=");
            initial[parts[0]] = decodeURIComponent(parts[1]);
            return initial;
        }, {});
};

// ─── Cache mémoire simple pour éviter les 429 ─────────────────────────────
// Stocke les résultats en mémoire avec TTL pour ne pas refaire les mêmes appels
const memCache: Map<string, { data: any; expiresAt: number }> = new Map();

const CACHE_TTL_MS = 30_000; // 30 secondes

const getCached = (key: string): any | null => {
    const entry = memCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        memCache.delete(key);
        return null;
    }
    return entry.data;
};

const setCache = (key: string, data: any, ttl = CACHE_TTL_MS) => {
    memCache.set(key, { data, expiresAt: Date.now() + ttl });
};

// ─── Dedup in-flight requests (évite les appels en double sur React StrictMode) ──
const inflightRequests: Map<string, Promise<any>> = new Map();

// ─── Proxy Backend (hybride CC/User token) ────────────────────────────────
// Stratégie :
//   - Playlists, shows, episodes → token utilisateur en Authorization header
//     (le CC token est rate-limité 20h+ sur les playlists éditoriales Spotify)
//   - Artistes, albums            → CC token géré côté serveur
const SERVER_BASE = 'http://127.0.0.1:3001';

const PLAYLIST_PATH_PREFIXES = ['playlists/', 'shows/', 'episodes/', 'browse/'];

export const serverFetch = async (
    path: string,
    params: Record<string, string> = {},
    userToken?: string
): Promise<any> => {
    const qs = new URLSearchParams(params).toString();
    const url = `${SERVER_BASE}/api/spotify/${path}${qs ? '?' + qs : ''}`;

    // Déterminer si ce chemin nécessite le token utilisateur
    const needsUserToken = PLAYLIST_PATH_PREFIXES.some(p => path.startsWith(p));

    const headers: Record<string, string> = {};
    if (needsUserToken && userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
    }

    const res = await fetch(url, { headers });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) {
        const msg = data?.error?.message || data?.error || `HTTP_${res.status}`;
        if (res.status === 401) throw new Error('UNAUTHORIZED');
        if (res.status === 403) throw new Error('FORBIDDEN');
        if (res.status === 404) throw new Error('NOT_FOUND');
        if (res.status === 429) throw new Error(`RATE_LIMIT_EXCEEDED calling ${path}`);
        throw new Error(msg);
    }
    return data;
};


// ─── Shared Fetch Helper ───────────────────────────────────────────────────
export const spotifyFetch = async (url: string, token: string, options: any = {}, retryCount = 0): Promise<any> => {
    const isReadOnly = !options.method || options.method === 'GET';
    const cacheKey = `${url}::${token.slice(-8)}`; // utilise les 8 derniers chars du token comme clé partielle

    // Pour les GET, check cache d'abord
    if (isReadOnly && retryCount === 0) {
        const cached = getCached(cacheKey);
        if (cached !== null) return cached;

        // Dedup: si le même appel est déjà en flight, on attend le même résultat
        if (inflightRequests.has(cacheKey)) {
            return inflightRequests.get(cacheKey)!;
        }
    }

    const fetchPromise = (async () => {
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers
        };

        let response = await fetch(url, { ...options, headers });

        if (response.status === 429) {
            if (retryCount >= 3) throw new Error(`RATE_LIMIT_EXCEEDED calling ${url}`);
            const retryHeader = response.headers.get("Retry-After");
            const retryAfter = retryHeader ? parseInt(retryHeader, 10) : 5;
            console.warn(`[spotifyFetch] Rate limited (${url.split('?')[0]}), retry dans ${retryAfter + 1}s (${retryCount + 1}/3)`);
            await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
            return spotifyFetch(url, token, options, retryCount + 1);
        }

        if (response.status === 401) throw new Error("UNAUTHORIZED");
        if (response.status === 403) throw new Error("FORBIDDEN");
        if (response.status === 404) throw new Error("NOT_FOUND");
        if (!response.ok) {
            try {
                const errJson = await response.json();
                console.error("Spotify API Error:", response.status, errJson);
            } catch { }
            throw new Error(`API_ERROR_${response.status}`);
        }

        if (response.status === 204 || response.status === 202) return null;

        const data = await response.json();

        // Mettre en cache les réponses GET
        if (isReadOnly) {
            setCache(cacheKey, data);
        }

        return data;
    })();

    // Enregistrer la promesse en flight pour dedup
    if (isReadOnly && retryCount === 0) {
        inflightRequests.set(cacheKey, fetchPromise);
        fetchPromise.finally(() => inflightRequests.delete(cacheKey));
    }

    return fetchPromise;
};

// ─── Utilitaires pour extraire les tracks depuis un item Spotify ───────────
// Doc officielle (fév 2026) : chaque item contient DEUX champs :
//   item.item  → nouveau format (track ou episode)
//   item.track → ancien format (alias maintenu pour compat)
// On utilise item.item en priorité, avec fallback sur item.track, puis item direct
export const extractTrackFromItem = (item: any): any | null => {
    if (!item) return null;
    // Nouveau format API : item.item
    const t = item.item || item.track || item.episode;
    if (t && t.id) return { ...t, added_at: item.added_at };
    // Track direct (albums)
    if (item.id && item.name) return item;
    return null;
};

// ─── Profil & Bibliothèque ─────────────────────────────────────────────────
export const searchSpotify = (token: string, query: string, types: string = 'track,artist,album,show,episode') =>
    spotifyFetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${types}&limit=30`, token);

export interface SpotifyTrack {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    uri: string;
}

export const fetchProfile = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me", token);

export const fetchTopTracks = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/top/tracks?limit=20", token);

// GET /me/playlists — endpoint stable (remplace l'ancien /users/{id}/playlists)
export const fetchPlaylists = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/playlists?limit=50", token);

// GET /playlists/{id} — passe par le proxy backend avec le token UTILISATEUR
// Le proxy gère le cache serveur 5min et le rate-limiting.
// On utilise le token user (pas CC) car les playlists éditoriales sont bloquées en CC.
export const fetchPlaylist = (token: string, playlistId: string) =>
    serverFetch(`playlists/${playlistId}`, { market: 'from_token' }, token);

// Version directe fallback (appel Spotify direct sans proxy)
export const fetchPlaylistDirect = (token: string, playlistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}?market=from_token`, token);

// GET /playlists/{id}/tracks — via proxy backend avec token utilisateur
export const fetchPlaylistTracks = (token: string, playlistId: string, limit: number = 50, offset: number = 0) =>
    serverFetch(
        `playlists/${playlistId}/tracks`,
        { limit: String(limit), offset: String(offset), market: 'from_token' },
        token
    );

// Alias
export const fetchPlaylistItems = fetchPlaylistTracks;

// GET /shows/{id}
export const fetchShow = (token: string, showId: string) =>
    serverFetch(`shows/${showId}`, { market: 'from_token' }, token);

// GET /episodes/{id}
export const fetchEpisode = (token: string, episodeId: string) =>
    serverFetch(`episodes/${episodeId}`, { market: 'from_token' }, token);

// GET /browse/featured-playlists
export const fetchFeaturedPlaylists = (token: string) =>
    serverFetch('browse/featured-playlists', { limit: '10' }, token);

// GET /browse/new-releases
export const fetchNewReleases = (token: string) =>
    serverFetch('browse/new-releases', { limit: '10' }, token);

// Fetch pagination URLs (les URLs `next` Spotify retournent directement le bon format)
export const fetchPlaylistWithMarket = (token: string, url: string) =>
    spotifyFetch(url.includes('?') ? `${url}&market=from_token` : `${url}?market=from_token`, token);


// ─── Player ────────────────────────────────────────────────────────────────
export const fetchCurrentlyPlaying = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/currently-playing", token);

export const fetchPlaybackState = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player", token);

export const playerPlay = (token: string, body?: any) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/play", token, {
        method: "PUT",
        body: body ? JSON.stringify(body) : undefined
    });

export const playerPause = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/pause", token, { method: "PUT" });

export const playerNext = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/next", token, { method: "POST" });

export const playerPrevious = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/previous", token, { method: "POST" });

export const playerSeek = (token: string, positionMs: number) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.round(positionMs)}`, token, { method: "PUT" });

export const playerVolume = (token: string, volumePercent: number) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(volumePercent)}`, token, { method: "PUT" });

export const playerShuffle = (token: string, state: boolean) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/shuffle?state=${state}`, token, { method: "PUT" });

export const playerRepeat = (token: string, state: 'off' | 'context' | 'track') =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/repeat?state=${state}`, token, { method: "PUT" });

export const fetchQueue = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/queue", token);

export const fetchDevices = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/devices", token);

export const transferPlayback = (token: string, deviceId: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player", token, {
        method: "PUT",
        body: JSON.stringify({ device_ids: [deviceId], play: true })
    });

// ─── Tracks ────────────────────────────────────────────────────────────────
export const fetchTrack = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/tracks/${trackId}`, token);

// Note: /audio-features/{id} est encore supporté mais deprecated depuis nov 2024
// Il retourne encore les données pour les apps existantes
export const fetchAudioFeatures = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/audio-features/${trackId}`, token);

export const fetchRecentlyPlayed = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/player/recently-played?limit=20", token);

export const fetchTopArtists = (token: string) =>
    spotifyFetch("https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term", token);

// ─── Deezer API (GRATUIT, SANS CLÉ) ───────────────────────────────────────
// Appelle le proxy Deezer du backend (qui cache 5min et gère les CORS).
// Aucune clé, aucune auth requise. Parfait pour les endpoints 403 Spotify.
const deezerFetch = async (path: string): Promise<any> => {
    const url = `${SERVER_BASE}/api/deezer/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`Deezer error: ${JSON.stringify(data.error)}`);
    return data;
};

// Artistes similaires via Deezer (résolution par nom → ID Deezer → /related)
export const fetchDeezerRelatedArtists = (artistName: string) =>
    deezerFetch(`by-name/${encodeURIComponent(artistName)}/related`);

// Top tracks Deezer via nom d'artiste (format différent de Spotify)
export const fetchDeezerTopTracks = (artistName: string) =>
    deezerFetch(`by-name/${encodeURIComponent(artistName)}/top`);

// Normalise les artistes similaires Deezer → format compatible avec Spotify
export const normalizeDeezerRelatedArtists = (deezerData: any) => {
    const artists = deezerData?.data || [];
    return artists.map((a: any) => ({
        id: `deezer_${a.id}`,  // préfixe pour différencier des IDs Spotify
        name: a.name,
        images: [
            { url: a.picture_xl || a.picture_big || a.picture_medium, height: 640, width: 640 },
            { url: a.picture_big || a.picture_medium, height: 300, width: 300 },
            { url: a.picture_medium || a.picture_small, height: 64, width: 64 },
        ],
        followers: { total: a.nb_fan || 0 },
        genres: [],
        popularity: 0,
        _source: 'deezer',  // tag pour savoir d'où viennent les données
    }));
};

// Normalise les top tracks Deezer → format compatible avec Spotify
export const normalizeDeezerTracks = (deezerData: any) => {
    const tracks = deezerData?.data || [];
    return tracks.map((t: any) => ({
        id: `deezer_${t.id}`,
        name: t.title_short || t.title,
        duration_ms: (t.duration || 0) * 1000,
        preview_url: t.preview,  // URL de prévisualisation 30s gratuite !
        artists: t.contributors?.map((c: any) => ({ id: `deezer_${c.id}`, name: c.name })) || [t.artist],
        album: {
            id: `deezer_${t.album?.id}`,
            name: t.album?.title,
            images: [
                { url: t.album?.cover_xl || t.album?.cover_big, height: 640, width: 640 },
                { url: t.album?.cover_medium, height: 300, width: 300 },
            ]
        },
        explicit: t.explicit_lyrics || false,
        uri: null,   // Pas de Spotify URI → on ne peut pas jouer via Spotify
        _source: 'deezer',
        _deezerLink: t.link,
    }));
};

// ─── Artists ───────────────────────────────────────────────────────────────
// Artiste (métadonnées) : données publiques → proxy CC (cache 2min)
export const fetchArtist = (_token: string, artistId: string) =>
    serverFetch(`artists/${artistId}`);

// top-tracks : essaie Spotify (user token), fallback sur Deezer si 403
export const fetchArtistTopTracks = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=from_token`, token);

// Albums : données publiques → proxy CC
export const fetchArtistAlbums = (_token: string, artistId: string) =>
    serverFetch(`artists/${artistId}/albums`, { include_groups: 'album,single', limit: '10' });

// related-artists : essaie Spotify (user token), fallback sur Deezer si 403
// ⚠️ Appelé via ArtistDetail qui gère le catch et bascule sur Deezer
export const fetchRelatedArtists = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, token);

// Albums : données publiques → proxy CC (cache 2min)
export const fetchAlbum = (_token: string, albumId: string) =>
    serverFetch(`albums/${albumId}`);

// ─── Lyrics (API non officielle Spotify) ──────────────────────────────────
export const fetchLyrics = (token: string, trackId: string) =>
    spotifyFetch(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&vocalRemoval=false`, token, {
        headers: { "App-Platform": "WebPlayer" }
    });

// ─── Saved Tracks API ──────────────────────────────────────────────────────
export const getSavedTracks = (token: string, limit: number = 20, offset: number = 0) =>
    spotifyFetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, token);

// fetchLikedSongs : normalise en format playlist pour PlaylistDetail
export const fetchLikedSongs = async (token: string, limit: number = 50, offset: number = 0) => {
    const data = await getSavedTracks(token, limit, offset);
    return {
        name: "Titres likés",
        description: "Tous les titres que vous avez aimés",
        images: [{ url: "https://t.scdn.co/images/3099b380355140d7ae291cf2894343fb.png" }],
        owner: { display_name: "Vous" },
        followers: { total: 0 },
        // Les saved tracks n'ont pas de wrapper item/track → on crée un format unifié
        tracks: {
            items: (data.items || []).map((item: any) => ({
                ...item,
                // Les saved tracks retournent item.track directement
                track: item.track,
            })),
            total: data.total,
            next: data.next
        },
        type: "playlist",
        id: "liked-songs"
    };
};

export const checkSavedTracks = (token: string, trackIds: string[]) =>
    spotifyFetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackIds.join(',')}`, token);

export const saveTrack = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, token, { method: "PUT" });

export const removeSavedTrack = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, token, { method: "DELETE" });

// ─── Follow API ────────────────────────────────────────────────────────────
export const checkFollowingArtist = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/following/contains?type=artist&ids=${artistId}`, token);

export const followArtist = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`, token, { method: "PUT" });

export const unfollowArtist = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`, token, { method: "DELETE" });
