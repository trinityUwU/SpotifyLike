/**
 * Cache IndexedDB — Stockage local persistant SANS serveur
 * Remplace l'ancien système SQLite via Express
 */
import { get, set, del, keys, clear } from 'idb-keyval';

interface CacheEntry<T = any> {
    data: T;
    expiresAt: number;
    createdAt: number;
}

const PREFIX = 'spc_'; // spotify cache prefix

const buildKey = (resourceType: string, resourceId: string): string =>
    `${PREFIX}${resourceType}:${resourceId}`;

/**
 * Récupère une valeur du cache IndexedDB
 */
export const cacheGet = async <T = any>(resourceType: string, resourceId: string): Promise<T | null> => {
    try {
        const key = buildKey(resourceType, resourceId);
        const entry = await get<CacheEntry<T>>(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            // Expiré → suppression async (non-bloquante)
            del(key).catch(() => { });
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
};

/**
 * Enregistre une valeur dans le cache IndexedDB
 */
export const cacheSet = async <T = any>(
    resourceType: string,
    resourceId: string,
    data: T,
    ttlMs: number
): Promise<void> => {
    try {
        const key = buildKey(resourceType, resourceId);
        const entry: CacheEntry<T> = {
            data,
            expiresAt: Date.now() + ttlMs,
            createdAt: Date.now(),
        };
        await set(key, entry);
    } catch (err) {
        console.warn('[Cache] Write error:', err);
    }
};

/**
 * Supprime une entrée du cache
 */
export const cacheDel = async (resourceType: string, resourceId: string): Promise<void> => {
    try {
        await del(buildKey(resourceType, resourceId));
    } catch { }
};

/**
 * Invalide tout le cache d'un type de ressource
 */
export const cacheInvalidateType = async (resourceType: string): Promise<number> => {
    try {
        const allKeys = await keys();
        const prefix = `${PREFIX}${resourceType}:`;
        const toDelete = (allKeys as string[]).filter(k => typeof k === 'string' && k.startsWith(prefix));
        await Promise.all(toDelete.map(k => del(k)));
        return toDelete.length;
    } catch {
        return 0;
    }
};

/**
 * Nettoie toutes les entrées expirées
 */
export const cacheCleanExpired = async (): Promise<number> => {
    try {
        const allKeys = await keys();
        const now = Date.now();
        let count = 0;
        for (const key of allKeys) {
            if (typeof key !== 'string' || !key.startsWith(PREFIX)) continue;
            const entry = await get<CacheEntry>(key);
            if (entry && now > entry.expiresAt) {
                await del(key);
                count++;
            }
        }
        return count;
    } catch {
        return 0;
    }
};

/**
 * Vide tout le cache Spotify
 */
export const cacheClearAll = async (): Promise<void> => {
    try {
        const allKeys = await keys();
        const spotifyKeys = (allKeys as string[]).filter(k => typeof k === 'string' && k.startsWith(PREFIX));
        await Promise.all(spotifyKeys.map(k => del(k)));
    } catch { }
};

/**
 * Stats du cache
 */
export const cacheStats = async (): Promise<{ total: number; valid: number; expired: number }> => {
    try {
        const allKeys = await keys();
        const spotifyKeys = (allKeys as string[]).filter(k => typeof k === 'string' && k.startsWith(PREFIX));
        const now = Date.now();
        let valid = 0;
        let expired = 0;
        for (const key of spotifyKeys) {
            const entry = await get<CacheEntry>(key);
            if (entry) {
                if (now > entry.expiresAt) expired++;
                else valid++;
            }
        }
        return { total: spotifyKeys.length, valid, expired };
    } catch {
        return { total: 0, valid: 0, expired: 0 };
    }
};

// Nettoyage automatique toutes les 15 minutes
setInterval(() => {
    cacheCleanExpired().then(n => {
        if (n > 0) console.log(`[Cache] Cleaned ${n} expired entries`);
    });
}, 15 * 60 * 1000);
