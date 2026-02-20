/**
 * PlaylistsPage — Utilise le store partagé (plus de fetch dupliqué)
 */
import { motion } from 'framer-motion';
import { ListMusic, Play, Lock } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { playContext } from '../services/spotify';

export const PlaylistsPage = ({
    token,
    onNavigatePlaylist,
}: {
    token: string;
    onNavigatePlaylist?: (id: string) => void;
}) => {
    const { playlists, isLoaded } = useLibraryStore();

    if (!isLoaded) {
        return (
            <div className="playlists-page">
                <h1 className="page-title"><ListMusic size={28} style={{ marginRight: 12 }} /> Playlists</h1>
                <div className="skeleton-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton-pulse" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 4 }} />
                            <div className="skeleton-pulse" style={{ width: '70%', height: 14, borderRadius: 4, marginTop: 12 }} />
                            <div className="skeleton-pulse" style={{ width: '50%', height: 12, borderRadius: 4, marginTop: 6 }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="playlists-page">
            <div className="page-header">
                <ListMusic size={36} color="#1db954" />
                <div>
                    <h1 className="page-title" style={{ marginBottom: 4 }}>Playlists</h1>
                    <p className="text-subdued">{playlists.length} playlist{playlists.length > 1 ? 's' : ''}</p>
                </div>
            </div>

            {playlists.length > 0 ? (
                <div className="playlist-grid">
                    {playlists.map((playlist: any) => (
                        <motion.div
                            key={playlist.id}
                            className="card-item card-item--vertical"
                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                            onClick={() => onNavigatePlaylist?.(playlist.id)}
                        >
                            <div className="card-img-container">
                                {playlist.images?.[0]?.url ? (
                                    <img src={playlist.images[0].url} alt="" className="card-img" />
                                ) : (
                                    <div className="card-img-placeholder">
                                        <ListMusic size={36} color="#666" />
                                    </div>
                                )}
                                <motion.button
                                    className="card-play-btn"
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playContext(token, `spotify:playlist:${playlist.id}`);
                                    }}
                                >
                                    <Play fill="black" size={18} />
                                </motion.button>
                            </div>
                            <div className="card-name">{playlist.name}</div>
                            <div className="card-subtitle">
                                {playlist.public === false && <Lock size={11} style={{ marginRight: 4 }} />}
                                Par {playlist.owner?.display_name || 'Spotify'}
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="search-empty">
                    <ListMusic size={48} color="#a7a7a7" />
                    <p>Aucune playlist pour le moment</p>
                </div>
            )}
        </div>
    );
};
