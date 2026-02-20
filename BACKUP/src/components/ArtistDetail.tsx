import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, ExternalLink, Users, Music, Disc } from 'lucide-react';
import {
    fetchArtist,
    fetchArtistTopTracks,
    fetchArtistAlbums,
    fetchRelatedArtists,
    fetchDeezerRelatedArtists,
    fetchDeezerTopTracks,
    normalizeDeezerRelatedArtists,
    normalizeDeezerTracks,
    checkFollowingArtist,
    followArtist,
    unfollowArtist,
    playerPlay,
} from '../services/spotify';

interface ArtistDetailProps {
    token: string;
    artistId: string;
    onBack: () => void;
    onNavigateTrack: (trackId: string) => void;
    onNavigateArtist: (artistId: string) => void;
    onNavigatePlaylist: (id: string, type: 'playlist' | 'album') => void;
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

// ─── Track row ────────────────────────────────────────────────────────────────
const TrackRow = ({
    track, index, token, onNavigate
}: { track: any; index: number; token: string; onNavigate: (id: string) => void }) => {
    const [hovered, setHovered] = useState(false);

    const playTrack = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await playerPlay(token, { uris: [track.uri] });
    };

    return (
        <motion.div
            className="ad-track-row"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={() => onNavigate(track.id)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            style={{ borderRadius: 4 }}
        >
            <div className="ad-track-row__num">
                <AnimatePresence mode="wait">
                    {hovered ? (
                        <motion.button key="play"
                            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.1 }}
                            className="ad-track-row__play-btn" onClick={playTrack}
                        >
                            <Play fill="white" size={13} />
                        </motion.button>
                    ) : (
                        <motion.span key="idx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ color: '#a7a7a7', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                            {index + 1}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
            <img
                src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url}
                alt=""
                className="ad-track-row__thumb"
            />
            <div className="ad-track-row__info">
                <div className="ad-track-row__name">{track.name}</div>
                <div className="ad-track-row__streams">
                    {track.album?.name}
                </div>
            </div>
            <div className="ad-track-row__pop">
                {track.popularity > 0 && (
                    <div className="ad-track-row__pop-bar" style={{ width: `${track.popularity}%` }} />
                )}
            </div>
            <div className="ad-track-row__dur">{formatMs(track.duration_ms)}</div>
        </motion.div>
    );
};

// ─── Album card ───────────────────────────────────────────────────────────────
const AlbumCard = ({ album, token, onClick }: { album: any; token: string; onClick?: () => void }) => {
    const [hovered, setHovered] = useState(false);

    const playAlbum = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await playerPlay(token, { context_uri: album.uri });
    };

    return (
        <motion.div
            className="ad-album-card"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            onClick={onClick}
        >
            <div className="ad-album-card__img-wrap">
                {album.images?.[0]?.url
                    ? <img src={album.images[0].url} alt="" className="ad-album-card__img" />
                    : <div className="ad-album-card__img ad-album-card__img--placeholder" />
                }
                <AnimatePresence>
                    {hovered && (
                        <motion.button
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}
                            className="ad-album-card__play" onClick={playAlbum}
                        >
                            <Play fill="black" size={18} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
            <div className="ad-album-card__name">{album.name}</div>
            <div className="ad-album-card__sub">
                {album.release_date?.slice(0, 4)}
                {' · '}
                {album.album_type === 'single' ? 'Single' : album.album_type === 'compilation' ? 'Compilation' : 'Album'}
                {album.total_tracks > 1 ? ` · ${album.total_tracks} titres` : ''}
            </div>
        </motion.div>
    );
};

// ─── Related artist card ──────────────────────────────────────────────────────
const RelatedCard = ({ artist, onClick }: { artist: any; onClick: () => void }) => (
    <motion.div
        className="ad-related-card"
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)', y: -2 }}
        transition={{ duration: 0.15 }}
        onClick={onClick}
    >
        <div className="ad-related-card__img-wrap">
            {artist.images?.[0]?.url
                ? <img src={artist.images[0].url} alt="" className="ad-related-card__img" />
                : <div className="ad-related-card__img ad-related-card__img--placeholder" />
            }
        </div>
        <div className="ad-related-card__name">{artist.name}</div>
        <div className="ad-related-card__sub">
            {artist.followers?.total ? `${formatNumber(artist.followers.total)} followers` : 'Artiste'}
        </div>
    </motion.div>
);

// ─── Performance optimized background layer ──────────────────────────────────
const BlurredBackground = ({ imageUrl }: { imageUrl?: string }) => {
    if (!imageUrl) return null;
    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    inset: '-20px',
                    backgroundImage: `url('${imageUrl}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(50px) brightness(0.4)',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.7) 50%, rgba(10,10,10,0.5) 100%)',
                }}
            />
        </div>
    );
};

// ─── Composant principal ──────────────────────────────────────────────────────
export const ArtistDetail = ({
    token, artistId, onBack, onNavigateTrack, onNavigateArtist, onNavigatePlaylist
}: ArtistDetailProps) => {
    const [artist, setArtist] = useState<any>(null);
    const [topTracks, setTopTracks] = useState<any[]>([]);
    const [albums, setAlbums] = useState<any[]>([]);
    const [related, setRelated] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAllTracks, setShowAllTracks] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'about' | 'concerts'>('overview');
    const [isFollowing, setIsFollowing] = useState(false);

    useEffect(() => {
        if (!artistId) return;
        setLoading(true);
        setArtist(null);
        setTopTracks([]);
        setAlbums([]);
        setRelated([]);
        setShowAllTracks(false);
        setActiveTab('overview');
        setIsFollowing(false);

        const load = async () => {
            // 1. Charger l'artiste en priorité (fail = page blanche)
            let artistData: any = null;
            try {
                artistData = await fetchArtist(token, artistId);
            } catch (e) {
                console.error('[ArtistDetail] Impossible de charger l\'artiste:', e);
                setLoading(false);
                return;
            }
            setArtist(artistData);
            const artistName = artistData.name;

            // 2. Top tracks : Spotify → fallback Deezer si 403
            const fetchTopTracksWithFallback = async () => {
                try {
                    const data = await fetchArtistTopTracks(token, artistId);
                    return data?.tracks || [];
                } catch (e: any) {
                    if (e.message?.includes('FORBIDDEN') || e.message?.includes('403')) {
                        console.info(`[ArtistDetail] top-tracks 403 Spotify → fallback Deezer pour "${artistName}"`);
                        try {
                            const deezerData = await fetchDeezerTopTracks(artistName);
                            return normalizeDeezerTracks(deezerData);
                        } catch (dz) {
                            console.warn('[ArtistDetail] Deezer top-tracks error:', dz);
                        }
                    } else {
                        console.warn('[ArtistDetail] top-tracks err:', e.message);
                    }
                    return [];
                }
            };

            // 3. Related artists : Spotify → fallback Deezer si 403
            const fetchRelatedWithFallback = async () => {
                try {
                    const data = await fetchRelatedArtists(token, artistId);
                    return data?.artists || [];
                } catch (e: any) {
                    if (e.message?.includes('FORBIDDEN') || e.message?.includes('403')) {
                        console.info(`[ArtistDetail] related-artists 403 Spotify → fallback Deezer pour "${artistName}"`);
                        try {
                            const deezerData = await fetchDeezerRelatedArtists(artistName);
                            return normalizeDeezerRelatedArtists(deezerData);
                        } catch (dz) {
                            console.warn('[ArtistDetail] Deezer related error:', dz);
                        }
                    } else {
                        console.warn('[ArtistDetail] related-artists err (endpoint restreint):', e.message);
                    }
                    return [];
                }
            };

            // 4. Charger en parallèle
            const [tracksResult, albumsData, relatedResult, followData] = await Promise.all([
                fetchTopTracksWithFallback(),
                fetchArtistAlbums(token, artistId)
                    .catch(e => { console.warn('[ArtistDetail] albums err:', e.message); return { items: [] }; }),
                fetchRelatedWithFallback(),
                checkFollowingArtist(token, artistId)
                    .catch(e => { console.warn('[ArtistDetail] following err:', e.message); return [false]; }),
            ]);

            setTopTracks(tracksResult);
            setAlbums(albumsData.items ?? []);
            setRelated(relatedResult);
            setIsFollowing(Array.isArray(followData) ? followData[0] : false);
            setLoading(false);
        };

        load();
    }, [token, artistId]);


    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ color: '#a7a7a7', fontSize: 14 }}>Chargement…</motion.div>
            </div>
        );
    }

    if (!artist) return null;

    const heroImg = artist.images?.[0]?.url;
    const singleAlbums = albums.filter((a: any) => a.album_type === 'single');
    const fullAlbums = albums.filter((a: any) => a.album_type === 'album');
    const visibleTracks = showAllTracks ? topTracks : topTracks.slice(0, 5);
    const followers = artist.followers?.total ?? 0;

    return (
        <motion.div
            className="ad-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            <BlurredBackground imageUrl={albums[0]?.images?.[0]?.url || heroImg} />

            {/* ── Left : photo pleine hauteur ── */}
            <div className="ad-photo-col" style={{ position: 'relative', zIndex: 1 }}>
                {heroImg
                    ? <img src={heroImg} alt={artist.name} className="ad-photo" />
                    : <div className="ad-photo ad-photo--placeholder" />
                }
                <div className="ad-photo-fade" />
                {/* Overlay infos en bas de la photo */}
                <div className="ad-photo-overlay">
                    <div className="ad-photo-popularity">
                        <div className="ad-photo-pop-bar" style={{ width: `${artist.popularity ?? 0}%` }} />
                        <span>Popularité {artist.popularity ?? 0}/100</span>
                    </div>
                </div>
            </div>

            {/* ── Right : contenu scrollable ── */}
            <div className="ad-content-col" style={{ position: 'relative', zIndex: 1 }}>
                {/* Topbar */}
                <div className="ad-topbar">
                    <motion.button className="ad-back-btn" onClick={onBack} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <ArrowLeft size={16} />
                    </motion.button>
                    <span className="ad-topbar__name">{artist.name}</span>
                    <motion.button
                        className="ad-ext-btn"
                        onClick={() => window.open(artist.external_urls?.spotify, '_blank')}
                        whileHover={{ scale: 1.1 }}
                        title="Ouvrir dans Spotify"
                    >
                        <ExternalLink size={14} />
                    </motion.button>
                </div>

                {/* Hero info */}
                <div className="ad-hero-info">
                    <div className="ad-verified">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#3d9bff"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                        Artiste Vérifié
                    </div>
                    <h1 className="ad-name">{artist.name}</h1>

                    {/* Stats row */}
                    <div className="ad-stats-row">
                        <div className="ad-stat">
                            <Users size={13} />
                            <span>{followers > 0 ? `${formatNumber(followers)} abonnés` : 'Artiste'}</span>
                        </div>
                        {topTracks.length > 0 && (
                            <div className="ad-stat">
                                <Music size={13} />
                                <span>{topTracks.length} titres populaires</span>
                            </div>
                        )}
                        {albums.length > 0 && (
                            <div className="ad-stat">
                                <Disc size={13} />
                                <span>{albums.length} sorties</span>
                            </div>
                        )}
                    </div>

                    {/* Monthly listeners info — API doesn't expose this, so we show a message */}
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                        Popularité globale : {artist.popularity ?? 0}/100
                    </div>
                </div>

                {/* Tabs */}
                <div className="ad-tabs">
                    {(['overview', 'about', 'concerts'] as const).map(tab => (
                        <button
                            key={tab}
                            className={`ad-tab ${activeTab === tab ? 'ad-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'overview' ? 'Aperçu' : tab === 'about' ? 'À propos' : 'Concerts'}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                <div className="ad-actions">
                    <motion.button
                        className="ad-play-btn"
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                        onClick={async () => {
                            if (topTracks[0]) {
                                await playerPlay(token, { uris: topTracks.map(t => t.uri) });
                            }
                        }}
                    >
                        <Play fill="black" size={20} />
                        <span>Lire</span>
                    </motion.button>
                    <motion.button
                        className="ad-follow-btn"
                        whileHover={{ borderColor: 'white' }}
                        whileTap={{ scale: 0.97 }}
                        onClick={async () => {
                            try {
                                if (isFollowing) {
                                    await unfollowArtist(token, artistId);
                                    setIsFollowing(false);
                                } else {
                                    await followArtist(token, artistId);
                                    setIsFollowing(true);
                                }
                            } catch (err) {
                                console.error('Erreur follow:', err);
                            }
                        }}
                        style={{
                            background: isFollowing ? 'rgba(29,185,84,0.2)' : 'transparent',
                            borderColor: isFollowing ? '#1db954' : 'rgba(255,255,255,0.3)',
                            color: isFollowing ? '#1db954' : 'white',
                        }}
                    >
                        {isFollowing ? '✓ Abonné' : 'Suivre'}
                    </motion.button>
                </div>

                {/* Genres */}
                {artist.genres?.length > 0 && (
                    <div className="ad-genres">
                        {artist.genres.slice(0, 5).map((g: string) => (
                            <span key={g} className="ad-genre-tag">{g}</span>
                        ))}
                    </div>
                )}

                {/* ── Titres Populaires ── */}
                {topTracks.length > 0 && (
                    <div style={{ marginBottom: 28 }}>
                        <div className="ad-section-title">
                            <Music size={13} style={{ display: 'inline', marginRight: 6 }} />
                            Titres Populaires
                        </div>
                        <div className="ad-tracks-list">
                            {visibleTracks.map((track: any, i: number) => (
                                <TrackRow
                                    key={track.id}
                                    track={track}
                                    index={i}
                                    token={token}
                                    onNavigate={onNavigateTrack}
                                />
                            ))}
                        </div>
                        {topTracks.length > 5 && (
                            <button className="ad-show-more" onClick={() => setShowAllTracks(v => !v)}>
                                {showAllTracks ? 'Voir moins' : 'Voir plus'}
                            </button>
                        )}
                    </div>
                )}

                {/* ── Discographie complète ── */}
                {fullAlbums.length > 0 && (
                    <div className="ad-discography">
                        <div className="ad-section-title">
                            <Disc size={13} style={{ display: 'inline', marginRight: 6 }} />
                            Albums
                        </div>
                        <div className="ad-albums-row">
                            {fullAlbums.map((album: any) => (
                                <AlbumCard
                                    key={album.id}
                                    album={album}
                                    token={token}
                                    onClick={() => onNavigatePlaylist(album.id, 'album')}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Singles ── */}
                {singleAlbums.length > 0 && (
                    <div className="ad-discography">
                        <div className="ad-section-title">Singles et EPs</div>
                        <div className="ad-albums-row">
                            {singleAlbums.map((album: any) => (
                                <AlbumCard
                                    key={album.id}
                                    album={album}
                                    token={token}
                                    onClick={() => onNavigatePlaylist(album.id, 'album')}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Related artists ── */}
                {related.length > 0 && (
                    <div className="ad-discography">
                        <div className="ad-section-title">
                            <Users size={13} style={{ display: 'inline', marginRight: 6 }} />
                            Artistes Similaires
                        </div>
                        <div className="ad-related-row">
                            {related.slice(0, 8).map((a: any) => (
                                <RelatedCard
                                    key={a.id}
                                    artist={a}
                                    onClick={() => onNavigateArtist(a.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── About (genres + popularity) ── */}
                <div className="ad-about-card">
                    <div className="ad-section-title">About</div>
                    <div className="ad-about-grid">
                        <div className="ad-about-item">
                            <div className="ad-about-label">Abonnés</div>
                            <div className="ad-about-value">{followers > 0 ? formatNumber(followers) : '—'}</div>
                        </div>
                        <div className="ad-about-item">
                            <div className="ad-about-label">Popularité</div>
                            <div className="ad-about-value">{artist.popularity ?? '—'}<span style={{ fontSize: 11, color: '#a7a7a7' }}>/100</span></div>
                        </div>
                        <div className="ad-about-item">
                            <div className="ad-about-label">Sorties</div>
                            <div className="ad-about-value">{albums.length}</div>
                        </div>
                        <div className="ad-about-item">
                            <div className="ad-about-label">Titres Populaires</div>
                            <div className="ad-about-value">{topTracks.length}</div>
                        </div>
                    </div>
                    {artist.genres?.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div className="ad-about-label" style={{ marginBottom: 8 }}>Genres</div>
                            <div className="ad-genres" style={{ marginBottom: 0 }}>
                                {artist.genres.map((g: string) => (
                                    <span key={g} className="ad-genre-tag">{g}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ height: 40 }} />
            </div>
        </motion.div>
    );
};
