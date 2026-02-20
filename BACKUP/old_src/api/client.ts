/**
 * Spotify API Client — Rate-limited, cached, retryable
 * 
 * Toutes les requêtes passent par ici. Aucun fetch() direct n'est autorisé.
 * 
 * Architecture :
 * 1. Memory cache (instantané)
 * 2. IndexedDB cache (< 5ms)
 * 3. Queue de requêtes avec throttling
 * 4. Exponential backoff sur 429
 * 5. Déduplication des requêtes en vol
 */

import { cacheGet, cacheSet } from '../cache/indexedDB';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestOptions extends RequestInit {
    headers?: Record<string, string>;
}

interface CacheConfig {
    type: string;
    id: string;
    ttl: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const MIN_DELAY_BETWEEN_REQUESTS = 600;  // 600ms entre chaque requête
const MAX_CONCURRENT = 1;                // 1 requête à la fois (séquentiel)
const INITIAL_BACKOFF = 3000;            // 3s après un 429
const MAX_BACKOFF = 120000;              // 2min max
const BACKOFF_MULTIPLIER = 2;

// ─── TTLs par type de ressource ──────────────────────────────────────────────

export const TTL = {
    // Profil utilisateur
    profile: 3600000,              // 1h

    // Playlists
    playlists: 300000,             // 5 min
    playlist: 600000,              // 10 min
    playlistTracks: 600000,        // 10 min

    // Artistes
    artist: 86400000,              // 24h
    topArtists: 600000,            // 10 min
    artistTopTracks: 3600000,      // 1h
    artistAlbums: 3600000,         // 1h
    relatedArtists: 86400000,      // 24h

    // Albums
    album: 86400000,               // 24h

    // Tracks
    track: 86400000,               // 24h
    audioFeatures: 86400000,       // 24h
    lyrics: 604800000,             // 7j

    // Historique & activité
    recent: 120000,                // 2 min
    playback: 5000,                // 5s (mémoire uniquement)
    queue: 10000,                  // 10s
    devices: 15000,                // 15s

    // Bibliothèque
    savedTracks: 300000,           // 5 min
    savedTracksCheck: 120000,      // 2 min
    followCheck: 120000,           // 2 min

    // Browse
    categories: 3600000,           // 1h
    categoryPlaylists: 1800000,    // 30 min
    featuredPlaylists: 1800000,    // 30 min
    newReleases: 1800000,          // 30 min
    recommendations: 600000,       // 10 min

    // Search
    search: 300000,                // 5 min

    // Followed artists
    followedArtists: 600000,       // 10 min
} as const;

// ─── State interne ───────────────────────────────────────────────────────────

const memoryCache = new Map<string, { data: any; expiresAt: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const requestQueue: Array<{
    execute: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}> = [];
let isProcessingQueue = false;
let globalCooldown = false;
let currentBackoff = INITIAL_BACKOFF;

// ─── Memory Cache ────────────────────────────────────────────────────────────

const memCacheGet = (key: string): any | null => {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
};

const memCacheSet = (key: string, data: any, ttlMs: number): void => {
    memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
    // Nettoyage si le cache mémoire devient trop gros
    if (memoryCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of memoryCache) {
            if (now > v.expiresAt) memoryCache.delete(k);
        }
    }
};

// ─── URL → Cache Key mapping ─────────────────────────────────────────────────

export const getResourceInfo = (url: string): CacheConfig | null => {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const params = urlObj.searchParams;

        // Profile
        if (path === '/v1/me' && !params.toString()) return { type: 'profile', id: 'me', ttl: TTL.profile };

        // Playlists
        if (path === '/v1/me/playlists') return { type: 'playlists', id: `list-${params.get('limit') || 50}-${params.get('offset') || 0}`, ttl: TTL.playlists };

        // Top Artists / Tracks
        const topMatch = path.match(/^\/v1\/me\/top\/(artists|tracks)$/);
        if (topMatch) return { type: 'topArtists', id: `${topMatch[1]}-${params.get('time_range') || 'short_term'}-${params.get('limit') || 20}`, ttl: TTL.topArtists };

        // Recently Played
        if (path === '/v1/me/player/recently-played') return { type: 'recent', id: `${params.get('limit') || 20}`, ttl: TTL.recent };

        // Playback
        if (path === '/v1/me/player' && !path.includes('/', 15)) return { type: 'playback', id: 'current', ttl: TTL.playback };
        if (path === '/v1/me/player/currently-playing') return { type: 'playback', id: 'current-track', ttl: TTL.playback };
        if (path === '/v1/me/player/queue') return { type: 'queue', id: 'current', ttl: TTL.queue };
        if (path === '/v1/me/player/devices') return { type: 'devices', id: 'all', ttl: TTL.devices };

        // Saved Tracks
        if (path === '/v1/me/tracks' && !params.get('ids')) return { type: 'savedTracks', id: `${params.get('limit')}-${params.get('offset')}`, ttl: TTL.savedTracks };
        if (path === '/v1/me/tracks/contains') return { type: 'savedTracksCheck', id: params.get('ids') || '', ttl: TTL.savedTracksCheck };

        // Follow
        if (path === '/v1/me/following/contains') return { type: 'followCheck', id: params.get('ids') || '', ttl: TTL.followCheck };
        if (path === '/v1/me/following') return { type: 'followedArtists', id: `${params.get('type')}-${params.get('limit') || 20}`, ttl: TTL.followedArtists };

        // Track
        const trackMatch = path.match(/^\/v1\/tracks\/([a-zA-Z0-9]+)$/);
        if (trackMatch) return { type: 'track', id: trackMatch[1], ttl: TTL.track };

        // Tracks batch
        if (path === '/v1/tracks' && params.get('ids')) return { type: 'track', id: `batch-${params.get('ids')}`, ttl: TTL.track };

        // Audio Features
        const featuresMatch = path.match(/^\/v1\/audio-features\/([a-zA-Z0-9]+)$/);
        if (featuresMatch) return { type: 'audioFeatures', id: featuresMatch[1], ttl: TTL.audioFeatures };

        // Artist
        const artistMatch = path.match(/^\/v1\/artists\/([a-zA-Z0-9]+)$/);
        if (artistMatch) return { type: 'artist', id: artistMatch[1], ttl: TTL.artist };

        // Artist Top Tracks
        const artistTopMatch = path.match(/^\/v1\/artists\/([a-zA-Z0-9]+)\/top-tracks$/);
        if (artistTopMatch) return { type: 'artistTopTracks', id: `${artistTopMatch[1]}-${params.get('market') || 'FR'}`, ttl: TTL.artistTopTracks };

        // Artist Albums
        const artistAlbumsMatch = path.match(/^\/v1\/artists\/([a-zA-Z0-9]+)\/albums$/);
        if (artistAlbumsMatch) return { type: 'artistAlbums', id: `${artistAlbumsMatch[1]}-${params.toString()}`, ttl: TTL.artistAlbums };

        // Related Artists
        const relatedMatch = path.match(/^\/v1\/artists\/([a-zA-Z0-9]+)\/related-artists$/);
        if (relatedMatch) return { type: 'relatedArtists', id: relatedMatch[1], ttl: TTL.relatedArtists };

        // Album
        const albumMatch = path.match(/^\/v1\/albums\/([a-zA-Z0-9]+)$/);
        if (albumMatch) return { type: 'album', id: albumMatch[1], ttl: TTL.album };

        // Playlist
        const playlistMatch = path.match(/^\/v1\/playlists\/([a-zA-Z0-9]+)$/);
        if (playlistMatch) return { type: 'playlist', id: playlistMatch[1], ttl: TTL.playlist };

        // Playlist Tracks
        const playlistTracksMatch = path.match(/^\/v1\/playlists\/([a-zA-Z0-9]+)\/tracks$/);
        if (playlistTracksMatch) return { type: 'playlistTracks', id: `${playlistTracksMatch[1]}-${params.toString()}`, ttl: TTL.playlistTracks };

        // Browse Categories
        if (path === '/v1/browse/categories') return { type: 'categories', id: `${params.get('locale') || 'default'}-${params.get('limit') || 20}`, ttl: TTL.categories };
        const catPlaylistsMatch = path.match(/^\/v1\/browse\/categories\/([^/]+)\/playlists$/);
        if (catPlaylistsMatch) return { type: 'categoryPlaylists', id: catPlaylistsMatch[1], ttl: TTL.categoryPlaylists };
        if (path === '/v1/browse/featured-playlists') return { type: 'featuredPlaylists', id: `${params.get('locale') || 'default'}`, ttl: TTL.featuredPlaylists };
        if (path === '/v1/browse/new-releases') return { type: 'newReleases', id: `${params.get('limit') || 20}`, ttl: TTL.newReleases };

        // Recommendations
        if (path === '/v1/recommendations') return { type: 'recommendations', id: `${params.toString()}`, ttl: TTL.recommendations };

        // Search
        if (path === '/v1/search') return { type: 'search', id: `${params.get('q')}-${params.get('type')}-${params.get('limit')}-${params.get('offset')}`, ttl: TTL.search };

        // Lyrics (non-officiel)
        const lyricsMatch = path.match(/\/color-lyrics\/v2\/track\/([a-zA-Z0-9]+)/);
        if (lyricsMatch) return { type: 'lyrics', id: lyricsMatch[1], ttl: TTL.lyrics };

        return null;
    } catch {
        return null;
    }
};

// ─── Queue Processing ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const processQueue = async () => {
    if (isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0) {
        // Pause globale si rate-limité
        while (globalCooldown) {
            await sleep(1000);
        }

        const item = requestQueue.shift();
        if (!item) continue;

        try {
            const result = await item.execute();
            item.resolve(result);
        } catch (err) {
            item.reject(err);
        }

        // Délai entre les requêtes
        if (requestQueue.length > 0) {
            await sleep(MIN_DELAY_BETWEEN_REQUESTS);
        }
    }

    isProcessingQueue = false;
};

// ─── Core fetch function ─────────────────────────────────────────────────────

export const spotifyFetch = async (
    url: string,
    token: string,
    options: RequestOptions = {}
): Promise<any> => {
    const isGet = !options.method || options.method === 'GET';
    const resourceInfo = getResourceInfo(url);
    const cacheKey = resourceInfo ? `${resourceInfo.type}:${resourceInfo.id}` : null;

    // 1. Déduplication des requêtes en vol (GET uniquement)
    if (isGet && pendingRequests.has(url)) {
        return pendingRequests.get(url);
    }

    // 2. Memory cache (instantané, < 1ms)
    if (isGet && cacheKey) {
        const memData = memCacheGet(cacheKey);
        if (memData !== null) return memData;
    }

    // 3. IndexedDB cache (< 5ms) — sauf pour playback/queue (trop dynamiques)
    if (isGet && resourceInfo && resourceInfo.ttl > 10000) {
        const idbData = await cacheGet(resourceInfo.type, resourceInfo.id);
        if (idbData !== null) {
            // Remplir le memory cache aussi
            memCacheSet(cacheKey!, idbData, resourceInfo.ttl);
            return idbData;
        }
    }

    // 4. Requête via la queue
    const executeRequest = async (): Promise<any> => {
        while (globalCooldown) {
            await sleep(1000);
        }

        try {
            const cleanToken = token.trim();
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${cleanToken}`,
                },
            });

            // Rate limited
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '5');
                const backoffTime = Math.max(retryAfter * 1000, currentBackoff);

                if (!globalCooldown) {
                    console.warn(`⚠️ Rate limited! Pausing for ${Math.round(backoffTime / 1000)}s`);
                    globalCooldown = true;
                    currentBackoff = Math.min(currentBackoff * BACKOFF_MULTIPLIER, MAX_BACKOFF);

                    setTimeout(() => {
                        globalCooldown = false;
                    }, backoffTime);
                }

                // Attendre puis réessayer
                await sleep(backoffTime + 500);
                return executeRequest();
            }

            // Succès → reset backoff
            currentBackoff = INITIAL_BACKOFF;

            if (res.status === 204 || res.status === 202) return true;

            if (!res.ok) {
                const errorText = await res.text().catch(() => '');
                if (res.status === 403) {
                    // Permission denied — silencieux pour contains/following
                    if (!url.includes('/contains') && !url.includes('/following')) {
                        console.warn(`⚠️ 403 Forbidden: ${url} | Info: ${errorText}`);
                    }
                    return null;
                }
                console.error(`❌ API Error (${res.status}) on ${url}:`, errorText);
                return null;
            }

            const data = await res.json();

            // 5. Écriture cache (async, non-bloquante)
            if (isGet && resourceInfo && cacheKey) {
                memCacheSet(cacheKey, data, resourceInfo.ttl);
                // IndexedDB seulement pour les données qui valent le coup (TTL > 10s)
                if (resourceInfo.ttl > 10000) {
                    cacheSet(resourceInfo.type, resourceInfo.id, data, resourceInfo.ttl).catch(() => { });
                }
            }

            return data;
        } catch (err) {
            console.error('❌ Network error:', err);
            return null;
        } finally {
            if (isGet) pendingRequests.delete(url);
        }
    };

    // Enqueue
    const promise = new Promise<any>((resolve, reject) => {
        requestQueue.push({ execute: executeRequest, resolve, reject });
        processQueue();
    });

    if (isGet) {
        pendingRequests.set(url, promise);
    }

    return promise;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const extractId = (uriOrId: string): string => {
    if (uriOrId.includes(':')) {
        const parts = uriOrId.split(':');
        return parts[parts.length - 1] || uriOrId;
    }
    return uriOrId;
};

/**
 * Invalide le cache pour un type de ressource donné
 */
export const invalidateCache = (type: string, id?: string) => {
    if (id) {
        const key = `${type}:${id}`;
        memoryCache.delete(key);
    } else {
        // Invalider tout le type en mémoire
        for (const k of memoryCache.keys()) {
            if (k.startsWith(`${type}:`)) memoryCache.delete(k);
        }
    }
};
