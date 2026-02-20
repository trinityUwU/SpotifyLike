/**
 * RadioPage — Radio personnalisée via GET /v1/recommendations
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Radio as RadioIcon, Play, RefreshCw, Sparkles } from 'lucide-react';
import { fetchRecommendations, playTracks } from '../services/spotify';
import { useLibraryStore } from '../stores/useLibraryStore';

export const RadioPage = ({
    token,
    onNavigateArtist,
}: {
    token: string;
    onNavigateArtist?: (id: string) => void;
}) => {
    const { topArtists } = useLibraryStore();
    const [stations, setStations] = useState<any[]>([]);
    const [selectedStation, setSelectedStation] = useState<number | null>(null);
    const [recTracks, setRecTracks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingRec, setLoadingRec] = useState(false);

    useEffect(() => {
        if (topArtists.length > 0) {
            setStations(topArtists.slice(0, 8));
            setLoading(false);
        }
    }, [topArtists]);

    const loadRecommendations = async (artistId: string, index: number) => {
        setSelectedStation(index);
        setLoadingRec(true);
        const data = await fetchRecommendations(token, {
            seedArtists: [artistId],
            limit: 20,
        });
        setRecTracks(data?.tracks ?? []);
        setLoadingRec(false);
    };

    const playAllRecommendations = () => {
        if (recTracks.length === 0) return;
        const uris = recTracks.map(t => t.uri);
        playTracks(token, uris);
    };

    const formatMs = (ms: number) => {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="radio-page">
                <h1 className="page-title"><RadioIcon size={28} style={{ marginRight: 12 }} /> Radio</h1>
                <div className="skeleton-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton-pulse skeleton-round" style={{ width: '100%', aspectRatio: '1/1' }} />
                            <div className="skeleton-pulse" style={{ width: '70%', height: 14, borderRadius: 4, marginTop: 12 }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="radio-page">
            <div className="radio-header">
                <RadioIcon size={36} color="#1db954" />
                <div>
                    <h1 className="page-title" style={{ marginBottom: 4 }}>Radio</h1>
                    <p className="text-subdued">Stations basées sur vos artistes préférés</p>
                </div>
            </div>

            <div className="card-scroll-row" style={{ marginBottom: 32 }}>
                {stations.map((artist: any, i: number) => (
                    <motion.div
                        key={artist.id}
                        className={`card-item ${selectedStation === i ? 'card-item--active' : ''}`}
                        whileHover={{ scale: 1.03 }}
                        onClick={() => loadRecommendations(artist.id, i)}
                    >
                        <div className="card-img-container card-img-round">
                            {artist.images?.[0]?.url
                                ? <img src={artist.images[0].url} alt="" className="card-img" />
                                : <div className="card-img-placeholder" />
                            }
                            <motion.button
                                className="card-play-btn"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    loadRecommendations(artist.id, i);
                                }}
                            >
                                <Play fill="black" size={18} />
                            </motion.button>
                        </div>
                        <div className="card-name">Radio {artist.name}</div>
                        <div className="card-subtitle">Avec {artist.name} et d'autres</div>
                    </motion.div>
                ))}
            </div>

            {/* Recommended tracks */}
            {selectedStation !== null && (
                <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="radio-rec-header">
                        <h2 className="section-title">
                            <Sparkles size={18} style={{ marginRight: 8 }} />
                            Recommandations — {stations[selectedStation]?.name}
                        </h2>
                        <div className="radio-rec-actions">
                            <motion.button
                                className="btn-green"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={playAllRecommendations}
                            >
                                <Play fill="black" size={16} /> Tout jouer
                            </motion.button>
                            <motion.button
                                className="btn-outline"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => selectedStation !== null && loadRecommendations(stations[selectedStation].id, selectedStation)}
                            >
                                <RefreshCw size={14} /> Rafraîchir
                            </motion.button>
                        </div>
                    </div>

                    {loadingRec ? (
                        <div className="track-list">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="track-row" style={{ opacity: 0.4 }}>
                                    <div className="skeleton-pulse" style={{ width: 40, height: 40, borderRadius: 4 }} />
                                    <div style={{ flex: 1, marginLeft: 12 }}>
                                        <div className="skeleton-pulse" style={{ width: '60%', height: 14, borderRadius: 4 }} />
                                        <div className="skeleton-pulse" style={{ width: '40%', height: 12, borderRadius: 4, marginTop: 6 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="track-list">
                            {recTracks.map((track: any, i: number) => (
                                <motion.div
                                    key={track.id}
                                    className="track-row"
                                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                >
                                    <span className="track-row__index">{i + 1}</span>
                                    <img
                                        src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url}
                                        alt=""
                                        className="track-row__cover"
                                    />
                                    <div className="track-row__info" onClick={() => onNavigateArtist?.(track.artists?.[0]?.id)}>
                                        <div className="track-row__name">{track.name}</div>
                                        <div className="track-row__artist">
                                            {track.artists?.map((a: any) => a.name).join(', ')}
                                        </div>
                                    </div>
                                    <span className="track-row__album">{track.album?.name}</span>
                                    <span className="track-row__duration">{formatMs(track.duration_ms)}</span>
                                    <motion.button
                                        className="track-row__play"
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => playTracks(token, [track.uri])}
                                    >
                                        <Play fill="white" size={14} />
                                    </motion.button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.section>
            )}
        </div>
    );
};
