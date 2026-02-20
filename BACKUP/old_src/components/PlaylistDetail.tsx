import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Music, Clock, Lock } from 'lucide-react';
import { fetchPlaylist, fetchPlaylistTracks } from '../services/spotify';

interface PlaylistDetailProps {
    token: string;
    playlistId: string;
    onNavigateTrack?: (trackId: string) => void;
    onNavigateArtist?: (artistId: string) => void;
}

const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const PlaylistDetail = ({ token, playlistId, onNavigateTrack, onNavigateArtist }: PlaylistDetailProps) => {
    const [playlist, setPlaylist] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token || !playlistId) return;

        const loadData = async () => {
            setLoading(true);
            try {
                // Fetch basic details
                const playlistDetails = await fetchPlaylist(token, playlistId);
                if (!playlistDetails) {
                    setLoading(false);
                    return;
                }

                // Initial set to show something
                setPlaylist(playlistDetails);

                // Try fetching full track list (playlist details only gives first 100)
                try {
                    const fullTracks = await fetchPlaylistTracks(token, playlistId);
                    if (fullTracks && fullTracks.items && fullTracks.items.length > 0) {
                        setPlaylist({
                            ...playlistDetails,
                            tracks: fullTracks
                        });
                    }
                } catch (e) {
                    console.warn('Full tracks fetch failed, keeping partial list', e);
                }
            } catch (err) {
                console.error('Error loading playlist page:', err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [token, playlistId]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ color: '#a7a7a7', fontSize: 14 }}
                >
                    Chargement…
                </motion.div>
            </div>
        );
    }

    if (!playlist) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Playlist introuvable</h2>
                <button
                    onClick={() => window.history.back()}
                    style={{
                        padding: '12px 24px',
                        background: '#1db954',
                        color: 'white',
                        border: 'none',
                        borderRadius: '500px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600
                    }}
                >
                    Retour
                </button>
            </div>
        );
    }

    // ✅ Préparer les items de la playlist (tracks ou episodes)
    const rawItems = playlist.tracks?.items || [];
    const validTracks = rawItems.filter((item: any) => item?.track || item?.episode);
    const hasValidTracks = validTracks.length > 0;

    // Calcul de la durée totale
    const totalDuration = validTracks.reduce((acc: number, item: any) => {
        const duration = (item.track?.duration_ms || item.episode?.duration_ms || 0);
        return acc + duration;
    }, 0);
    const totalMinutes = Math.floor(totalDuration / 60000);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="playlist-detail-root"
            style={{ minHeight: '100%', paddingBottom: '100px' }}
        >
            {/* Header avec image */}
            <div className="playlist-detail-header" style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(18,18,18,1) 100%)',
                padding: '24px 32px 32px',
                marginBottom: '24px'
            }}>
                <button
                    onClick={() => window.history.back()}
                    className="detail-back-btn"
                >
                    <ArrowLeft size={16} />
                    Retour
                </button>

                <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="playlist-detail-photo">
                        {playlist.images?.[0]?.url ? (
                            <img
                                src={playlist.images[0].url}
                                alt={playlist.name}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '8px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                    objectFit: 'cover'
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '100%',
                                height: '100%',
                                background: '#282828',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Music size={64} color="#666" />
                            </div>
                        )}
                    </div>

                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            {playlist.public === false && <Lock size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                            Playlist {playlist.collaborative ? '• Collaborative' : ''}
                        </div>
                        <h1 style={{ fontSize: 'clamp(32px, 5vw, 72px)', fontWeight: 900, marginBottom: '16px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                            {playlist.name}
                        </h1>
                        {playlist.description && (
                            <p
                                style={{ color: '#a7a7a7', fontSize: '14px', marginBottom: '16px', maxWidth: '800px', lineHeight: '1.5' }}
                                dangerouslySetInnerHTML={{ __html: playlist.description }}
                            />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexWrap: 'wrap' }}>
                            <User size={16} />
                            <span style={{ fontWeight: 700 }}>{playlist.owner?.display_name || 'Spotify'}</span>
                            {playlist.followers?.total > 0 && (
                                <>
                                    <span>•</span>
                                    <span>{playlist.followers.total.toLocaleString()} j'aime</span>
                                </>
                            )}
                            <span>•</span>
                            <span style={{ fontWeight: 500 }}>{validTracks.length} titre{validTracks.length > 1 ? 's' : ''}</span>
                            {totalMinutes > 0 && (
                                <>
                                    <span>•</span>
                                    <span style={{ color: '#a7a7a7' }}>
                                        environ {totalMinutes < 60 ? `${totalMinutes} min` : `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Liste des tracks */}
            <div style={{ padding: '0 32px' }}>
                {hasValidTracks ? (
                    <div className="tracks-list">
                        {/* En-tête de la liste */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '50px 4fr 3fr 100px',
                            gap: '16px',
                            padding: '8px 16px',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            marginBottom: '16px',
                            color: '#a7a7a7',
                            fontSize: '12px',
                            fontWeight: 600,
                            letterSpacing: '0.1em'
                        }}>
                            <div style={{ textAlign: 'center' }}>#</div>
                            <div>TITRE</div>
                            <div>ALBUM</div>
                            <div style={{ textAlign: 'right', paddingRight: '20px' }}>
                                <Clock size={16} style={{ display: 'inline' }} />
                            </div>
                        </div>

                        {/* Tracks */}
                        {validTracks.map((item: any, index: number) => {
                            const track = item.track || item.episode;
                            if (!track) return null;

                            return (
                                <motion.div
                                    key={`${track.id}-${index}`}
                                    className="playlist-track-row"
                                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                                    onClick={() => onNavigateTrack?.(track.id)}
                                >
                                    <div style={{ color: '#a7a7a7', fontSize: '14px', textAlign: 'center' }}>
                                        {index + 1}
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                                        {(track.album?.images?.[2]?.url || track.images?.[2]?.url) && (
                                            <img
                                                src={track.album?.images?.[2]?.url || track.images?.[2]?.url}
                                                alt=""
                                                style={{ width: '40px', height: '40px', borderRadius: '4px', flexShrink: 0 }}
                                            />
                                        )}
                                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                            <div style={{
                                                fontWeight: 500,
                                                marginBottom: '4px',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {track.name}
                                            </div>
                                            <div
                                                style={{ color: '#a7a7a7', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (track.artists?.[0]) onNavigateArtist?.(track.artists[0].id);
                                                }}
                                            >
                                                {track.artists?.map((a: any) => a.name).join(', ')}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{
                                        color: '#a7a7a7',
                                        fontSize: '14px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {track.album?.name || track.show?.name || '-'}
                                    </div>

                                    <div style={{ textAlign: 'right', color: '#a7a7a7', fontSize: '14px', paddingRight: '20px' }}>
                                        {formatMs(track.duration_ms)}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#a7a7a7', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                        <Music size={64} style={{ marginBottom: '24px', opacity: 0.3 }} />
                        <h3 style={{ fontSize: '20px', color: 'white', marginBottom: '8px' }}>Aucun titre trouvé</h3>
                        <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '400px', color: '#666' }}>
                            {playlist.tracks?.total > 0
                                ? `Nous n'avons pas pu charger les ${playlist.tracks.total} titres de cette playlist. Ils sont peut-être protégés ou indisponibles.`
                                : 'Cette playlist ne contient aucun titre.'}
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
