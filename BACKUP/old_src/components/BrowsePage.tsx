/**
 * BrowsePage — Catégories Spotify réelles via GET /v1/browse/categories
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Play } from 'lucide-react';
import {
    fetchCategories,
    fetchCategoryPlaylists,
    fetchNewReleases,
    fetchFeaturedPlaylists,
    playContext,
} from '../services/spotify';

export const BrowsePage = ({
    token,
    onNavigatePlaylist,
}: {
    token: string;
    onNavigatePlaylist?: (id: string) => void;
}) => {
    const [categories, setCategories] = useState<any[]>([]);
    const [newReleases, setNewReleases] = useState<any[]>([]);
    const [featured, setFeatured] = useState<any[]>([]);
    const [selectedCat, setSelectedCat] = useState<string | null>(null);
    const [catPlaylists, setCatPlaylists] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        const load = async () => {
            setLoading(true);
            const catData = await fetchCategories(token, 40);
            if (catData?.categories?.items) setCategories(catData.categories.items);

            const newData = await fetchNewReleases(token, 10);
            if (newData?.albums?.items) setNewReleases(newData.albums.items);

            const featData = await fetchFeaturedPlaylists(token, 10);
            if (featData?.playlists?.items) setFeatured(featData.playlists.items);

            setLoading(false);
        };
        load();
    }, [token]);

    const handleCategoryClick = async (categoryId: string) => {
        if (selectedCat === categoryId) {
            setSelectedCat(null);
            setCatPlaylists([]);
            return;
        }
        setSelectedCat(categoryId);
        const data = await fetchCategoryPlaylists(token, categoryId, 10);
        setCatPlaylists(data?.playlists?.items ?? []);
    };

    const colors = [
        '#e13300', '#8d67ab', '#1e3264', '#ba5d07', '#509bf5',
        '#777777', '#e61e32', '#148a08', '#8c1932', '#477d95',
        '#b49bc8', '#e8115b', '#1b3d6f', '#bc5900', '#a0c3d2',
    ];

    if (loading) {
        return (
            <div className="browse-page">
                <h1 className="page-title">Parcourir</h1>
                <div className="skeleton-grid">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="skeleton-pulse" style={{ height: 150, borderRadius: 8 }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="browse-page">
            <h1 className="page-title"><Sparkles size={28} style={{ marginRight: 12 }} /> Parcourir tout</h1>

            {/* Featured Playlists */}
            {featured.length > 0 && (
                <section className="home-section">
                    <h2 className="section-title">Playlists à la une</h2>
                    <div className="card-scroll-row">
                        {featured.map((p: any) => (
                            <motion.div key={p.id} className="card-item" whileHover={{ scale: 1.03 }} onClick={() => onNavigatePlaylist?.(p.id)}>
                                <div className="card-img-container">
                                    {p.images?.[0]?.url ? <img src={p.images[0].url} alt="" className="card-img" /> : <div className="card-img-placeholder" />}
                                    <motion.button className="card-play-btn" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); playContext(token, `spotify:playlist:${p.id}`); }}>
                                        <Play fill="black" size={18} />
                                    </motion.button>
                                </div>
                                <div className="card-name">{p.name}</div>
                                <div className="card-subtitle">{p.description?.replace(/<[^>]*>/g, '')?.slice(0, 50)}</div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* New Releases */}
            {newReleases.length > 0 && (
                <section className="home-section">
                    <h2 className="section-title">Nouvelles sorties</h2>
                    <div className="card-scroll-row">
                        {newReleases.map((album: any) => (
                            <motion.div key={album.id} className="card-item" whileHover={{ scale: 1.03 }} onClick={() => onNavigatePlaylist?.(album.id)}>
                                <div className="card-img-container">
                                    {album.images?.[0]?.url ? <img src={album.images[0].url} alt="" className="card-img" /> : <div className="card-img-placeholder" />}
                                    <motion.button className="card-play-btn" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); playContext(token, `spotify:album:${album.id}`); }}>
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

            {/* Categories */}
            <section className="home-section">
                <h2 className="section-title">Catégories</h2>
                <div className="browse-grid">
                    {categories.map((cat: any, i: number) => (
                        <motion.div
                            key={cat.id}
                            className={`browse-card ${selectedCat === cat.id ? 'browse-card--active' : ''}`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleCategoryClick(cat.id)}
                            style={{ background: colors[i % colors.length] }}
                        >
                            <h3 className="browse-card__name">{cat.name}</h3>
                            {cat.icons?.[0]?.url && (
                                <img src={cat.icons[0].url} alt="" className="browse-card__icon" />
                            )}
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Category playlists */}
            {selectedCat && catPlaylists.length > 0 && (
                <motion.section
                    className="home-section"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h2 className="section-title">
                        Playlists — {categories.find(c => c.id === selectedCat)?.name}
                    </h2>
                    <div className="card-scroll-row">
                        {catPlaylists.map((p: any) => (
                            <motion.div key={p.id} className="card-item" whileHover={{ scale: 1.03 }} onClick={() => onNavigatePlaylist?.(p.id)}>
                                <div className="card-img-container">
                                    {p.images?.[0]?.url ? <img src={p.images[0].url} alt="" className="card-img" /> : <div className="card-img-placeholder" />}
                                    <motion.button className="card-play-btn" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); playContext(token, `spotify:playlist:${p.id}`); }}>
                                        <Play fill="black" size={18} />
                                    </motion.button>
                                </div>
                                <div className="card-name">{p.name}</div>
                                <div className="card-subtitle">{p.description?.replace(/<[^>]*>/g, '')?.slice(0, 50)}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>
            )}
        </div>
    );
};
