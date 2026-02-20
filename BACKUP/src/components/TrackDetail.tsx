import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Heart, ExternalLink, Clock, Music, Disc3, Mic2 } from 'lucide-react';
import {
    fetchTrack,
    fetchAudioFeatures,
    fetchArtist,
    fetchArtistTopTracks,
    fetchLyrics,
    playerPlay,
} from '../services/spotify';

interface TrackDetailProps {
    token: string;
    trackId: string;
    onBack: () => void;
    onNavigateTrack: (trackId: string) => void;
    onNavigateArtist?: (artistId: string) => void;
}

const formatMs = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Barre de stat audio (tempo, énergie, danceability, etc.)
const AudioStat = ({ label, value, max = 1, unit = '' }: { label: string; value: number; max?: number; unit?: string }) => {
    const pct = Math.round((value / max) * 100);
    return (
        <div className="audio-stat">
            <div className="audio-stat__label">{label}</div>
            <div className="audio-stat__bar-wrap">
                <motion.div
                    className="audio-stat__bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                />
            </div>
            <div className="audio-stat__value">
                {unit ? `${Math.round(value)}${unit}` : pct + '%'}
            </div>
        </div>
    );
};

// Carte de piste compacte pour "Autres titres de l'artiste"
const MiniTrackCard = ({ track, token, onNavigate }: { track: any; token: string; onNavigate: (id: string) => void }) => {
    const [hovered, setHovered] = useState(false);

    const playTrack = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await playerPlay(token, { uris: [track.uri] });
    };

    return (
        <motion.div
            className="mini-track"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={() => onNavigate(track.id)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
            <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url} alt="" className="mini-track__thumb" />
                <AnimatePresence>
                    {hovered && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="mini-track__play"
                            onClick={playTrack}
                        >
                            <Play fill="black" size={12} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
            <div className="mini-track__info">
                <div className="mini-track__name">{track.name}</div>
                <div className="mini-track__sub">{track.artists?.map((a: any) => a.name).join(', ')}</div>
            </div>
            <div className="mini-track__dur">{formatMs(track.duration_ms)}</div>
        </motion.div>
    );
};

export const TrackDetail = ({ token, trackId, onBack, onNavigateTrack, onNavigateArtist }: TrackDetailProps) => {
    const [track, setTrack] = useState<any>(null);
    const [features, setFeatures] = useState<any>(null);
    const [artist, setArtist] = useState<any>(null);
    const [artistTracks, setArtistTracks] = useState<any[]>([]);
    const [lyrics, setLyrics] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'lyrics'>('info');
    const [loading, setLoading] = useState(true);
    const [dominantColor, setDominantColor] = useState('#1f1f1f');

    useEffect(() => {
        setLoading(true);
        setTrack(null);
        setFeatures(null);
        setArtist(null);
        setLyrics(null);
        setActiveTab('info');

        Promise.all([
            fetchTrack(token, trackId),
            fetchAudioFeatures(token, trackId),
        ]).then(async ([trackData, featData]) => {
            setTrack(trackData);
            setFeatures(featData);
            if (trackData.artists?.[0]?.id) {
                const [artistData, topData] = await Promise.all([
                    fetchArtist(token, trackData.artists[0].id),
                    fetchArtistTopTracks(token, trackData.artists[0].id),
                ]);
                setArtist(artistData);
                setArtistTracks(topData.tracks?.slice(0, 6) ?? []);
            }
            // Paroles en parallèle
            fetchLyrics(token, trackId).then(setLyrics).catch(() => setLyrics(null));
            // Couleur dominante via l'image
            extractColor(trackData.album?.images?.[0]?.url);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [token, trackId]);

    const extractColor = (imageUrl: string) => {
        if (!imageUrl) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 10; canvas.height = 10;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, 10, 10);
            const data = ctx.getImageData(0, 0, 10, 10).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
            const count = data.length / 4;
            // Assombrir légèrement pour ne pas aveugler
            setDominantColor(`rgb(${Math.floor(r / count * 0.5)},${Math.floor(g / count * 0.5)},${Math.floor(b / count * 0.5)})`);
        };
    };

    const playNow = async () => {
        if (!track) return;
        await playerPlay(token, { uris: [track.uri] });
    };

    const keyMap: Record<number, string> = { 0: 'Do', 1: 'Do#', 2: 'Ré', 3: 'Ré#', 4: 'Mi', 5: 'Fa', 6: 'Fa#', 7: 'Sol', 8: 'Sol#', 9: 'La', 10: 'La#', 11: 'Si' };

    const lyricsLines: any[] = lyrics?.lyrics?.lines ?? [];

    if (loading) {
        return (
            <div className="track-detail track-detail--loading">
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

    if (!track) return null;

    return (
        <motion.div
            className="track-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
        >
            {/* Hero gradient depuis la couleur dominante */}
            <div
                className="track-detail__hero"
                style={{ background: `linear-gradient(180deg, ${dominantColor} 0%, #121212 100%)` }}
            >
                {/* Back button */}
                <motion.button
                    className="track-detail__back"
                    onClick={onBack}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <ArrowLeft size={18} />
                    <span>Retour</span>
                </motion.button>

                <div className="track-detail__hero-inner">
                    {/* Cover */}
                    <motion.div
                        className="track-detail__cover-wrap"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.05, duration: 0.4 }}
                    >
                        <img
                            src={track.album?.images?.[0]?.url}
                            alt={track.name}
                            className="track-detail__cover"
                        />
                        <div className="track-detail__cover-glow" style={{ background: dominantColor }} />
                    </motion.div>

                    {/* Meta */}
                    <motion.div
                        className="track-detail__meta"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                    >
                        <div className="track-detail__type">Titre</div>
                        <h1 className="track-detail__title">{track.name}</h1>
                        <div className="track-detail__artists">
                            {track.artists?.map((a: any, i: number) => (
                                <span key={a.id}>
                                    {i > 0 && <span style={{ color: '#a7a7a7' }}>, </span>}
                                    <span
                                        className="track-detail__artist-link"
                                        onClick={() => onNavigateArtist?.(a.id)}
                                    >{a.name}</span>
                                </span>
                            ))}
                        </div>
                        <div className="track-detail__album-line">
                            <Disc3 size={13} color="#a7a7a7" />
                            <span>{track.album?.name}</span>
                            <span className="track-detail__dot">·</span>
                            <span>{track.album?.release_date?.slice(0, 4)}</span>
                            <span className="track-detail__dot">·</span>
                            <Clock size={13} color="#a7a7a7" />
                            <span>{formatMs(track.duration_ms)}</span>
                        </div>

                        {/* Actions */}
                        <div className="track-detail__actions">
                            <motion.button
                                className="track-detail__play-btn"
                                onClick={playNow}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                            >
                                <Play fill="black" size={18} />
                                Écouter
                            </motion.button>
                            <motion.button className="track-detail__icon-btn" whileHover={{ scale: 1.1 }} title="Aimer">
                                <Heart size={20} />
                            </motion.button>
                            <motion.button
                                className="track-detail__icon-btn"
                                whileHover={{ scale: 1.1 }}
                                title="Ouvrir dans Spotify"
                                onClick={() => window.open(track.external_urls?.spotify, '_blank')}
                            >
                                <ExternalLink size={20} />
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Tabs */}
            <div className="track-detail__tabs">
                <button
                    className={`track-detail__tab ${activeTab === 'info' ? 'track-detail__tab--active' : ''}`}
                    onClick={() => setActiveTab('info')}
                >
                    <Music size={14} /> Informations
                </button>
                <button
                    className={`track-detail__tab ${activeTab === 'lyrics' ? 'track-detail__tab--active' : ''}`}
                    onClick={() => setActiveTab('lyrics')}
                >
                    <Mic2 size={14} /> Paroles
                </button>
            </div>

            <div className="track-detail__body">
                <AnimatePresence mode="wait">
                    {activeTab === 'info' && (
                        <motion.div
                            key="info"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="track-detail__grid"
                        >
                            {/* Popularité + infos album */}
                            <section className="td-section">
                                <h2 className="td-section__title">À propos</h2>
                                <div className="td-info-grid">
                                    <div className="td-info-item">
                                        <div className="td-info-label">Album</div>
                                        <div className="td-info-value">{track.album?.name}</div>
                                    </div>
                                    <div className="td-info-item">
                                        <div className="td-info-label">Sortie</div>
                                        <div className="td-info-value">{formatDate(track.album?.release_date)}</div>
                                    </div>
                                    <div className="td-info-item">
                                        <div className="td-info-label">Label</div>
                                        <div className="td-info-value">{track.album?.label || '—'}</div>
                                    </div>
                                    <div className="td-info-item">
                                        <div className="td-info-label">Popularité</div>
                                        <div className="td-info-value">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 4, background: '#333', borderRadius: 2, overflow: 'hidden' }}>
                                                    <motion.div
                                                        style={{ height: '100%', background: '#1db954', borderRadius: 2 }}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${track.popularity}%` }}
                                                        transition={{ duration: 0.8 }}
                                                    />
                                                </div>
                                                <span>{track.popularity}/100</span>
                                            </div>
                                        </div>
                                    </div>
                                    {features?.key !== undefined && (
                                        <div className="td-info-item">
                                            <div className="td-info-label">Tonalité</div>
                                            <div className="td-info-value">{keyMap[features.key]} {features.mode === 1 ? 'Majeur' : 'Mineur'}</div>
                                        </div>
                                    )}
                                    {features?.tempo && (
                                        <div className="td-info-item">
                                            <div className="td-info-label">Tempo</div>
                                            <div className="td-info-value">{Math.round(features.tempo)} BPM</div>
                                        </div>
                                    )}
                                    {features?.time_signature && (
                                        <div className="td-info-item">
                                            <div className="td-info-label">Mesure</div>
                                            <div className="td-info-value">{features.time_signature}/4</div>
                                        </div>
                                    )}
                                    <div className="td-info-item">
                                        <div className="td-info-label">Explicit</div>
                                        <div className="td-info-value">{track.explicit ? 'Oui' : 'Non'}</div>
                                    </div>
                                </div>
                            </section>

                            {/* Audio features */}
                            {features && (
                                <section className="td-section">
                                    <h2 className="td-section__title">Caractéristiques audio</h2>
                                    <div className="audio-stats">
                                        <AudioStat label="Danceability" value={features.danceability} />
                                        <AudioStat label="Énergie" value={features.energy} />
                                        <AudioStat label="Positivité" value={features.valence} />
                                        <AudioStat label="Acoustique" value={features.acousticness} />
                                        <AudioStat label="Voix" value={features.speechiness} />
                                        <AudioStat label="Live" value={features.liveness} />
                                        <AudioStat label="Instrumental" value={features.instrumentalness} />
                                        <AudioStat label="Tempo" value={features.tempo} max={220} unit=" BPM" />
                                    </div>
                                </section>
                            )}

                            {/* Artiste principal */}
                            {artist && (
                                <section className="td-section td-section--full">
                                    <h2 className="td-section__title">Artiste</h2>
                                    <div
                                        className="artist-card"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => onNavigateArtist?.(artist.id)}
                                    >
                                        <img
                                            src={artist.images?.[0]?.url}
                                            alt={artist.name}
                                            className="artist-card__img"
                                        />
                                        <div className="artist-card__info">
                                            <div className="artist-card__name">{artist.name}</div>
                                            <div className="artist-card__followers">
                                                {artist.followers?.total?.toLocaleString('fr-FR')} abonnés
                                            </div>
                                            <div className="artist-card__genres">
                                                {artist.genres?.slice(0, 4).map((g: string) => (
                                                    <span key={g} className="genre-tag">{g}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Top tracks de l'artiste */}
                            {artistTracks.length > 0 && (
                                <section className="td-section td-section--full">
                                    <h2 className="td-section__title">Autres titres de {track.artists?.[0]?.name}</h2>
                                    <div className="mini-tracks-list">
                                        {artistTracks.filter((t: any) => t.id !== trackId).map((t: any) => (
                                            <MiniTrackCard
                                                key={t.id}
                                                track={t}
                                                token={token}
                                                onNavigate={onNavigateTrack}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'lyrics' && (
                        <motion.div
                            key="lyrics"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="track-detail__lyrics-full"
                        >
                            {lyricsLines.length === 0 ? (
                                <div style={{ color: '#a7a7a7', fontSize: 15, padding: '40px 0' }}>
                                    Paroles non disponibles pour ce titre.
                                </div>
                            ) : (
                                lyricsLines.map((line: any, i: number) => (
                                    <motion.div
                                        key={i}
                                        className="full-lyrics-line"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.015, duration: 0.2 }}
                                    >
                                        {line.words || '♪'}
                                    </motion.div>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};
