/**
 * Spotify API — Tous les endpoints organisés
 * Toutes les fonctions passent par spotifyFetch (rate-limited + cached)
 */

import { spotifyFetch, extractId, invalidateCache } from '../api/client';

// ─── Auth ────────────────────────────────────────────────────────────────────

const authEndpoint = 'https://accounts.spotify.com/authorize';
const redirectUri = 'http://127.0.0.1:3001/callback';
const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() || '';

const scopes = [
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-read-playback-state',
    'user-top-read',
    'user-modify-playback-state',
    'user-library-read',
    'user-library-modify',
    'user-follow-read',
    'user-follow-modify',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'streaming',
    'user-read-private',
];

export const loginUrl = `${authEndpoint}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}&response_type=code&show_dialog=true`;

// ─── Profile ─────────────────────────────────────────────────────────────────

export const fetchProfile = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me', token);

// ─── Player ──────────────────────────────────────────────────────────────────

export const fetchPlaybackState = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player', token);

export const fetchCurrentlyPlaying = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/currently-playing', token);

export const playerPlay = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/play', token, { method: 'PUT' });

export const playerPause = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/pause', token, { method: 'PUT' });

export const playerNext = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/next', token, { method: 'POST' });

export const playerPrevious = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/previous', token, { method: 'POST' });

export const playerSeek = (token: string, positionMs: number) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.round(positionMs)}`, token, { method: 'PUT' });

export const playerVolume = (token: string, volumePercent: number) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(volumePercent)}`, token, { method: 'PUT' });

export const playerShuffle = (token: string, state: boolean) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/shuffle?state=${state}`, token, { method: 'PUT' });

export const playerRepeat = (token: string, state: 'off' | 'context' | 'track') =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/repeat?state=${state}`, token, { method: 'PUT' });

export const fetchQueue = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/queue', token);

export const addToQueue = (token: string, uri: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, token, { method: 'POST' });

export const fetchDevices = (token: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/devices', token);

export const transferPlayback = (token: string, deviceId: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: true }),
    });

export const playContext = (token: string, contextUri: string) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/play', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_uri: contextUri }),
    });

export const playTracks = (token: string, trackUris: string[], offset?: number) =>
    spotifyFetch('https://api.spotify.com/v1/me/player/play', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            uris: trackUris,
            ...(offset !== undefined && { offset: { position: offset } }),
        }),
    });

// ─── Tracks ──────────────────────────────────────────────────────────────────

export const fetchTrack = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/tracks/${trackId}`, token);

export const fetchAudioFeatures = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/audio-features/${trackId}`, token);

export const fetchRecentlyPlayed = (token: string, limit = 20) =>
    spotifyFetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, token);

// ─── Saved Tracks (Library) ──────────────────────────────────────────────────

export const getSavedTracks = (token: string, limit = 20, offset = 0) =>
    spotifyFetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, token);

export const checkSavedTracks = (token: string, trackIds: string[]) => {
    if (!trackIds.length) return Promise.resolve([]);
    return spotifyFetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackIds.join(',')}`, token);
};

export const saveTrack = (token: string, trackId: string) => {
    invalidateCache('savedTracksCheck');
    return spotifyFetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, token, { method: 'PUT' });
};

export const removeSavedTrack = (token: string, trackId: string) => {
    invalidateCache('savedTracksCheck');
    return spotifyFetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, token, { method: 'DELETE' });
};

// ─── Artists ─────────────────────────────────────────────────────────────────

export const fetchArtist = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/artists/${artistId}`, token);

export const fetchArtistTopTracks = (token: string, artistId: string, market = 'FR') => {
    const params = new URLSearchParams({ market });
    return spotifyFetch(`https://api.spotify.com/v1/artists/${artistId.trim()}/top-tracks?${params.toString()}`, token);
};

export const fetchArtistAlbums = (token: string, artistId: string, limit = 20) => {
    // S'assurer que limit est un nombre entre 1 et 50
    const safeLimit = Math.max(1, Math.min(50, limit));
    const params = new URLSearchParams();
    params.append('include_groups', 'album,single');
    params.append('limit', safeLimit.toString());
    params.append('market', 'FR');

    return spotifyFetch(`https://api.spotify.com/v1/artists/${artistId}/albums?${params.toString()}`, token);
};

export const fetchRelatedArtists = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/artists/${artistId.trim()}/related-artists`, token);

export const fetchTopArtists = (token: string, timeRange = 'short_term', limit = 20) =>
    spotifyFetch(`https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`, token);

export const fetchTopTracks = (token: string, timeRange = 'short_term', limit = 20) =>
    spotifyFetch(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`, token);

// ─── Follow ──────────────────────────────────────────────────────────────────

export const checkFollowingArtist = (token: string, artistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/me/following/contains?type=artist&ids=${artistId}`, token);

export const followArtist = (token: string, artistId: string) => {
    invalidateCache('followCheck');
    return spotifyFetch(`https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`, token, { method: 'PUT' });
};

export const unfollowArtist = (token: string, artistId: string) => {
    invalidateCache('followCheck');
    return spotifyFetch(`https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`, token, { method: 'DELETE' });
};

// ─── Albums ──────────────────────────────────────────────────────────────────

export const fetchAlbum = (token: string, albumId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/albums/${albumId}`, token);

// ─── Playlists ───────────────────────────────────────────────────────────────

export const fetchPlaylists = (token: string, limit = 50, offset = 0) =>
    spotifyFetch(`https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`, token);

export const fetchPlaylist = (token: string, playlistId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/playlists/${extractId(playlistId)}`, token);

export const fetchPlaylistTracks = async (token: string, playlistId: string) => {
    const allTracks: any[] = [];
    let offset = 0;
    const limit = 50; // Baissé à 50 pour être plus safe
    const cleanId = extractId(playlistId);

    try {
        while (true) {
            const params = new URLSearchParams({
                limit: String(limit),
                offset: String(offset)
            });
            const data = await spotifyFetch(
                `https://api.spotify.com/v1/playlists/${cleanId}/tracks?${params.toString()}`,
                token
            );
            if (!data || !data.items) break;
            allTracks.push(...data.items);
            if (data.items.length < limit) break;
            offset += limit;
            if (offset >= 1000) break;
        }
    } catch (e) {
        console.warn('[Playlist] Error loading tracks:', e);
    }

    return { items: allTracks, total: allTracks.length };
};

// ─── Browse ──────────────────────────────────────────────────────────────────

export const fetchCategories = (token: string, limit = 50) => {
    const params = new URLSearchParams({
        locale: 'fr_FR',
        country: 'FR',
        limit: String(limit)
    });
    return spotifyFetch(`https://api.spotify.com/v1/browse/categories?${params.toString()}`, token);
};

export const fetchCategoryPlaylists = (token: string, categoryId: string, limit = 20) => {
    const params = new URLSearchParams({
        country: 'FR',
        limit: String(limit)
    });
    return spotifyFetch(`https://api.spotify.com/v1/browse/categories/${categoryId}/playlists?${params.toString()}`, token);
};

export const fetchFeaturedPlaylists = (token: string, limit = 20) => {
    const params = new URLSearchParams({
        locale: 'fr_FR',
        country: 'FR',
        limit: String(limit)
    });
    return spotifyFetch(`https://api.spotify.com/v1/browse/featured-playlists?${params.toString()}`, token);
};

export const fetchNewReleases = (token: string, limit = 20) => {
    const params = new URLSearchParams({
        country: 'FR',
        limit: String(limit)
    });
    return spotifyFetch(`https://api.spotify.com/v1/browse/new-releases?${params.toString()}`, token);
};

// ─── Recommendations ────────────────────────────────────────────────────────

export const fetchRecommendations = (
    token: string,
    options: {
        seedArtists?: string[];
        seedTracks?: string[];
        seedGenres?: string[];
        limit?: number;
    }
) => {
    const params = new URLSearchParams();
    if (options.seedArtists?.length) params.set('seed_artists', options.seedArtists.join(','));
    if (options.seedTracks?.length) params.set('seed_tracks', options.seedTracks.join(','));
    if (options.seedGenres?.length) params.set('seed_genres', options.seedGenres.join(','));
    params.set('limit', String(options.limit || 20));
    params.set('market', 'FR');
    return spotifyFetch(`https://api.spotify.com/v1/recommendations?${params.toString()}`, token);
};

// ─── Search ──────────────────────────────────────────────────────────────────

export const search = (
    token: string,
    query: string,
    types: string[] = ['track', 'artist', 'album', 'playlist'],
    limit = 20,
    offset = 0
) => {
    const params = new URLSearchParams({
        q: query,
        type: types.join(','),
        market: 'FR',
        limit: String(limit),
        offset: String(offset),
    });
    return spotifyFetch(`https://api.spotify.com/v1/search?${params.toString()}`, token);
};

// ─── Lyrics (non-officiel) ───────────────────────────────────────────────────

export const fetchLyrics = async (token: string, trackId: string) => {
    try {
        return await spotifyFetch(
            `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&vocalRemoval=false`,
            token,
            { headers: { 'App-Platform': 'WebPlayer' } }
        );
    } catch {
        return null;
    }
};
