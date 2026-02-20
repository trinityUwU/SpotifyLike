import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Music, Clock, Lock, ExternalLink, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchPlaylist, fetchLikedSongs, fetchPlaylistWithMarket, fetchPlaylistItems, fetchPlaylistTracks, playerPlay, fetchAlbum, fetchShow, fetchEpisode, extractTrackFromItem } from '../services/spotify';

interface PlaylistDetailProps {
    token: string;
    playlistId: string;
    type?: 'playlist' | 'album' | 'show' | 'episode';
    onBack: () => void;
    onNavigateTrack: (trackId: string) => void;
    onNavigateArtist: (artistId: string) => void;
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

const TrackRow = ({
    track, index, token, onNavigate, onNavigateArtist
}: { track: any; index: number; token: string; onNavigate: (id: string) => void; onNavigateArtist: (id: string) => void }) => {
    const [hovered, setHovered] = useState(false);

    if (!track) return null;

    const playTrack = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await playerPlay(token, { uris: [track.uri] });
    };

    return (
        <motion.div
            className="pd-track-row"
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onClick={() => onNavigate(track.id)}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 1fr 100px 60px',
                alignItems: 'center',
                padding: '8px 12px',
                gap: '12px',
                borderRadius: 4,
                cursor: 'pointer'
            }}
        >
            <div className="pd-track-row__num" style={{ textAlign: 'center' }}>
                <AnimatePresence mode="wait">
                    {hovered ? (
                        <motion.button key="play"
                            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.1 }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={playTrack}
                        >
                            <Play fill="white" size={13} color="white" />
                        </motion.button>
                    ) : (
                        <motion.span key="idx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ color: '#a7a7a7', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                            {index + 1}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                {(track.album?.images?.[2]?.url || track.album?.images?.[0]?.url) && (
                    <img
                        src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url}
                        alt=""
                        style={{ width: '40px', height: '40px', borderRadius: '4px', flexShrink: 0 }}
                    />
                )}
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 500, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {track.name}
                    </div>
                    <div style={{ color: '#a7a7a7', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {track.artists?.map((a: any, i: number) => (
                            <span
                                key={a.id || i}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (a.id) onNavigateArtist(a.id);
                                }}
                                style={{ cursor: a.id ? 'pointer' : 'default' }}
                                onMouseEnter={(e) => a.id && (e.currentTarget.style.color = 'white')}
                                onMouseLeave={(e) => a.id && (e.currentTarget.style.color = '#a7a7a7')}
                            >
                                {a.name}{i < track.artists.length - 1 ? ', ' : ''}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ color: '#a7a7a7', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {track.album?.name || track.show?.name || '-'}
            </div>

            <div style={{ position: 'relative', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                {track.popularity > 0 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${track.popularity}%`, background: '#1db954' }} />
                )}
            </div>

            <div style={{ textAlign: 'right', color: '#a7a7a7', fontSize: '14px' }}>
                {formatMs(track.duration_ms)}
            </div>
        </motion.div>
    );
};

export const PlaylistDetail = ({ token, playlistId, type = 'playlist', onBack, onNavigateTrack, onNavigateArtist }: PlaylistDetailProps) => {
    const [playlist, setPlaylist] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const itemsPerPage = 100;

    useEffect(() => {
        setLoading(true);
        setError(null);
        setPlaylist(null);
        setCurrentPage(1);
        setSearchQuery('');

        const load = async () => {
            try {
                let data: any;

                if (playlistId === 'liked-songs') {
                    data = await fetchLikedSongs(token);
                } else if (type === 'album') {
                    data = await fetchAlbum(token, playlistId);
                } else if (type === 'show') {
                    data = await fetchShow(token, playlistId);
                } else if (type === 'episode') {
                    // Pour un épisode seul, on crée un container simulé
                    const ep = await fetchEpisode(token, playlistId);
                    data = {
                        ...ep,
                        name: ep.name,
                        images: ep.images,
                        episodes: { items: [ep], total: 1 }
                    };
                } else {
                    // Playlist standard ou Radio
                    try {
                        data = await fetchPlaylist(token, playlistId);
                    } catch (e: any) {
                        if (e.message === 'FORBIDDEN') {
                            console.warn(`[PlaylistDetail] fetchPlaylist 403, tentative directe /items...`);
                            const itemsData = await fetchPlaylistItems(token, playlistId);
                            data = {
                                id: playlistId,
                                name: 'Playlist',
                                description: 'Données récupérées via mode dégradé',
                                images: [],
                                items: itemsData,
                                owner: { display_name: 'Spotify' },
                            };
                        } else {
                            throw e;
                        }
                    }
                }

                // ─── Normalisation du format Spotify ──────────────────────────────
                // Nouveau format (fév 2026 - playlists tierces) : data.items.items
                // Ancien format (owned / liked-songs / albums)  : data.tracks.items
                // On détecte automatiquement et on unifie vers `allItems`.

                const isAlbum = type === 'album';
                const isShow = type === 'show' || !!data?.episodes;

                // Le nouveau format (fév 2026) retourne data.items (objet paginé), pas data.tracks
                const hasNewFormat = data?.items !== undefined && data?.tracks === undefined && !isAlbum && !isShow;

                let allItems: any[];
                let nextUrl: string | null;
                let total: number;

                if (isAlbum) {
                    allItems = data.tracks?.items || data.items || [];
                    nextUrl = data.tracks?.next || data.next || null;
                    total = data.tracks?.total || allItems.length;
                } else if (isShow) {
                    // Pour les podcasts (Shows)
                    const page = data.episodes;
                    allItems = page?.items || [];
                    nextUrl = page?.next || null;
                    total = page?.total || allItems.length;
                } else if (hasNewFormat) {
                    // Nouveau format : data.items est l'objet page avec items/next/total
                    const page = data.items;
                    allItems = Array.isArray(page) ? page : (page?.items || []);
                    nextUrl = page?.next || null;
                    total = page?.total || allItems.length;
                } else {
                    // Ancien format
                    allItems = data.tracks?.items || [];
                    nextUrl = data.tracks?.next || null;
                    total = data.tracks?.total || allItems.length;
                }

                console.log(`[PlaylistDetail] Format: ${hasNewFormat ? 'nouveau API (items)' : 'ancien (tracks)'} | items: ${allItems.length} | total: ${total}`);

                // Fallback si items vides : essaie /items (nouveau) puis /tracks (ancien)
                if (type === 'playlist' && playlistId !== 'liked-songs' && allItems.length === 0) {
                    console.warn(`[PlaylistDetail] Items vides, tentative fallback /items...`);
                    try {
                        const itemsData = await fetchPlaylistItems(token, playlistId);
                        if (itemsData?.items?.length > 0) {
                            allItems = itemsData.items;
                            nextUrl = itemsData.next;
                            total = itemsData.total || allItems.length;
                            console.log(`[PlaylistDetail] Fallback /items OK: ${allItems.length} tracks`);
                        }
                    } catch {
                        try {
                            const tracksData = await fetchPlaylistTracks(token, playlistId);
                            if (tracksData?.items?.length > 0) {
                                allItems = tracksData.items;
                                nextUrl = tracksData.next;
                                total = tracksData.total || allItems.length;
                                console.log(`[PlaylistDetail] Fallback /tracks OK: ${allItems.length} tracks`);
                            }
                        } catch {
                            console.warn('[PlaylistDetail] Les deux fallbacks ont échoué, playlist vide');
                        }
                    }
                }

                // Récupérer les pages suivantes (pagination)
                let pages = 0;
                while (nextUrl && pages < 20) {
                    console.log(`[PlaylistDetail] Pagination page ${pages + 1}:`, nextUrl);
                    try {
                        const nextData = await fetchPlaylistWithMarket(token, nextUrl);
                        allItems = [...allItems, ...(nextData.items || [])];
                        nextUrl = nextData.next;
                    } catch (pageErr: any) {
                        console.warn(`[PlaylistDetail] Erreur page ${pages + 1}:`, pageErr.message);
                        break;
                    }
                    pages++;
                }

                // Debug : structure du premier item pour diagnostiquer le format
                if (allItems.length > 0) {
                    const first = allItems[0];
                    console.log(`[PlaylistDetail] Structure item[0]:`, {
                        hasItem: !!first?.item,     // nouveau : items.item
                        hasTrack: !!first?.track,   // ancien : items.track
                        isDirect: !!(first?.artists || first?.album), // direct track
                        name: first?.name || first?.track?.name || first?.item?.name || '?',
                    });
                }

                // Normaliser vers un format interne cohérent (on utilise `tracks` en interne)
                setPlaylist({
                    ...data,
                    tracks: {
                        items: allItems,
                        total,
                        next: null, // déjà tout récupéré
                    }
                });
                setLoading(false);

            } catch (err: any) {
                console.error('[PlaylistDetail] Erreur chargement:', err);
                if (err.message === 'FORBIDDEN') {
                    setError("Accès refusé. Cette playlist est privée ou vous n'avez pas les droits.");
                } else if (err.message === 'NOT_FOUND') {
                    setError("Playlist introuvable.");
                } else if (err.message?.startsWith('RATE_LIMIT_EXCEEDED')) {
                    setError("Trop de requêtes Spotify. Veuillez patienter quelques instants.");
                } else {
                    setError("Une erreur est survenue lors du chargement.");
                }
                setLoading(false);
            }
        };

        load();
    }, [token, playlistId, type]);

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ color: '#a7a7a7', fontSize: 14 }}>Chargement…</motion.div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a7a7a7', gap: '16px' }}>
                <Lock size={48} />
                <div style={{ fontSize: 16, fontWeight: 600 }}>{error}</div>
                <motion.button onClick={onBack} whileHover={{ scale: 1.05 }} style={{ background: 'none', border: '1px solid #444', color: 'white', padding: '8px 24px', borderRadius: '500px', cursor: 'pointer' }}>
                    Retour
                </motion.button>
            </div>
        );
    }

    if (!playlist) return null;

    const heroImg = playlist.images?.[0]?.url;

    // Extraire les tracks : utilise extractTrackFromItem qui gère les 3 formats :
    // item.item (nouveau API 2026), item.track (ancien alias), et direct (albums)
    const allTracks = (playlist.tracks?.items || [])
        .map((item: any) => extractTrackFromItem(item))
        .filter(Boolean);

    const filteredTracks = allTracks.filter((t: any) => {
        if (!t || !t.name) return false;
        const query = searchQuery.toLowerCase();
        return t.name.toLowerCase().includes(query) ||
            t.artists?.some((a: any) => a.name?.toLowerCase().includes(query)) ||
            t.album?.name?.toLowerCase().includes(query);
    });

    const totalPages = Math.ceil(filteredTracks.length / itemsPerPage);
    const paginatedTracks = filteredTracks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalTracks = playlist.tracks?.total ?? allTracks.length;

    return (
        <motion.div
            className="pd-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
                minHeight: '100%',
                display: 'grid',
                gridTemplateColumns: 'minmax(300px, 1fr) 2fr',
                backgroundColor: '#0a0a0a',
                color: 'white',
            }}
        >
            {/* ── Left : photo et info ── */}
            <div style={{
                position: 'sticky',
                top: 0,
                height: '100vh',
                padding: '40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                overflowY: 'auto',
            }}>
                <div style={{ width: '100%', marginBottom: '24px' }}>
                    <motion.button
                        onClick={onBack}
                        whileHover={{ x: -4 }}
                        style={{ background: 'none', border: 'none', color: '#a7a7a7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13 }}
                    >
                        <ArrowLeft size={16} /> Retour
                    </motion.button>
                </div>

                <div style={{
                    width: '100%',
                    aspectRatio: '1/1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                    marginBottom: '32px'
                }}>
                    {heroImg ? (
                        <img src={heroImg} alt={playlist.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', background: '#282828', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Music size={64} color="#666" />
                        </div>
                    )}
                </div>

                <div style={{ textAlign: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                        <h1 style={{ fontSize: '28px', fontWeight: 900, lineHeight: 1.2, margin: 0 }}>{playlist.name}</h1>
                        {playlist.external_urls?.spotify && (
                            <motion.button
                                onClick={() => window.open(playlist.external_urls.spotify, '_blank')}
                                whileHover={{ scale: 1.1 }}
                                style={{ background: 'none', border: 'none', color: '#a7a7a7', cursor: 'pointer' }}
                            >
                                <ExternalLink size={16} />
                            </motion.button>
                        )}
                    </div>
                    <div style={{ color: '#a7a7a7', fontSize: '14px', marginBottom: '24px' }}>
                        Par {playlist.owner?.display_name || 'Spotify'}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '4px', fontSize: 12 }}>
                            {totalTracks} titres
                        </div>
                        {playlist.followers?.total > 0 && (
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '4px', fontSize: 12 }}>
                                {formatNumber(playlist.followers.total)} j&apos;aime
                            </div>
                        )}
                        {playlist.public === false && (
                            <div style={{ background: 'rgba(29,185,84,0.1)', color: '#1db954', padding: '6px 12px', borderRadius: '4px', fontSize: 12, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Lock size={12} /> Privé
                            </div>
                        )}
                    </div>

                    <motion.button
                        style={{
                            background: '#1db954',
                            color: 'black',
                            border: 'none',
                            borderRadius: '500px',
                            padding: '14px 40px',
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            margin: '0 auto'
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={async () => {
                            if (playlist.uri) {
                                await playerPlay(token, { context_uri: playlist.uri });
                            } else if (allTracks[0]) {
                                await playerPlay(token, { uris: [allTracks[0].uri] });
                            }
                        }}
                    >
                        <Play fill="black" size={18} /> LIRE
                    </motion.button>
                </div>

                {playlist.description && (
                    <div style={{ marginTop: '24px', width: '100%', color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
                        {playlist.description.replace(/<[^>]*>?/gm, '')}
                    </div>
                )}
            </div>

            {/* ── Right : Titres ── */}
            <div style={{ padding: '40px', overflowY: 'auto', maxHeight: '100vh', scrollbarWidth: 'thin' }}>
                {/* Search Bar */}
                <div style={{ marginBottom: '32px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#a7a7a7' }} />
                    <input
                        type="text"
                        placeholder="Rechercher dans la playlist"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        style={{
                            width: '100%',
                            background: '#242424',
                            border: '1px solid transparent',
                            borderRadius: '500px',
                            padding: '12px 12px 12px 48px',
                            color: 'white',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Header colonnes */}
                <div style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 1fr 100px 60px',
                    padding: '0 12px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    marginBottom: '16px',
                    color: '#a7a7a7',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.1em'
                }}>
                    <div style={{ textAlign: 'center' }}>#</div>
                    <div>TITRE</div>
                    <div>ALBUM</div>
                    <div style={{ textAlign: 'center' }}>POPULARITÉ</div>
                    <div style={{ textAlign: 'right' }}><Clock size={16} style={{ display: 'inline' }} /></div>
                </div>

                {paginatedTracks.map((track: any, i: number) => (
                    <TrackRow
                        key={`${track?.id || 'none'}-${(currentPage - 1) * itemsPerPage + i}`}
                        track={track}
                        index={(currentPage - 1) * itemsPerPage + i}
                        token={token}
                        onNavigate={onNavigateTrack}
                        onNavigateArtist={onNavigateArtist}
                    />
                ))}

                {paginatedTracks.length === 0 && (
                    <div style={{ padding: '80px 0', textAlign: 'center', color: '#a7a7a7' }}>
                        {searchQuery ? "Aucun résultat trouvé." : "Cette playlist est vide ou ses contenus ne sont pas disponibles dans votre région."}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', marginTop: '40px' }}>
                        <motion.button
                            disabled={currentPage === 1}
                            onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); }}
                            whileHover={currentPage !== 1 ? { scale: 1.1 } : {}}
                            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: currentPage === 1 ? '#444' : 'white', cursor: currentPage === 1 ? 'default' : 'pointer', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <ChevronLeft />
                        </motion.button>
                        <span style={{ color: '#a7a7a7', fontSize: 14 }}>Page {currentPage} sur {totalPages}</span>
                        <motion.button
                            disabled={currentPage === totalPages}
                            onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                            whileHover={currentPage !== totalPages ? { scale: 1.1 } : {}}
                            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: currentPage === totalPages ? '#444' : 'white', cursor: currentPage === totalPages ? 'default' : 'pointer', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <ChevronRight />
                        </motion.button>
                    </div>
                )}

                <div style={{ height: 100 }} />
            </div>
        </motion.div>
    );
};
