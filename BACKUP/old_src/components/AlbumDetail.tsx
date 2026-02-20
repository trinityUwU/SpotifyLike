import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Disc, Calendar, Music } from 'lucide-react';
import { fetchAlbum, playContext } from '../services/spotify';
import { LikeButton } from './LikeButton';

interface AlbumDetailProps {
    token: string;
    albumId: string;
    onNavigateTrack?: (trackId: string) => void;
    onNavigateArtist: (artistId: string) => void;
}

const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const AlbumDetail = ({ token, albumId, onNavigateTrack, onNavigateArtist }: AlbumDetailProps) => {
    const [album, setAlbum] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchAlbum(token, albumId)
            .then(data => {
                setAlbum(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [token, albumId]);

    const playAlbum = async () => {
        if (!album) return;
        playContext(token, album.uri);
    };

    // Mémoriser les styles pour éviter le re-rendu au mouvement de la souris
    // IMPORTANT: useMemo doit être AVANT tout return conditionnel (Rules of Hooks)
    const backgroundStyle = useMemo(() => ({
        backgroundImage: `url('${album?.images?.[0]?.url || ''}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    }), [album?.images]);

    const blurOverlayStyle = useMemo(() => ({
        position: 'absolute' as const,
        inset: 0,
        background: 'linear-gradient(90deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.85) 50%, rgba(10,10,10,0.7) 100%)',
        backdropFilter: 'blur(60px)',
        zIndex: 0,
        pointerEvents: 'none' as const,
    }), []);

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ color: '#a7a7a7', fontSize: 14 }}
                >
                    Chargement de l'album…
                </motion.div>
            </div>
        );
    }

    if (!album) return null;

    return (
        <motion.div
            className="album-detail-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={backgroundStyle}
        >
            {/* Background blur overlay */}
            <div style={blurOverlayStyle} />

            {/* Left Column: Album Cover */}
            <div className="album-detail-photo" style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <motion.img
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4 }}
                        src={album.images?.[0]?.url}
                        alt={album.name}
                        style={{
                            width: '100%',
                            maxWidth: '500px',
                            aspectRatio: '1/1',
                            objectFit: 'cover',
                            borderRadius: 8,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
                        }}
                    />
                </div>
            </div>

            {/* Right Column: Album Info & Tracks */}
            <div className="album-detail-content" style={{ position: 'relative', zIndex: 1 }}>
                {/* Back Button */}
                <motion.button
                    className="detail-back-btn"
                    onClick={() => window.history.back()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <ArrowLeft size={16} />
                    Retour
                </motion.button>

                {/* Album Header */}
                <div className="album-detail-header">
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        color: '#b3b3b3',
                        marginBottom: 12
                    }}>
                        <Disc size={14} />
                        {album.album_type === 'single' ? 'Single' : 'Album'}
                    </div>

                    <h1 className="album-detail-title">{album.name}</h1>

                    <div
                        className="album-detail-artists"
                        onClick={() => album.artists[0] && onNavigateArtist(album.artists[0].id)}
                        style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#a7a7a7'}
                    >
                        {album.artists.map((a: any) => a.name).join(', ')}
                    </div>

                    <div className="album-detail-info">
                        <Calendar size={14} />
                        <span>{new Date(album.release_date).getFullYear()}</span>
                        <span>•</span>
                        <Music size={14} />
                        <span>{album.total_tracks} titre{album.total_tracks > 1 ? 's' : ''}</span>
                    </div>
                </div>

                {/* Play Button */}
                <div className="album-detail-controls">
                    <motion.button
                        className="album-detail-play-btn"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={playAlbum}
                    >
                        <Play fill="black" size={24} />
                    </motion.button>
                </div>

                {/* Track List */}
                <div className="album-track-list">
                    {album.tracks.items.map((track: any, i: number) => (
                        <motion.div
                            key={track.id}
                            className="album-track-row"
                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                            onClick={() => onNavigateTrack?.(track.id)}
                        >
                            <div className="album-track-number">{i + 1}</div>

                            <div style={{ width: 40, height: 40 }}>
                                {track.album?.images?.[2]?.url || album.images?.[2]?.url ? (
                                    <img
                                        src={track.album?.images?.[2]?.url || album.images?.[2]?.url}
                                        alt=""
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: 4,
                                            objectFit: 'cover'
                                        }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '100%',
                                        height: '100%',
                                        background: '#282828',
                                        borderRadius: 4
                                    }} />
                                )}
                            </div>

                            <div>
                                <div className="album-track-title">{track.name}</div>
                                <div style={{ fontSize: 13, color: '#a7a7a7', marginTop: 4 }}>
                                    {track.artists.map((a: any) => a.name).join(', ')}
                                </div>
                            </div>

                            <div className="album-track-duration">{formatMs(track.duration_ms)}</div>

                            <div onClick={(e) => e.stopPropagation()}>
                                <LikeButton trackId={track.id} token={token} />
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div style={{ height: 60 }} />
            </div>
        </motion.div>
    );
};
