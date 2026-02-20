import { useEffect, useRef, useState, useCallback } from 'react';
import {
    Heart, Play, Pause, SkipBack, SkipForward,
    Repeat, Repeat1, Shuffle, Volume2, VolumeX,
    Mic2, ListMusic, MonitorSpeaker, X, Search, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    fetchPlaybackState,
    fetchQueue,
    fetchDevices,
    fetchLyrics,
    fetchProfile,
    playerPlay,
    playerPause,
    playerNext,
    playerPrevious,
    playerSeek,
    playerVolume,
    playerShuffle,
    playerRepeat,
    transferPlayback,
    checkSavedTracks,
    saveTrack,
    removeSavedTrack,
} from '../services/spotify';

declare global {
    interface Window {
        onSpotifyWebPlaybackSDKReady: () => void;
        Spotify: any;
    }
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
export const Topbar = ({
    token,
    onSearch,
    searchQuery = '',
    onHome
}: {
    token: string | null;
    onSearch?: (q: string) => void;
    searchQuery?: string;
    onHome?: () => void;
}) => {
    const [profile, setProfile] = useState<any>(null);
    const [searchFocused, setSearchFocused] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const handleLogout = () => {
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_expires_at');
        window.location.href = window.location.origin;
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!token) return;
        fetchProfile(token).then(setProfile).catch(() => { });
    }, [token]);

    const avatar = profile?.images?.[0]?.url;
    const initials = profile?.display_name?.slice(0, 2).toUpperCase() ?? '…';

    return (
        <header className="topbar">
            {/* Logo */}
            <div
                className="topbar__logo"
                onClick={onHome}
                style={{ cursor: 'pointer' }}
                title="Retour à l'accueil"
            >
                <svg viewBox="0 0 24 24" width="26" height="26" fill="#1db954">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                <span className="topbar__logo-text">Spotify</span>
            </div>

            {/* Nav links */}
            <nav className="topbar__nav">
                <a
                    href="#"
                    className="topbar__nav-link topbar__nav-link--active"
                    onClick={(e) => { e.preventDefault(); onHome?.(); }}
                >
                    Accueil
                </a>
                <a href="#" className="topbar__nav-link">Parcourir</a>
                <a href="#" className="topbar__nav-link">Radio</a>
                <a href="#" className="topbar__nav-link">Playlists ▾</a>
                <a href="#" className="topbar__nav-link">Activité</a>
            </nav>

            <div className={`topbar__search ${searchFocused ? 'topbar__search--focused' : ''}`}>
                <Search size={14} color={searchFocused ? 'white' : '#a7a7a7'} />
                <input
                    type="text"
                    placeholder="Artistes, titres ou podcasts"
                    className="topbar__search-input"
                    value={searchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={(e) => onSearch?.(e.target.value)}
                />
            </div>

            {/* Profile */}
            <div
                className="topbar__profile"
                ref={profileRef}
                onClick={() => setMenuOpen(!menuOpen)}
                style={{ cursor: 'pointer', position: 'relative' }}
            >
                {avatar
                    ? <img src={avatar} alt="" className="topbar__avatar" />
                    : <div className="topbar__avatar topbar__avatar--placeholder">{initials}</div>
                }
                {profile?.display_name && (
                    <span className="topbar__username">{profile.display_name}</span>
                )}

                <AnimatePresence>
                    {menuOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="topbar__menu"
                            style={{
                                position: 'absolute',
                                top: 'calc(100% + 8px)',
                                right: 0,
                                backgroundColor: '#282828',
                                borderRadius: '4px',
                                padding: '4px',
                                boxShadow: '0 16px 24px rgba(0,0,0,0.5)',
                                minWidth: '160px',
                                zIndex: 100
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={handleLogout}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    gap: '10px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <LogOut size={16} />
                                <span>Se déconnecter</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </header>
    );
};

const formatMs = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
};

type PanelType = 'queue' | 'lyrics' | 'devices' | null;

// ─── Panel: File d'attente ────────────────────────────────────────────────────
const QueuePanel = ({ token, currentTrack }: { token: string; currentTrack: any }) => {
    const [queue, setQueue] = useState<any>(null);

    useEffect(() => {
        fetchQueue(token).then(setQueue);
    }, [token, currentTrack?.id]);

    const items = queue?.queue?.slice(0, 20) ?? [];

    return (
        <div className="player-panel">
            <div className="panel-header"><span>File d'attente</span></div>
            <div className="panel-scroll">
                {currentTrack && (
                    <>
                        <div className="panel-section-label">En cours</div>
                        <div className="queue-item queue-item--active">
                            <img src={currentTrack.album?.images?.[2]?.url ?? currentTrack.album?.images?.[0]?.url} alt="" className="queue-thumb" />
                            <div className="queue-info">
                                <div className="queue-title">{currentTrack.name}</div>
                                <div className="queue-artist">{currentTrack.artists?.map((a: any) => a.name).join(', ')}</div>
                            </div>
                        </div>
                        <div className="panel-section-label" style={{ marginTop: 16 }}>Suivant</div>
                    </>
                )}
                {items.length === 0 && <div style={{ color: '#a7a7a7', fontSize: 13, padding: '8px 0' }}>File vide</div>}
                {items.map((item: any, i: number) => (
                    <div key={`${item.id}-${i}`} className="queue-item">
                        <img src={item.album?.images?.[2]?.url ?? item.album?.images?.[0]?.url} alt="" className="queue-thumb" />
                        <div className="queue-info">
                            <div className="queue-title">{item.name}</div>
                            <div className="queue-artist">{item.artists?.map((a: any) => a.name).join(', ')}</div>
                        </div>
                        <div className="queue-duration">{formatMs(item.duration_ms)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Panel: Paroles ───────────────────────────────────────────────────────────
const LyricsPanel = ({ token, track, progressMs }: { token: string; track: any; progressMs: number }) => {
    const [lyrics, setLyrics] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const activeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!track?.id) return;
        setLyrics(null);
        setLoading(true);
        fetchLyrics(token, track.id)
            .then(setLyrics)
            .catch(() => setLyrics(null))
            .finally(() => setLoading(false));
    }, [token, track?.id]);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [progressMs]);

    const lines: any[] = lyrics?.lyrics?.lines ?? [];
    const currentLine = lines.reduce((acc: any, line: any, i: number) => {
        if (parseInt(line.startTimeMs) <= progressMs) return i;
        return acc;
    }, 0);

    if (loading) return (
        <div className="player-panel">
            <div className="panel-header"><span>Paroles</span></div>
            <div style={{ padding: 24, color: '#a7a7a7', fontSize: 13 }}>Chargement…</div>
        </div>
    );

    if (!lyrics || lines.length === 0) return (
        <div className="player-panel">
            <div className="panel-header"><span>Paroles</span></div>
            <div style={{ padding: 24, color: '#a7a7a7', fontSize: 13 }}>
                {track ? 'Paroles non disponibles pour ce titre.' : 'Aucun titre en cours.'}
            </div>
        </div>
    );

    return (
        <div className="player-panel">
            <div className="panel-header"><span>Paroles</span></div>
            <div className="panel-scroll lyrics-scroll">
                {lines.map((line: any, i: number) => (
                    <div
                        key={i}
                        ref={i === currentLine ? activeRef : undefined}
                        className={`lyrics-line ${i === currentLine ? 'lyrics-line--active' : ''}`}
                    >
                        {line.words || '♪'}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Panel: Appareils ─────────────────────────────────────────────────────────
const DevicesPanel = ({ token, activeDeviceId, onTransfer }: {
    token: string;
    activeDeviceId: string | null;
    onTransfer: () => void;
}) => {
    const [devices, setDevices] = useState<any[]>([]);

    useEffect(() => {
        fetchDevices(token).then(d => setDevices(d?.devices ?? []));
    }, [token]);

    const handleTransfer = async (deviceId: string) => {
        await transferPlayback(token, deviceId);
        setTimeout(onTransfer, 600);
    };

    return (
        <div className="player-panel">
            <div className="panel-header"><span>Appareils</span></div>
            <div className="panel-scroll">
                {devices.length === 0 && (
                    <div style={{ color: '#a7a7a7', fontSize: 13, padding: '8px 0' }}>Aucun appareil actif</div>
                )}
                {devices.map((d: { id: string; name: string; type: string }) => (
                    <div
                        key={d.id}
                        className={`device-item ${d.id === activeDeviceId ? 'device-item--active' : ''}`}
                        onClick={() => d.id !== activeDeviceId && handleTransfer(d.id)}
                    >
                        <MonitorSpeaker size={18} color={d.id === activeDeviceId ? '#1db954' : '#a7a7a7'} />
                        <div className="queue-info">
                            <div className="queue-title" style={{ color: d.id === activeDeviceId ? '#1db954' : 'white' }}>
                                {d.name}
                            </div>
                            <div className="queue-artist">{d.type} {d.id === activeDeviceId ? '• Actif' : ''}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Player principal ─────────────────────────────────────────────────────────
export const Player = ({ token }: { token: string | null }) => {
    const [playbackState, setPlaybackState] = useState<any>(null);
    const [progressMs, setProgressMs] = useState(0);
    const [volume, setVolume] = useState(50);
    const [isSeeking, setIsSeeking] = useState(false);
    const [openPanel, setOpenPanel] = useState<PanelType>(null);
    const [isSaved, setIsSaved] = useState(false);
    const tokenRef = useRef(token);
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => { tokenRef.current = token; }, [token]);

    const fetchState = useCallback(async () => {
        if (!tokenRef.current) return;
        const state = await fetchPlaybackState(tokenRef.current);
        if (!state) return;
        setPlaybackState(state);
        setVolume(state.device?.volume_percent ?? 50);
        if (!isSeeking) setProgressMs(state.progress_ms ?? 0);
    }, [isSeeking]);

    useEffect(() => {
        if (!token) return;
        fetchState();
        const poll = setInterval(fetchState, 2000);
        return () => clearInterval(poll);
    }, [token, fetchState]);

    useEffect(() => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        if (playbackState?.is_playing && !isSeeking) {
            progressIntervalRef.current = setInterval(() => {
                setProgressMs(prev => Math.min(prev + 1000, playbackState?.item?.duration_ms ?? 0));
            }, 1000);
        }
        return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
    }, [playbackState?.is_playing, playbackState?.item?.id, isSeeking]);

    // ─── Check if current track is saved ───
    useEffect(() => {
        if (!tokenRef.current || !playbackState?.item?.id) {
            setIsSaved(false);
            return;
        }
        checkSavedTracks(tokenRef.current, [playbackState.item.id])
            .then((data: boolean[]) => setIsSaved(data[0] ?? false))
            .catch(() => setIsSaved(false));
    }, [playbackState?.item?.id]);

    const handlePlayPause = async () => {
        if (!tokenRef.current) return;
        if (playbackState?.is_playing) await playerPause(tokenRef.current);
        else await playerPlay(tokenRef.current);
        setTimeout(fetchState, 300);
    };

    const handleNext = async () => {
        if (!tokenRef.current) return;
        await playerNext(tokenRef.current);
        setTimeout(fetchState, 500);
    };

    const handlePrevious = async () => {
        if (!tokenRef.current) return;
        await playerPrevious(tokenRef.current);
        setTimeout(fetchState, 500);
    };

    const seekValueRef = useRef(0);
    const handleSeekStart = () => setIsSeeking(true);
    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        seekValueRef.current = Number(e.target.value);
        setProgressMs(Number(e.target.value));
    };
    const handleSeekEnd = async () => {
        if (!tokenRef.current) return;
        const pos = seekValueRef.current;
        setProgressMs(pos);
        setIsSeeking(false);
        await playerSeek(tokenRef.current, pos);
        setTimeout(fetchState, 300);
    };

    const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!tokenRef.current) return;
        const vol = Number(e.target.value);
        setVolume(vol);
        await playerVolume(tokenRef.current, vol);
    };

    const handleShuffle = async () => {
        if (!tokenRef.current) return;
        await playerShuffle(tokenRef.current, !playbackState?.shuffle_state);
        setTimeout(fetchState, 300);
    };

    const handleRepeat = async () => {
        if (!tokenRef.current) return;
        const states: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track'];
        const current = playbackState?.repeat_state ?? 'off';
        const next = states[(states.indexOf(current) + 1) % states.length];
        await playerRepeat(tokenRef.current, next);
        setTimeout(fetchState, 300);
    };

    const handleLike = async () => {
        if (!tokenRef.current || !playbackState?.item?.id) return;
        try {
            if (isSaved) {
                await removeSavedTrack(tokenRef.current, playbackState.item.id);
            } else {
                await saveTrack(tokenRef.current, playbackState.item.id);
            }
            setIsSaved(!isSaved);
        } catch (e) {
            console.error('Erreur lors de la mise à jour du like:', e);
        }
    };

    const togglePanel = (panel: PanelType) => {
        setOpenPanel(prev => prev === panel ? null : panel);
    };

    const track = playbackState?.item;
    const isPlaying = playbackState?.is_playing ?? false;
    const duration = track?.duration_ms ?? 0;
    const progressPct = duration > 0 ? (progressMs / duration) * 100 : 0;
    const shuffleOn = playbackState?.shuffle_state ?? false;
    const repeatState: 'off' | 'context' | 'track' = playbackState?.repeat_state ?? 'off';
    const activeDeviceId = playbackState?.device?.id ?? null;

    const RepeatIcon = repeatState === 'track' ? Repeat1 : Repeat;
    const repeatColor = repeatState !== 'off' ? '#1db954' : '#a7a7a7';

    return (
        <>
            <AnimatePresence>
                {openPanel && token && (
                    <motion.div
                        key={openPanel}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.18 }}
                        className="panel-overlay"
                    >
                        <button className="panel-close" onClick={() => setOpenPanel(null)}>
                            <X size={16} />
                        </button>
                        {openPanel === 'queue' && <QueuePanel token={token} currentTrack={track} />}
                        {openPanel === 'lyrics' && <LyricsPanel token={token} track={track} progressMs={progressMs} />}
                        {openPanel === 'devices' && (
                            <DevicesPanel token={token} activeDeviceId={activeDeviceId} onTransfer={fetchState} />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <footer className="player-bar">
                {/* ── Track info ── */}
                <div className="player-bar__left">
                    <div className="player-bar__cover">
                        {track?.album?.images?.[0]?.url && (
                            <img src={track.album.images[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                    </div>
                    <div className="player-bar__track-info">
                        <div className="player-bar__track-name">{track?.name || '—'}</div>
                        <div className="player-bar__track-artist">
                            {track?.artists?.map((a: any) => a.name).join(', ') || '—'}
                        </div>
                    </div>
                    <Heart
                        size={16}
                        fill={isSaved ? '#1db954' : 'none'}
                        color={isSaved ? '#1db954' : '#a7a7a7'}
                        onClick={handleLike}
                        style={{ flexShrink: 0, cursor: 'pointer', transition: 'all 0.2s ease' }}
                    />
                </div>

                {/* ── Controls + progress ── */}
                <div className="player-bar__center">
                    <div className="player-bar__controls">
                        <Shuffle size={16} color={shuffleOn ? '#1db954' : '#a7a7a7'} onClick={handleShuffle} style={{ cursor: 'pointer' }} />
                        <SkipBack size={18} fill="#a7a7a7" color="#a7a7a7" onClick={handlePrevious} style={{ cursor: 'pointer' }} />
                        <motion.button
                            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                            onClick={handlePlayPause}
                            className="player-bar__play-btn"
                        >
                            {isPlaying ? <Pause fill="black" size={18} /> : <Play fill="black" size={18} />}
                        </motion.button>
                        <SkipForward size={18} fill="#a7a7a7" color="#a7a7a7" onClick={handleNext} style={{ cursor: 'pointer' }} />
                        <RepeatIcon size={16} color={repeatColor} onClick={handleRepeat} style={{ cursor: 'pointer' }} />
                    </div>
                    <div className="player-bar__progress">
                        <span className="player-bar__time">{formatMs(progressMs)}</span>
                        <div className="player-bar__progress-track">
                            <div className="player-bar__progress-fill" style={{ width: `${progressPct}%` }} />
                            <input
                                type="range" min={0} max={duration} value={progressMs}
                                onMouseDown={handleSeekStart}
                                onChange={handleSeekChange}
                                onMouseUp={handleSeekEnd}
                                onTouchEnd={handleSeekEnd}
                                className="player-bar__seek-input"
                            />
                        </div>
                        <span className="player-bar__time">{formatMs(duration)}</span>
                    </div>
                </div>

                {/* ── Right controls ── */}
                <div className="player-bar__right">
                    <button className={`panel-btn ${openPanel === 'lyrics' ? 'panel-btn--active' : ''}`} onClick={() => togglePanel('lyrics')} title="Paroles">
                        <Mic2 size={16} />
                    </button>
                    <button className={`panel-btn ${openPanel === 'queue' ? 'panel-btn--active' : ''}`} onClick={() => togglePanel('queue')} title="File d'attente">
                        <ListMusic size={16} />
                    </button>
                    <button className={`panel-btn ${openPanel === 'devices' ? 'panel-btn--active' : ''}`} onClick={() => togglePanel('devices')} title="Appareils">
                        <MonitorSpeaker size={16} />
                    </button>
                    <div className="player-bar__volume">
                        {volume === 0 ? <VolumeX size={16} color="#a7a7a7" /> : <Volume2 size={16} color="#a7a7a7" />}
                        <div className="player-bar__volume-track">
                            <div className="player-bar__volume-fill" style={{ width: `${volume}%` }} />
                            <input
                                type="range" min={0} max={100} value={volume}
                                onChange={handleVolumeChange}
                                className="player-bar__seek-input"
                            />
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
};
