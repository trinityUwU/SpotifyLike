import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Users, Music } from 'lucide-react';
import {
    fetchArtist,
    fetchArtistTopTracks,
    fetchArtistAlbums,
    fetchRelatedArtists,
    checkFollowingArtist,
    followArtist,
    unfollowArtist,
    playTracks,
    playContext,
} from '../services/spotify';
import { LikeButton } from './LikeButton';

interface ArtistDetailProps {
    token: string;
    artistId: string;
    onNavigateTrack?: (trackId: string) => void;
    onNavigateArtist: (artistId: string) => void;
    onNavigateAlbum: (albumId: string) => void;
}

const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()}K`;
    return n.toLocaleString();
};

// ─── Track Row Component ──────────────────────────────────────────────────
const TrackRow = ({ track, index, token, onNavigate }: {
    track: any;
    index: number;
    token: string;
    onNavigate: (id: string) => void
}) => {
    const [hovered, setHovered] = useState(false);

    const playTrack = async (e: React.MouseEvent) => {
        e.stopPropagation();
        playTracks(token, [track.uri]);
    };

    return (
        <motion.div
            className="artist-track-row"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={() => onNavigate(track.id)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40 }}>
                <AnimatePresence mode="wait">
                    {hovered ? (
                        <motion.button
                            key="play"
                            initial={{ opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.7 }}
                            transition={{ duration: 0.15 }}
                            onClick={playTrack}
                            style={{
                                background: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: 28,
                                height: 28,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                            }}
                        >
                            <Play fill="black" size={14} />
                        </motion.button>
                    ) : (
                        <motion.span
                            key="idx"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ color: '#a7a7a7', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}
                        >
                            {index + 1}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            <img
                src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url}
                alt=""
                style={{ width: 50, height: 50, borderRadius: 4, objectFit: 'cover' }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track.name}
                </div>
                <div style={{ fontSize: 13, color: '#a7a7a7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track.album?.name}
                </div>
            </div>

            {track.popularity > 0 && (
                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                        width: `${track.popularity}%`,
                        height: '100%',
                        background: '#1db954',
                        borderRadius: 2,
                        transition: 'width 0.3s'
                    }} />
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={(e) => e.stopPropagation()}>
                <LikeButton trackId={track.id} token={token} />
                <div style={{ color: '#a7a7a7', fontSize: 14, width: 40, textAlign: 'right' }}>
                    {formatMs(track.duration_ms)}
                </div>
            </div>
        </motion.div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────
export const ArtistDetail = ({ token, artistId, onNavigateTrack, onNavigateArtist, onNavigateAlbum }: ArtistDetailProps) => {
    const [artist, setArtist] = useState<any>(null);
    const [topTracks, setTopTracks] = useState<any[]>([]);
    const [albums, setAlbums] = useState<any[]>([]);
    const [relatedArtists, setRelatedArtists] = useState<any[]>([]);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Main data first
                const artistData = await fetchArtist(token, artistId);
                if (artistData) {
                    setArtist(artistData);
                } else {
                    console.error('Artist main data is null. Token might be expired or account restricted.');
                    setLoading(false);
                    return;
                }

                // Secondary data (sequential but non-blocking for each other)
                try {
                    const topTracksData = await fetchArtistTopTracks(token, artistId);
                    if (topTracksData) setTopTracks(topTracksData.tracks || []);
                } catch (e) { console.warn('Top tracks load failed', e); }

                try {
                    const albumsData = await fetchArtistAlbums(token, artistId);
                    if (albumsData) setAlbums(albumsData.items || []);
                } catch (e) { console.warn('Albums load failed', e); }

                try {
                    const relatedData = await fetchRelatedArtists(token, artistId);
                    if (relatedData) setRelatedArtists(relatedData.artists || []);
                } catch (e) { console.warn('Related artists load failed', e); }

                try {
                    const followingData = await checkFollowingArtist(token, artistId);
                    if (followingData) setIsFollowing(followingData[0] || false);
                } catch (e) { console.warn('Following check failed', e); }

            } catch (err) {
                console.error('Error loading artist detail page:', err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [token, artistId]);

    const toggleFollow = async () => {
        try {
            if (isFollowing) {
                await unfollowArtist(token, artistId);
                setIsFollowing(false);
            } else {
                await followArtist(token, artistId);
                setIsFollowing(true);
            }
        } catch (err) {
            console.error('Error toggling follow:', err);
        }
    };

    const playArtist = async () => {
        if (!artist) return;
        await playContext(token, artist.uri);
    };

    // Mémoriser les styles pour éviter le re-rendu au mouvement de la souris
    // IMPORTANT: useMemo doit être AVANT tout return conditionnel (Rules of Hooks)
    const backgroundStyle = useMemo(() => ({
        backgroundImage: `url('${artist?.images?.[0]?.url || ''}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    }), [artist?.images]);

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
                    Chargement de l'artiste…
                </motion.div>
            </div>
        );
    }

    if (!artist) return null;

    return (
        <motion.div
            className="artist-detail-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={backgroundStyle}
        >
            {/* Background blur overlay */}
            <div style={blurOverlayStyle} />

            {/* Left Column: Artist Photo */}
            <div className="artist-detail-photo" style={{ position: 'relative', zIndex: 1 }}>
                {artist.images?.[0]?.url && (
                    <motion.img
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        src={artist.images[0].url}
                        alt={artist.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                )}
            </div>

            {/* Right Column: Artist Info & Content */}
            <div className="artist-detail-content" style={{ position: 'relative', zIndex: 1 }}>

                {/* Artist Header */}
                <div>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        color: '#b3b3b3',
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        <Music size={14} />
                        Artiste
                    </div>

                    <h1 className="artist-detail-name">{artist.name}</h1>

                    <div className="artist-detail-stats">
                        {artist.followers?.total && (
                            <>
                                <Users size={16} />
                                <span>{formatNumber(artist.followers.total)} abonnés</span>
                            </>
                        )}
                        {artist.genres && artist.genres.length > 0 && (
                            <>
                                <span>•</span>
                                <span style={{ textTransform: 'capitalize' }}>{artist.genres.slice(0, 3).join(', ')}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="artist-detail-controls">
                    <motion.button
                        className="artist-detail-play-btn"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={playArtist}
                    >
                        <Play fill="black" size={24} />
                    </motion.button>

                    <motion.button
                        className="artist-detail-follow-btn"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={toggleFollow}
                    >
                        {isFollowing ? 'Ne plus suivre' : 'Suivre'}
                    </motion.button>
                </div>

                {/* Top Tracks */}
                {topTracks.length > 0 && (
                    <div className="artist-section">
                        <h2 className="artist-section-title">Titres populaires</h2>
                        <div>
                            {topTracks.slice(0, 5).map((track, index) => (
                                <TrackRow
                                    key={track.id}
                                    track={track}
                                    index={index}
                                    token={token}
                                    onNavigate={(id) => onNavigateTrack?.(id)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Albums */}
                {albums.length > 0 && (
                    <div className="artist-section">
                        <h2 className="artist-section-title">Albums</h2>
                        <div className="artist-albums-scroll">
                            {albums.map((album) => (
                                <motion.div
                                    key={album.id}
                                    className="artist-album-card"
                                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)', y: -4 }}
                                    onClick={() => onNavigateAlbum(album.id)}
                                >
                                    {album.images?.[0]?.url && (
                                        <img
                                            src={album.images[0].url}
                                            alt={album.name}
                                            className="artist-album-cover"
                                        />
                                    )}
                                    <div className="artist-album-title">{album.name}</div>
                                    <div className="artist-album-year">
                                        {new Date(album.release_date).getFullYear()} • {album.album_type === 'single' ? 'Single' : 'Album'}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Related Artists */}
                {relatedArtists.length > 0 && (
                    <div className="artist-section">
                        <h2 className="artist-section-title">Artistes similaires</h2>
                        <div className="artist-related-scroll">
                            {relatedArtists.map((related) => (
                                <motion.div
                                    key={related.id}
                                    className="artist-related-card"
                                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)', y: -4 }}
                                    onClick={() => onNavigateArtist(related.id)}
                                >
                                    {related.images?.[0]?.url && (
                                        <img
                                            src={related.images[0].url}
                                            alt={related.name}
                                            className="artist-related-image"
                                        />
                                    )}
                                    <div className="artist-related-name">{related.name}</div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ height: 60 }} />
            </div>
        </motion.div>
    );
};
