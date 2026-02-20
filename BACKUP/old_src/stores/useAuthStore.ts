/**
 * Zustand Store — Auth (token, profile, session)
 */
import { create } from 'zustand';
import { fetchProfile } from '../services/spotify';

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    profile: any | null;
    expiresAt: number | null;

    setToken: (token: string) => void;
    setRefreshToken: (refreshToken: string) => void;
    setProfile: (profile: any) => void;
    loadProfile: () => Promise<void>;
    clearSession: () => void;
    initFromStorage: () => Promise<void>;
    refreshAccessToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    token: null,
    refreshToken: null,
    profile: null,
    expiresAt: null,

    setToken: (token) => {
        set({ token });
        localStorage.setItem('spotify_token', token);
    },

    setRefreshToken: (refreshToken) => {
        set({ refreshToken });
        localStorage.setItem('spotify_refresh_token', refreshToken);
    },

    setProfile: (profile) => set({ profile }),

    loadProfile: async () => {
        const { token } = get();
        if (!token) return;
        const data = await fetchProfile(token);
        if (data) {
            set({ profile: data });
        }
    },

    clearSession: () => {
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_expires_at');
        set({ token: null, refreshToken: null, profile: null, expiresAt: null });
    },

    initFromStorage: async () => {
        const isValidToken = (t: string) => t.length > 50 && !(/^[0-9a-f]{32}$/i.test(t));

        const localToken = localStorage.getItem('spotify_token');
        const localRefresh = localStorage.getItem('spotify_refresh_token');
        const localExpires = localStorage.getItem('spotify_expires_at');

        if (!localToken || !isValidToken(localToken)) {
            get().clearSession();
            return;
        }

        const expiresAt = localExpires ? parseInt(localExpires) : 0;

        if (expiresAt && Date.now() > expiresAt) {
            // Token expiré — refresh
            if (localRefresh) {
                set({ refreshToken: localRefresh });
                await get().refreshAccessToken();
            } else {
                get().clearSession();
            }
        } else {
            set({
                token: localToken,
                refreshToken: localRefresh,
                expiresAt
            });
        }
    },

    refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
            get().clearSession();
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:3001/refresh-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            const data = await response.json();

            if (data.error) {
                get().clearSession();
                return;
            }

            if (data.access_token) {
                const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
                set({ token: data.access_token, expiresAt });
                localStorage.setItem('spotify_token', data.access_token);
                localStorage.setItem('spotify_expires_at', String(expiresAt));
                if (data.refresh_token) {
                    set({ refreshToken: data.refresh_token });
                    localStorage.setItem('spotify_refresh_token', data.refresh_token);
                }
            }
        } catch (error) {
            console.error('Token refresh error:', error);
        }
    },
}));

// Timer de refresh automatique du token (toutes les 60s)
setInterval(() => {
    const { expiresAt, refreshToken, refreshAccessToken, clearSession } = useAuthStore.getState();
    if (expiresAt && Date.now() > expiresAt - 60000) {
        if (refreshToken) {
            refreshAccessToken();
        } else {
            clearSession();
        }
    }
}, 60000);
