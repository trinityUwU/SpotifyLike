/**
 * SearchPage — Recherche Spotify complète
 * Utilise GET /v1/search avec debounce
 */
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search as SearchIcon, Play, Music, User, Disc } from 'lucide-react';
import { search, playTracks, playContext } from '../services/spotify';

interface SearchPageProps {
    token: string;
    query: string;
    onNavigateArtist: (id: string) => void;
    onNavigateAlbum: (id: string) => void;
    onNavigatePlaylist: (id: string) => void;
    onNavigateTrack: (id: string) => void;
}

const formatMs = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
};

export const SearchPage = ({
    token, query, onNavigateArtist, onNavigateAlbum, onNavigatePlaylist, onNavigateTrack,
}: SearchPageProps) => {
    const [results, setResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const lastQueryRef = useRef('');

    useEffect(() => {
        if (!query || query.trim().length < 2 || query === lastQueryRef.current) return;
        lastQueryRef.current = query;
        setLoading(true);
        search(token, query, ['track', 'artist', 'album', 'playlist'], 10)
            .then(data => {
                setResults(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [token, query]);

    const tracks = results?.tracks?.items ?? [];
    const artists = results?.artists?.items ?? [];
    const albums = results?.albums?.items ?? [];
    const playlists = results?.playlists?.items ?? [];

    if (!query || query.trim().length < 2) {
        return (
            <div className="search-page">
                <div className="search-empty">
                    <SearchIcon size={48} color="#a7a7a7" />
                    <p>Recherchez des artistes, titres, albums ou playlists</p>
                </div>
            </div>
        );
    }

    if (loading && !results) {
        return (
            <div className="search-page">
                <h1 className="page-title">Résultats pour « {query} »</h1>
                <div className="skeleton-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton-pulse" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 4 }} />
                            <div className="skeleton-pulse" style={{ width: '70%', height: 14, borderRadius: 4, marginTop: 12 }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="search-page">
            <h1 className="page-title">Résultats pour « {query} »</h1>

            {/* Tracks */}
            {tracks.length > 0 && (
                <section className="search-section">
                    <h2 className="section-title">Titres</h2>
                    <div className="track-list">
                        {tracks.map((track: any, i: number) => (
                            <motion.div
                                key={track.id}
                                className="track-row"
                                whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                                onClick={() => onNavigateTrack(track.id)}
                            >
                                <span className="track-row__index">{i + 1}</span>
                                <img src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url} alt="" className="track-row__cover" />
                                <div className="track-row__info">
                                    <div className="track-row__name">{track.name}</div>
                                    <div className="track-row__artist">{track.artists?.map((a: any) => a.name).join(', ')}</div>
                                </div>
                                <span className="track-row__album">{track.album?.name}</span>
                                <span className="track-row__duration">{formatMs(track.duration_ms)}</span>
                                <motion.button
                                    className="track-row__play"
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playTracks(token, [track.uri]);
                                    }}
                                >
                                    <Play fill="white" size={14} />
                                </motion.button>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* Artists */}
            {artists.length > 0 && (
                <section className="search-section">
                    <h2 className="section-title">Artistes</h2>
                    <div className="card-scroll-row">
                        {artists.map((artist: any) => (
                            <motion.div
                                key={artist.id}
                                className="card-item"
                                whileHover={{ scale: 1.03 }}
                                onClick={() => onNavigateArtist(artist.id)}
                            >
                                <div className="card-img-container card-img-round">
                                    {artist.images?.[0]?.url
                                        ? <img src={artist.images[0].url} alt="" className="card-img" />
                                        : <div className="card-img-placeholder"><User size={32} color="#666" /></div>
                                    }
                                </div>
                                <div className="card-name">{artist.name}</div>
                                <div className="card-subtitle">Artiste</div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* Albums */}
            {albums.length > 0 && (
                <section className="search-section">
                    <h2 className="section-title">Albums</h2>
                    <div className="card-scroll-row">
                        {albums.map((album: any) => (
                            <motion.div
                                key={album.id}
                                className="card-item"
                                whileHover={{ scale: 1.03 }}
                                onClick={() => onNavigateAlbum(album.id)}
                            >
                                <div className="card-img-container">
                                    {album.images?.[0]?.url
                                        ? <img src={album.images[0].url} alt="" className="card-img" />
                                        : <div className="card-img-placeholder"><Disc size={32} color="#666" /></div>
                                    }
                                    <motion.button
                                        className="card-play-btn"
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            playContext(token, `spotify:album:${album.id}`);
                                        }}
                                    >
                                        <Play fill="black" size={18} />
                                    </motion.button>
                                </div>
                                <div className="card-name">{album.name}</div>
                                <div className="card-subtitle">{album.artists?.map((a: any) => a.name).join(', ')}</div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* Playlists */}
            {playlists.length > 0 && (
                <section className="search-section">
                    <h2 className="section-title">Playlists</h2>
                    <div className="card-scroll-row">
                        {playlists.map((playlist: any) => (
                            <motion.div
                                key={playlist.id}
                                className="card-item"
                                whileHover={{ scale: 1.03 }}
                                onClick={() => onNavigatePlaylist(playlist.id)}
                            >
                                <div className="card-img-container">
                                    {playlist.images?.[0]?.url
                                        ? <img src={playlist.images[0].url} alt="" className="card-img" />
                                        : <div className="card-img-placeholder"><Music size={32} color="#666" /></div>
                                    }
                                </div>
                                <div className="card-name">{playlist.name}</div>
                                <div className="card-subtitle">Par {playlist.owner?.display_name || 'Spotify'}</div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {tracks.length === 0 && artists.length === 0 && albums.length === 0 && playlists.length === 0 && (
                <div className="search-empty">
                    <SearchIcon size={48} color="#a7a7a7" />
                    <p>Aucun résultat pour « {query} »</p>
                </div>
            )}
        </div>
    );
};
