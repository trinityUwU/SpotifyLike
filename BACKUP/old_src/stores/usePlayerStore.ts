/**
 * Zustand Store — Player (playback state, progress, queue)
 * 
 * Le polling est réduit à 30s au lieu de 5s.
 * La progression locale est simulée en JS entre les polls.
 */
import { create } from 'zustand';
import {
    fetchPlaybackState,
    playerPlay,
    playerPause,
    playerNext,
    playerPrevious,
    playerSeek,
    playerVolume,
    playerShuffle,
    playerRepeat,
    saveTrack,
    removeSavedTrack,
} from '../services/spotify';

interface PlayerState {
    playbackState: any | null;
    progressMs: number;
    volume: number;
    isSeeking: boolean;
    isSaved: boolean;

    // Actions
    fetchState: (token: string) => Promise<void>;
    handlePlayPause: (token: string) => Promise<void>;
    handleNext: (token: string) => Promise<void>;
    handlePrevious: (token: string) => Promise<void>;
    handleSeek: (token: string, positionMs: number) => Promise<void>;
    handleVolume: (token: string, vol: number) => Promise<void>;
    handleShuffle: (token: string) => Promise<void>;
    handleRepeat: (token: string) => Promise<void>;
    handleLike: (token: string) => Promise<void>;
    setProgressMs: (ms: number) => void;
    setIsSeeking: (seeking: boolean) => void;
    setIsSaved: (saved: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    playbackState: null,
    progressMs: 0,
    volume: 50,
    isSeeking: false,
    isSaved: false,

    fetchState: async (token) => {
        const state = await fetchPlaybackState(token);
        if (!state) return;
        const { isSeeking } = get();
        set({
            playbackState: state,
            volume: state.device?.volume_percent ?? 50,
            ...(isSeeking ? {} : { progressMs: state.progress_ms ?? 0 }),
        });
    },

    handlePlayPause: async (token) => {
        const { playbackState, fetchState } = get();
        if (playbackState?.is_playing) await playerPause(token);
        else await playerPlay(token);
        setTimeout(() => fetchState(token), 300);
    },

    handleNext: async (token) => {
        await playerNext(token);
        setTimeout(() => get().fetchState(token), 500);
    },

    handlePrevious: async (token) => {
        await playerPrevious(token);
        setTimeout(() => get().fetchState(token), 500);
    },

    handleSeek: async (token, positionMs) => {
        set({ progressMs: positionMs, isSeeking: false });
        await playerSeek(token, positionMs);
        setTimeout(() => get().fetchState(token), 300);
    },

    handleVolume: async (token, vol) => {
        set({ volume: vol });
        await playerVolume(token, vol);
    },

    handleShuffle: async (token) => {
        const { playbackState, fetchState } = get();
        await playerShuffle(token, !playbackState?.shuffle_state);
        setTimeout(() => fetchState(token), 300);
    },

    handleRepeat: async (token) => {
        const { playbackState, fetchState } = get();
        const states: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track'];
        const current = playbackState?.repeat_state ?? 'off';
        const next = states[(states.indexOf(current) + 1) % states.length];
        await playerRepeat(token, next);
        setTimeout(() => fetchState(token), 300);
    },

    handleLike: async (token) => {
        const { playbackState, isSaved } = get();
        if (!playbackState?.item?.id) return;
        try {
            if (isSaved) {
                await removeSavedTrack(token, playbackState.item.id);
            } else {
                await saveTrack(token, playbackState.item.id);
            }
            set({ isSaved: !isSaved });
        } catch (e) {
            console.error('Like error:', e);
        }
    },

    setProgressMs: (ms) => set({ progressMs: ms }),
    setIsSeeking: (seeking) => set({ isSeeking: seeking }),
    setIsSaved: (saved) => set({ isSaved: saved }),
}));
