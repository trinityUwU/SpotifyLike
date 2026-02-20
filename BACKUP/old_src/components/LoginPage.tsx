import { motion } from 'framer-motion';
import { Music, Headphones, Radio, TrendingUp, ChevronRight } from 'lucide-react';
import { loginUrl } from '../services/spotify';

export const LoginPage = () => {
    const features = [
        {
            icon: Music,
            title: 'Musique illimitée',
            description: 'Accédez à des millions de morceaux'
        },
        {
            icon: Headphones,
            title: 'Écoute personnalisée',
            description: 'Playlists adaptées à vos goûts'
        },
        {
            icon: Radio,
            title: 'Radio & Découverte',
            description: 'De nouveaux sons chaque jour'
        },
        {
            icon: TrendingUp,
            title: 'Charts Mondiaux',
            description: 'Restez à jour avec les tendances'
        }
    ];

    return (
        <div className="login-root">
            <div className="login-bg-glow" />

            <div className="login-container">
                <motion.div
                    className="login-content"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="login-logo-section">
                        <div className="header-logo">
                            <svg viewBox="0 0 24 24" width="48" height="48" fill="#1db954">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                            </svg>
                            <span className="logo-text">Spotify</span>
                        </div>
                        <h1>Tout votre univers musical au même endroit.</h1>
                        <p className="login-subtitle">Une expérience fluide, locale et ultra-rapide.</p>

                        <motion.a
                            href={loginUrl}
                            className="login-btn-spotify"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <span>Se connecter avec Spotify</span>
                            <ChevronRight size={20} />
                        </motion.a>
                    </div>

                    <div className="login-features">
                        {features.map((f, i) => (
                            <motion.div
                                key={i}
                                className="feature-item"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                            >
                                <div className="feature-icon-wrapper">
                                    <f.icon size={24} color="#1db954" />
                                </div>
                                <div className="feature-text">
                                    <h3>{f.title}</h3>
                                    <p>{f.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>

            <div className="login-footer">
                <p>© 2026 SpotifyLIKE Core. No server overhead. Truly local.</p>
            </div>
        </div>
    );
};
