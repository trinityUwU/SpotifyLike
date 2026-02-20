/**
 * ActivityPage — Utilise le store partagé + format amélioré
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, TrendingUp, Play } from 'lucide-react';
import { fetchRecentlyPlayed, playTracks } from '../services/spotify';

export const ActivityPage = ({
    token,
    onNavigateArtist,
}: {
    token: string;
    onNavigateArtist?: (id: string) => void;
}) => {
    const [recentTracks, setRecentTracks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        fetchRecentlyPlayed(token, 50).then(data => {
            if (data) setRecentTracks(data.items || []);
            setLoading(false);
        });
    }, [token]);

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays === 1) return 'Hier';
        return `Il y a ${diffDays} jours`;
    };

    if (loading) {
        return (
            <div className="activity-page">
                <h1 className="page-title"><Activity size={28} style={{ marginRight: 12 }} /> Activité</h1>
                <div className="track-list">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="track-row" style={{ opacity: 0.4 }}>
                            <div className="skeleton-pulse" style={{ width: 48, height: 48, borderRadius: 4 }} />
                            <div style={{ flex: 1, marginLeft: 12 }}>
                                <div className="skeleton-pulse" style={{ width: '60%', height: 14, borderRadius: 4 }} />
                                <div className="skeleton-pulse" style={{ width: '40%', height: 12, borderRadius: 4, marginTop: 6 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="activity-page">
            <div className="page-header">
                <Activity size={36} color="#1db954" />
                <div>
                    <h1 className="page-title" style={{ marginBottom: 4 }}>Activité</h1>
                    <p className="text-subdued">Votre historique d'écoute récent</p>
                </div>
            </div>

            {recentTracks.length > 0 ? (
                <div className="track-list">
                    <div className="track-list-header">
                        <TrendingUp size={18} color="#1db954" />
                        <h2 className="section-title">Récemment écouté</h2>
                    </div>
                    {recentTracks.map((item: any, index: number) => (
                        <motion.div
                            key={`${item.track?.id}-${item.played_at}-${index}`}
                            className="track-row"
                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                        >
                            <img
                                src={item.track?.album?.images?.[2]?.url || item.track?.album?.images?.[0]?.url}
                                alt=""
                                className="track-row__cover"
                            />
                            <div className="track-row__info" onClick={() => onNavigateArtist?.(item.track?.artists?.[0]?.id)}>
                                <div className="track-row__name">{item.track?.name}</div>
                                <div className="track-row__artist">
                                    {item.track?.artists?.map((a: any) => a.name).join(', ')}
                                </div>
                            </div>
                            <span className="track-row__album">{item.track?.album?.name}</span>
                            <div className="track-row__time">
                                <Clock size={12} />
                                {formatTime(item.played_at)}
                            </div>
                            <motion.button
                                className="track-row__play"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => playTracks(token, [item.track?.uri])}
                            >
                                <Play fill="white" size={14} />
                            </motion.button>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="search-empty">
                    <Activity size={48} color="#a7a7a7" />
                    <p>Aucune activité récente</p>
                </div>
            )}
        </div>
    );
};
