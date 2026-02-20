import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ArtistDetail } from './ArtistDetail';
import { AlbumDetail } from './AlbumDetail';
import { PlaylistDetail } from './PlaylistDetail';
import { TrackDetail } from './TrackDetail';
import { BrowsePage } from './BrowsePage';
import { RadioPage } from './RadioPage';
import { PlaylistsPage } from './PlaylistsPage';
import { ActivityPage } from './ActivityPage';
import { SearchPage } from './SearchPage';
import { playContext } from '../services/spotify';

interface MainContentProps {
    token: string;
    currentPage: string;
    currentNav: { type: string; id?: string; query?: string };
    searchQuery: string;
    onNavigateDetail: (type: string, id: string) => void;
    onGoBack: () => void;
    profile: any;
}

const pageVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

export const MainContent = ({
    token, currentPage, currentNav, searchQuery,
    onNavigateDetail, onGoBack, profile,
}: MainContentProps) => {
    const isDetailPage = ['artistDetail', 'albumDetail', 'playlistDetail', 'trackDetail'].includes(currentPage);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Retour en haut à chaque changement de page
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo(0, 0);
        }
    }, [currentPage, currentNav.id]);

    return (
        <main className="main-content">
            {isDetailPage && (
                <motion.button
                    className="back-button"
                    onClick={onGoBack}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <ArrowLeft size={20} />
                </motion.button>
            )}

            <div className="main-scroll-area" ref={scrollRef}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${currentPage}-${currentNav.id || ''}`}
                        variants={pageVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.15 }}
                        style={{ minHeight: '100%' }}
                    >
                        {currentPage === 'home' && (
                            <HomePage
                                token={token}
                                profile={profile}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                                onNavigatePlaylist={(id: string) => onNavigateDetail('playlistDetail', id)}
                            />
                        )}
                        {currentPage === 'browse' && (
                            <BrowsePage
                                token={token}
                                onNavigatePlaylist={(id: string) => onNavigateDetail('playlistDetail', id)}
                            />
                        )}
                        {currentPage === 'radio' && (
                            <RadioPage
                                token={token}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                            />
                        )}
                        {currentPage === 'playlists' && (
                            <PlaylistsPage token={token} onNavigatePlaylist={(id: string) => onNavigateDetail('playlistDetail', id)} />
                        )}
                        {currentPage === 'activity' && (
                            <ActivityPage token={token} onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)} />
                        )}
                        {currentPage === 'search' && (
                            <SearchPage
                                token={token}
                                query={searchQuery}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                                onNavigateAlbum={(id: string) => onNavigateDetail('albumDetail', id)}
                                onNavigatePlaylist={(id: string) => onNavigateDetail('playlistDetail', id)}
                                onNavigateTrack={(id: string) => onNavigateDetail('trackDetail', id)}
                            />
                        )}
                        {currentPage === 'artistDetail' && currentNav.id && (
                            <ArtistDetail
                                token={token}
                                artistId={currentNav.id}
                                onNavigateAlbum={(id: string) => onNavigateDetail('albumDetail', id)}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                                onNavigateTrack={(id: string) => onNavigateDetail('trackDetail', id)}
                            />
                        )}
                        {currentPage === 'albumDetail' && currentNav.id && (
                            <AlbumDetail
                                token={token}
                                albumId={currentNav.id}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                                onNavigateTrack={(id: string) => onNavigateDetail('trackDetail', id)}
                            />
                        )}
                        {currentPage === 'playlistDetail' && currentNav.id && (
                            <PlaylistDetail
                                token={token}
                                playlistId={currentNav.id}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                                onNavigateTrack={(id: string) => onNavigateDetail('trackDetail', id)}
                            />
                        )}
                        {currentPage === 'trackDetail' && currentNav.id && (
                            <TrackDetail
                                token={token}
                                trackId={currentNav.id}
                                onNavigateArtist={(id: string) => onNavigateDetail('artistDetail', id)}
                                onNavigateAlbum={(id: string) => onNavigateDetail('albumDetail', id)}
                            />
                        )}
                        {currentPage === 'profile' && (
                            <ProfilePlaceholder profile={profile} />
                        )}
                        {currentPage === 'settings' && (
                            <SettingsPlaceholder />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </main>
    );
};

// ─── Home Page ────────────────────────────────────────────────────────────────
const HomePage = ({
    token, profile, onNavigateArtist, onNavigatePlaylist,
}: {
    token: string;
    profile: any;
    onNavigateArtist: (id: string) => void;
    onNavigatePlaylist: (id: string) => void;
}) => {
    const { playlists, topArtists, recentByArtist, isLoaded } = useLibraryStore();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bonjour';
        if (hour < 18) return 'Bon après-midi';
        return 'Bonsoir';
    };

    if (!isLoaded) return (
        <div className="page-loading">
            <div className="skeleton-pulse" style={{ width: 250, height: 40, borderRadius: 8, marginBottom: 32 }} />
            <div className="skeleton-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton-card">
                        <div className="skeleton-pulse" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 4 }} />
                        <div className="skeleton-pulse" style={{ width: '70%', height: 16, borderRadius: 4, marginTop: 12 }} />
                        <div className="skeleton-pulse" style={{ width: '50%', height: 12, borderRadius: 4, marginTop: 8 }} />
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="home-page">
            <h1 className="home-greeting">
                {getGreeting()}{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''} ✨
            </h1>

            {/* Quick access playlists */}
            {playlists.length > 0 && (
                <div className="quick-access-grid">
                    {playlists.slice(0, 6).map((playlist: any) => (
                        <motion.div
                            key={playlist.id}
                            className="quick-access-item"
                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                            onClick={() => onNavigatePlaylist(playlist.id)}
                        >
                            {playlist.images?.[0]?.url && (
                                <img src={playlist.images[0].url} alt="" className="quick-access-img" />
                            )}
                            <span className="quick-access-name">{playlist.name}</span>
                            <motion.button
                                className="quick-access-play"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playContext(token, `spotify:playlist:${playlist.id}`);
                                }}
                            >
                                <Play fill="black" size={16} />
                            </motion.button>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Top Artists */}
            {topArtists.length > 0 && (
                <section className="home-section">
                    <h2 className="section-title">Tes incontournables</h2>
                    <div className="card-scroll-row">
                        {topArtists.slice(0, 8).map((artist: any) => (
                            <motion.div
                                key={artist.id}
                                className="card-item"
                                whileHover={{ scale: 1.03 }}
                                onClick={() => onNavigateArtist(artist.id)}
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
                                            playContext(token, `spotify:artist:${artist.id}`);
                                        }}
                                    >
                                        <Play fill="black" size={18} />
                                    </motion.button>
                                </div>
                                <div className="card-name">{artist.name}</div>
                                <div className="card-subtitle">Artiste</div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* Recent */}
            {recentByArtist.length > 0 && (
                <section className="home-section">
                    <h2 className="section-title">Écoutes récentes</h2>
                    <div className="card-scroll-row">
                        {recentByArtist.map((group: any) => (
                            <motion.div
                                key={group.artist.id}
                                className="card-item"
                                whileHover={{ scale: 1.03 }}
                                onClick={() => onNavigateArtist(group.artist.id)}
                            >
                                <div className="card-img-container">
                                    {group.lastImg
                                        ? <img src={group.lastImg} alt="" className="card-img" />
                                        : <div className="card-img-placeholder" />
                                    }
                                </div>
                                <div className="card-name">{group.artist.name}</div>
                                <div className="card-subtitle">{group.tracks.length} titre{group.tracks.length > 1 ? 's' : ''} récent{group.tracks.length > 1 ? 's' : ''}</div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

// ─── Profile Placeholder ──────────────────────────────────────────────────────
const ProfilePlaceholder = ({ profile }: { profile: any }) => (
    <div className="placeholder-page">
        <div className="profile-hero">
            {profile?.images?.[0]?.url && (
                <img src={profile.images[0].url} alt="" className="profile-avatar-large" />
            )}
            <h1>{profile?.display_name || 'Profil'}</h1>
            <p className="text-subdued">{profile?.product === 'premium' ? '✨ Premium' : 'Gratuit'} • {profile?.followers?.total || 0} abonné{(profile?.followers?.total || 0) > 1 ? 's' : ''}</p>
        </div>
    </div>
);

// ─── Settings Placeholder ─────────────────────────────────────────────────────
const SettingsPlaceholder = () => (
    <div className="placeholder-page">
        <h1>Paramètres</h1>
        <p className="text-subdued" style={{ marginTop: 16 }}>Cette page sera disponible prochainement.</p>
    </div>
);
