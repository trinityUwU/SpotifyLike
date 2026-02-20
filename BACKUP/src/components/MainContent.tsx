import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Clock, ChevronRight } from 'lucide-react';
import { loginUrl, fetchProfile, fetchTopTracks, fetchPlaylists, fetchRecentlyPlayed, fetchTopArtists, searchSpotify, playerPlay, fetchFeaturedPlaylists, fetchNewReleases } from '../services/spotify';
import { TrackDetail } from './TrackDetail';
import { ArtistDetail } from './ArtistDetail';
import { PlaylistDetail } from './PlaylistDetail';

const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ─── Section header ──────────────────────────────────────────────────────────
const SectionHeader = ({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) => (
    <div className="section-header">
        <h2 className="section-header__title">{title}</h2>
        {onSeeAll && (
            <button className="section-header__see-all" onClick={onSeeAll}>
                Tout afficher <ChevronRight size={14} />
            </button>
        )}
    </div>
);

// ─── Card track horizontale ───────────────────────────────────────────────────
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
            className="track-row"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={() => onNavigate(track.id)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
        >
            <div className="track-row__num">
                <AnimatePresence mode="wait">
                    {hovered ? (
                        <motion.button
                            key="play"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.1 }}
                            className="track-row__play-btn"
                            onClick={playTrack}
                        >
                            <Play fill="white" size={12} />
                        </motion.button>
                    ) : (
                        <motion.span
                            key="index"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ color: '#a7a7a7', fontSize: 13 }}
                        >
                            {index + 1}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
            <img src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url} alt="" className="track-row__img" />
            <div className="track-row__info">
                <div className="track-row__name">{track.name}</div>
                <div className="track-row__artist">{track.artists?.map((a: any) => a.name).join(', ')}</div>
            </div>
            <div className="track-row__album">{track.album?.name}</div>
            <div className="track-row__dur">
                <Clock size={12} color="#a7a7a7" />
                {formatMs(track.duration_ms)}
            </div>
        </motion.div>
    );
};

// ─── Carte playlist/album carrée ─────────────────────────────────────────────
const CardSquare = ({ item, sublabel, onClick }: { item: any; sublabel: string; onClick?: () => void }) => {
    const [hovered, setHovered] = useState(false);
    const img = item.images?.[0]?.url;

    return (
        <motion.div
            className="card-square"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={onClick}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.18 }}
        >
            <div className="card-square__img-wrap">
                {img ? <img src={img} alt="" className="card-square__img" /> : <div className="card-square__img card-square__img--placeholder" />}
                <AnimatePresence>
                    {hovered && (
                        <motion.button
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.15 }}
                            className="card-square__play"
                            onClick={e => e.stopPropagation()}
                        >
                            <Play fill="black" size={20} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
            <div className="card-square__name">{item.name}</div>
            <div className="card-square__sub">{sublabel}</div>
        </motion.div>
    );
};

// ─── Carte artiste ronde ──────────────────────────────────────────────────────
const ArtistCard = ({ artist, onClick }: { artist: any; onClick?: () => void }) => (
    <motion.div
        className="artist-card-home"
        whileHover={{ y: -4 }}
        transition={{ duration: 0.18 }}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
        <div className="artist-card-home__img-wrap">
            {artist.images?.[0]?.url
                ? <img src={artist.images[0].url} alt="" className="artist-card-home__img" />
                : <div className="artist-card-home__img artist-card-home__img--placeholder" />
            }
        </div>
        <div className="artist-card-home__name">{artist.name}</div>
        <div className="artist-card-home__sub">Artiste</div>
    </motion.div>
);

// ─── Carte "récemment écouté" ─────────────────────────────────────────────────
const RecentCard = ({ item, token, onNavigate }: { item: any; token: string; onNavigate: (id: string) => void }) => {
    const [hovered, setHovered] = useState(false);
    const track = item.track;
    const img = track?.album?.images?.[0]?.url;

    const playNow = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: [track.uri] }),
        });
    };

    return (
        <motion.div
            className="recent-card"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={() => onNavigate(track.id)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
        >
            <div style={{ position: 'relative', flexShrink: 0 }}>
                {img ? <img src={img} alt="" className="recent-card__img" /> : <div className="recent-card__img recent-card__img--placeholder" />}
                <AnimatePresence>
                    {hovered && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.12 }}
                            className="recent-card__play"
                            onClick={playNow}
                        >
                            <Play fill="black" size={14} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
            <div className="recent-card__info">
                <div className="recent-card__name">{track?.name}</div>
                <div className="recent-card__artist">{track?.artists?.[0]?.name}</div>
            </div>
        </motion.div>
    );
};

// ─── Greeting dynamique ───────────────────────────────────────────────────────
const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 6) return 'Bonne nuit';
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const MainContent = ({
    token,
    searchQuery,
    homeResetCounter = 0,
    onClearSearch
}: {
    token: string | null;
    searchQuery?: string;
    homeResetCounter?: number;
    onClearSearch?: () => void;
}) => {
    const [profile, setProfile] = useState<any>(null);
    const [topTracks, setTopTracks] = useState<any[]>([]);
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [recentTracks, setRecentTracks] = useState<any[]>([]);
    const [topArtists, setTopArtists] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any>(null);
    const [featuredPlaylists, setFeaturedPlaylists] = useState<any[]>([]);
    const [newReleases, setNewReleases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [currentView, setCurrentView] = useState<
        { type: 'home' } | { type: 'track'; id: string } | { type: 'artist'; id: string } | { type: 'playlist' | 'album' | 'show' | 'episode'; id: string }
    >({ type: 'home' });

    // Reset view to home when signaled from topbar (logo/accueil click)
    useEffect(() => {
        if (homeResetCounter > 0) {
            setCurrentView({ type: 'home' });
            if (onClearSearch) onClearSearch();
        }
    }, [homeResetCounter, onClearSearch]);

    // Global Search Logic
    useEffect(() => {
        if (!token || !searchQuery || searchQuery.trim().length === 0) {
            setSearchResults(null);
            setSearching(false);
            return;
        }

        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const results = await searchSpotify(token, searchQuery);
                setSearchResults(results);
            } catch (err) {
                console.error('Search error:', err);
            } finally {
                setSearching(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [token, searchQuery]);

    const loadData = useCallback(async () => {
        if (!token) return;
        try {
            const [profileData, tracksData, playlistsData, recentData, artistsData, featuredRes, newRes] = await Promise.all([
                fetchProfile(token).catch(e => { console.warn('Profile fetch failed', e); return null; }),
                fetchTopTracks(token).catch(e => { console.warn('Top tracks fetch failed', e); return { items: [] }; }),
                fetchPlaylists(token).catch(e => { console.warn('Playlists fetch failed', e); return { items: [] }; }),
                fetchRecentlyPlayed(token).catch(e => { console.warn('Recent fetch failed', e); return { items: [] }; }),
                fetchTopArtists(token).catch(e => { console.warn('Artists fetch failed', e); return { items: [] }; }),
                fetchFeaturedPlaylists(token).catch(e => { console.warn('Featured fetch failed', e); return { playlists: { items: [] } }; }),
                fetchNewReleases(token).catch(e => { console.warn('New releases fetch failed', e); return { albums: { items: [] } }; }),
            ]);

            setProfile(profileData);
            setTopTracks(tracksData.items || []);
            setPlaylists(playlistsData.items || []);

            // Dédoublonner les récents par track.id
            const seen = new Set();
            const deduped = (recentData.items || []).filter((item: any) => {
                if (seen.has(item.track?.id)) return false;
                seen.add(item.track?.id);
                return true;
            });
            setRecentTracks(deduped.slice(0, 12));
            setTopArtists(artistsData.items || []);

            // Public data
            setFeaturedPlaylists(featuredRes.playlists?.items || []);
            setNewReleases(newRes.albums?.items || []);
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const navigateToTrack = (trackId: string) => {
        setCurrentView({ type: 'track', id: trackId });
    };

    const navigateToArtist = (artistId: string) => {
        setCurrentView({ type: 'artist', id: artistId });
    };

    const navigateToPlaylist = (playlistId: string, type: 'playlist' | 'album' | 'show' | 'episode' = 'playlist') => {
        setCurrentView({ type, id: playlistId });
    };

    // ─── Login ────────────────────────────────────────────────────────────────
    if (!token) {
        return (
            <div className="login-screen">
                <motion.div
                    className="login-screen__inner"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <div className="login-screen__logo">
                        <svg viewBox="0 0 24 24" width="56" height="56" fill="#1db954">
                            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.624.624 0 01-.857.208c-2.35-1.434-5.305-1.759-8.786-.963a.623.623 0 01-.277-1.215c3.809-.87 7.076-.495 9.712 1.115.294.18.388.565.208.855zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.516.781.781 0 01.517-.972c3.632-1.102 8.147-.568 11.236 1.328a.78.78 0 01.257 1.069zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.865 13.115 1.337a.936.936 0 01-1.027 1.574l.073.035z" />
                        </svg>
                    </div>
                    <h1 className="login-screen__title">SpotifyLIKE</h1>
                    <p className="login-screen__sub">Connectez-vous pour découvrir votre musique</p>
                    <motion.button
                        className="btn-primary"
                        onClick={() => { window.location.href = loginUrl; }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        style={{ padding: '14px 40px', fontSize: 15 }}
                    >
                        Se connecter avec Spotify
                    </motion.button>
                </motion.div>
            </div>
        );
    }

    // ─── Track detail view ───────────────────────────────────────────────────
    if (currentView.type === 'track') {
        return (
            <TrackDetail
                token={token}
                trackId={currentView.id}
                onBack={() => setCurrentView({ type: 'home' })}
                onNavigateTrack={navigateToTrack}
                onNavigateArtist={navigateToArtist}
            />
        );
    }

    // ─── Artist detail view ───────────────────────────────────────────────────
    if (currentView.type === 'artist') {
        return (
            <ArtistDetail
                token={token}
                artistId={currentView.id}
                onBack={() => setCurrentView({ type: 'home' })}
                onNavigateTrack={navigateToTrack}
                onNavigateArtist={navigateToArtist}
                onNavigatePlaylist={navigateToPlaylist}
            />
        );
    }

    if (currentView.type === 'playlist' || currentView.type === 'album' || currentView.type === 'show' || currentView.type === 'episode') {
        return (
            <PlaylistDetail
                token={token}
                playlistId={currentView.id}
                type={currentView.type}
                onBack={() => setCurrentView({ type: 'home' })}
                onNavigateTrack={navigateToTrack}
                onNavigateArtist={navigateToArtist}
            />
        );
    }

    // ─── Search Results View ────────────────────────────────────────────────
    if (currentView.type === 'home' && searchQuery && searchQuery.trim().length > 0) {
        if (searching && !searchResults) {
            return (
                <div style={{ padding: '80px', textAlign: 'center', color: '#a7a7a7' }}>
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }}>
                        Recherche en cours…
                    </motion.div>
                </div>
            );
        }

        const tracks = searchResults?.tracks?.items || [];
        const artists = searchResults?.artists?.items || [];
        const albums = searchResults?.albums?.items || [];
        const shows = searchResults?.shows?.items || [];

        return (
            <motion.div
                className="homepage"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ padding: '24px 40px' }}
            >
                <div style={{ marginBottom: '32px' }}>
                    <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Résultats pour "{searchQuery}"</h1>
                </div>

                {searching && (
                    <div style={{ position: 'fixed', top: '80px', right: '40px', background: '#1db954', color: 'black', padding: '4px 12px', borderRadius: '4px', fontSize: 12, fontWeight: 700, zIndex: 100 }}>
                        Mise à jour…
                    </div>
                )}

                {tracks.length > 0 && (
                    <section className="homepage__section" style={{ marginBottom: '48px' }}>
                        <SectionHeader title="Titres" />
                        <div className="tracks-table">
                            {tracks.slice(0, 5).map((t: any, i: number) => (
                                <TrackRow key={t.id} track={t} index={i} token={token || ''} onNavigate={navigateToTrack} />
                            ))}
                        </div>
                    </section>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                    {artists.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Artistes" />
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {artists.slice(0, 4).map((a: any) => (
                                    <ArtistCard key={a.id} artist={a} onClick={() => navigateToArtist(a.id)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {albums.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Albums" />
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {albums.slice(0, 4).map((alb: any) => (
                                    <CardSquare key={alb.id} item={alb} sublabel={alb.artists?.[0]?.name} onClick={() => navigateToPlaylist(alb.id, 'album')} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {shows.length > 0 && (
                    <section className="homepage__section" style={{ marginTop: '40px' }}>
                        <SectionHeader title="Podcasts & Émissions" />
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {shows.slice(0, 6).map((s: any) => (
                                <CardSquare
                                    key={s.id}
                                    item={s}
                                    sublabel={s.publisher}
                                    onClick={() => navigateToPlaylist(s.id, 'show')}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {tracks.length === 0 && artists.length === 0 && albums.length === 0 && shows.length === 0 && !searching && (
                    <div style={{ padding: '80px', textAlign: 'center', color: '#a7a7a7' }}>
                        Aucun résultat pour cette recherche.
                    </div>
                )}
            </motion.div>
        );
    }

    // ─── Loading ─────────────────────────────────────────────────────────────
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

    // ─── Homepage ────────────────────────────────────────────────────────────
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="home"
                className="homepage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
            >
                {/* Greeting */}
                <div className="homepage__greeting-bar">
                    <h1 className="homepage__greeting">
                        {getGreeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}
                    </h1>
                </div>

                <div className="homepage__content">
                    {/* Récemment écoutés — grille rapide */}
                    {recentTracks.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Récemment écoutés" />
                            <div className="recent-grid">
                                {recentTracks.slice(0, 8).map((item: any, i: number) => (
                                    <RecentCard
                                        key={`${item.track?.id}-${i}`}
                                        item={item}
                                        token={token}
                                        onNavigate={navigateToTrack}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Top artistes */}
                    {topArtists.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Vos artistes du moment" />
                            <div className="scroll-row">
                                {topArtists.slice(0, 6).map((artist: any) => (
                                    <ArtistCard key={artist.id} artist={artist} onClick={() => navigateToArtist(artist.id)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Featured Playlists — PUBLIC DATA */}
                    {featuredPlaylists.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Sélection Spotify" />
                            <div className="scroll-row">
                                {featuredPlaylists.map((pl: any) => (
                                    <CardSquare
                                        key={pl.id}
                                        item={pl}
                                        sublabel={pl.description || "Playlist Spotify"}
                                        onClick={() => navigateToPlaylist(pl.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* New Releases — PUBLIC DATA */}
                    {newReleases.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Nouveautés" />
                            <div className="scroll-row">
                                {newReleases.map((alb: any) => (
                                    <CardSquare
                                        key={alb.id}
                                        item={alb}
                                        sublabel={alb.artists?.[0]?.name}
                                        onClick={() => navigateToPlaylist(alb.id, 'album')}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Vos playlists */}
                    {playlists.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Vos playlists" />
                            <div className="scroll-row">
                                {/* Liked Songs Card */}
                                <CardSquare
                                    item={{
                                        id: 'liked-songs',
                                        name: 'Titres likés',
                                        images: [{ url: 'https://t.scdn.co/images/3099b380355140d7ae291cf2894343fb.png' }]
                                    }}
                                    sublabel="Votre collection"
                                    onClick={() => navigateToPlaylist('liked-songs')}
                                />
                                {playlists.map((pl: any) => (
                                    <CardSquare
                                        key={pl.id}
                                        item={pl}
                                        sublabel={`${pl.tracks?.total || 0} titres`}
                                        onClick={() => navigateToPlaylist(pl.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Top tracks */}
                    {topTracks.length > 0 && (
                        <section className="homepage__section">
                            <SectionHeader title="Vos tops titres" />
                            <div className="tracks-table">
                                <div className="tracks-table__header">
                                    <span>#</span>
                                    <span>Titre</span>
                                    <span>Album</span>
                                    <span><Clock size={14} /></span>
                                </div>
                                <div>
                                    {topTracks.map((track: any, i: number) => (
                                        <TrackRow
                                            key={track.id}
                                            track={track}
                                            index={i}
                                            token={token}
                                            onNavigate={navigateToTrack}
                                        />
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
