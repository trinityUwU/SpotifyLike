import { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { saveTrack, removeSavedTrack } from '../services/spotify';
import { likeBatcher } from '../services/likeBatcher';

interface LikeButtonProps {
    trackId: string;
    token: string;
    size?: number;
}

export const LikeButton = ({ trackId, token, size = 16 }: LikeButtonProps) => {
    const [isSaved, setIsSaved] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!token || !trackId) return;

        let mounted = true;
        likeBatcher.setToken(token);
        likeBatcher.check(trackId).then(saved => {
            if (mounted) setIsSaved(saved);
        });

        return () => { mounted = false; };
    }, [trackId, token]);

    const handleToggle = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (loading || !token || !trackId) return;

        setLoading(true);
        try {
            if (isSaved) {
                await removeSavedTrack(token, trackId);
                setIsSaved(false);
            } else {
                await saveTrack(token, trackId);
                setIsSaved(true);
            }
        } catch (err) {
            console.error('Like toggle error:', err);
        } finally {
            setLoading(false);
        }
    }, [isSaved, loading, token, trackId]);

    return (
        <button
            className={`like-button ${isSaved ? 'like-button--saved' : ''}`}
            onClick={handleToggle}
            disabled={loading}
            style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.2s',
            }}
        >
            <Heart
                size={size}
                fill={isSaved ? '#1db954' : 'none'}
                color={isSaved ? '#1db954' : '#a7a7a7'}
                style={{
                    transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    transform: isSaved ? 'scale(1.1)' : 'scale(1)'
                }}
            />
        </button>
    );
};
