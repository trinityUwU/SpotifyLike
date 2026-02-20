/**
 * LikeBatcher — Batch les vérifications de "liked" pour réduire les appels API
 * Utilise le nouveau service spotify.ts (qui passe par spotifyFetch)
 */
import { checkSavedTracks } from './spotify';

type BatchItem = {
    trackId: string;
    resolve: (value: boolean) => void;
    reject: (reason?: any) => void;
};

class LikeBatcher {
    private queue: BatchItem[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private token: string | null = null;

    setToken(token: string) {
        this.token = token;
    }

    async check(trackId: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.queue.push({ trackId, resolve, reject });
            this.schedule();
        });
    }

    private schedule() {
        if (this.timer) return;
        this.timer = setTimeout(() => this.flush(), 150);
    }

    private async flush() {
        this.timer = null;
        if (this.queue.length === 0 || !this.token) return;

        const currentBatch = [...this.queue];
        this.queue = [];

        const uniqueIds = Array.from(new Set(currentBatch.map(item => item.trackId)));

        try {
            const chunks: string[][] = [];
            for (let i = 0; i < uniqueIds.length; i += 50) {
                chunks.push(uniqueIds.slice(i, i + 50));
            }

            const resultsMap: Record<string, boolean> = {};

            for (const chunk of chunks) {
                try {
                    const results = await checkSavedTracks(this.token!, chunk);
                    if (results && Array.isArray(results)) {
                        chunk.forEach((id, idx) => {
                            resultsMap[id] = results[idx] ?? false;
                        });
                    } else {
                        chunk.forEach((id) => { resultsMap[id] = false; });
                    }
                } catch {
                    chunk.forEach((id) => { resultsMap[id] = false; });
                }
            }

            currentBatch.forEach(item => {
                item.resolve(resultsMap[item.trackId] ?? false);
            });
        } catch {
            currentBatch.forEach(item => item.resolve(false));
        }
    }
}

export const likeBatcher = new LikeBatcher();
