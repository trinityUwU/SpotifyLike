import { setCurrentUserId } from './spotify';

const CACHE_SERVER = 'http://127.0.0.1:3001';

// ─── Fonctions de gestion du cache ───

/**
 * Nettoie tout le cache d'un utilisateur
 */
export const clearUserCache = async (userId: string) => {
    try {
        const res = await fetch(`${CACHE_SERVER}/cache/${userId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        console.log(`🗑️ Cache nettoyé pour ${userId}: ${data.deletedCount} entrées supprimées`);
        return data.deletedCount;
    } catch (err) {
        console.error('Erreur lors du nettoyage du cache:', err);
        return 0;
    }
};

/**
 * Nettoie un type de ressource spécifique
 */
export const clearResourceCache = async (userId: string, resourceType: string) => {
    try {
        const res = await fetch(`${CACHE_SERVER}/cache/${userId}/${resourceType}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        console.log(`🗑️ Cache ${resourceType} nettoyé: ${data.deletedCount} entrées`);
        return data.deletedCount;
    } catch (err) {
        console.error('Erreur lors du nettoyage du cache:', err);
        return 0;
    }
};

/**
 * Récupère les statistiques du cache
 */
export const getCacheStats = async (userId: string) => {
    try {
        const res = await fetch(`${CACHE_SERVER}/cache-stats/${userId}`);
        const data = await res.json();
        return data.stats;
    } catch (err) {
        console.error('Erreur lors de la récupération des stats:', err);
        return { total: 0, valid: 0, expired: 0 };
    }
};

/**
 * Force le nettoyage des caches expirés sur le serveur
 */
export const cleanExpiredCaches = async () => {
    try {
        const res = await fetch(`${CACHE_SERVER}/cache-clean`, {
            method: 'POST'
        });
        const data = await res.json();
        console.log(`🧹 ${data.deletedCount} caches expirés nettoyés`);
        return data.deletedCount;
    } catch (err) {
        console.error('Erreur lors du nettoyage:', err);
        return 0;
    }
};

export { setCurrentUserId };
