/**
 * Zustand Store — Library (playlists, top artists, recently played)
 * 
 * Données partagées entre les pages pour éviter les re-fetch.
 */
import { create } from 'zustand';
import {
    fetchPlaylists,
    fetchTopArtists,
    fetchRecentlyPlayed,
} from '../services/spotify';

interface LibraryState {
    playlists: any[];
    topArtists: any[];
    recentByArtist: any[];
    isLoaded: boolean;
    isLoading: boolean;

    // Actions
    loadAll: (token: string) => Promise<void>;
    reset: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    playlists: [],
    topArtists: [],
    recentByArtist: [],
    isLoaded: false,
    isLoading: false,

    loadAll: async (token: string) => {
        const { isLoaded, isLoading } = get();
        if (isLoaded || isLoading) return;

        set({ isLoading: true });

        try {
            // Séquentiel pour éviter les rafales de requêtes
            const playlistsData = await fetchPlaylists(token);
            if (playlistsData) set({ playlists: playlistsData.items || [] });

            const artistsData = await fetchTopArtists(token);
            if (artistsData) set({ topArtists: artistsData.items || [] });

            const recentData = await fetchRecentlyPlayed(token);
            if (recentData) {
                const seen = new Set<string>();
                const deduped = (recentData.items || []).filter((item: any) => {
                    const key = `${item.track?.id}-${item.played_at}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                // Grouper par artiste
                const groupedMap: Record<string, any> = {};
                deduped.forEach((item: any) => {
                    const artistId = item.track?.artists?.[0]?.id;
                    if (!artistId) return;
                    if (!groupedMap[artistId]) {
                        groupedMap[artistId] = {
                            artist: item.track.artists[0],
                            tracks: [],
                            lastImg: item.track.album?.images?.[0]?.url,
                        };
                    }
                    if (groupedMap[artistId].tracks.length < 5) {
                        groupedMap[artistId].tracks.push(item.track);
                    }
                });
                set({ recentByArtist: Object.values(groupedMap).slice(0, 10) });
            }

            set({ isLoaded: true });
        } catch (err) {
            console.error('Library load error:', err);
        } finally {
            set({ isLoading: false });
        }
    },

    reset: () => set({
        playlists: [],
        topArtists: [],
        recentByArtist: [],
        isLoaded: false,
        isLoading: false,
    }),
}));
