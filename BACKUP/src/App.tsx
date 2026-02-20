import { useEffect, useState, useCallback } from 'react';
import { Topbar, Player } from './components/SpotifyLayout';
import { MainContent } from './components/MainContent';
import { getTokenFromUrl } from './services/spotify';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [homeResetCounter, setHomeResetCounter] = useState(0);

  const goHome = useCallback(() => {
    setSearchQuery('');
    setHomeResetCounter(prev => prev + 1);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_expires_at');
    setToken(null);
  }, []);

  const refreshAccessToken = useCallback(async (refreshToken: string) => {
    try {
      const response = await fetch('http://127.0.0.1:3001/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const data = await response.json();
      if (data.error) { clearSession(); return; }
      if (data.access_token) {
        setToken(data.access_token);
        localStorage.setItem('spotify_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
        localStorage.setItem('spotify_expires_at', String(Date.now() + (data.expires_in || 3600) * 1000));
      }
    } catch (error) {
      console.error('Erreur réseau lors du refresh du token:', error);
    }
  }, [clearSession]);

  useEffect(() => {
    const isValidAccessToken = (t: string) => t.length > 50 && !(/^[0-9a-f]{32}$/i.test(t));

    const envToken = import.meta.env.VITE_SPOTIFY_ACCESS_TOKEN?.trim();
    if (envToken && isValidAccessToken(envToken)) { setToken(envToken); return; }

    const hash = getTokenFromUrl();
    window.location.hash = "";
    const urlToken = hash.access_token;
    const urlRefreshToken = hash.refresh_token;

    if (urlToken && isValidAccessToken(urlToken)) {
      setToken(urlToken);
      localStorage.setItem("spotify_token", urlToken);
      if (urlRefreshToken) localStorage.setItem("spotify_refresh_token", urlRefreshToken);
      const expiresIn = parseInt(hash.expires_in) || 3600;
      localStorage.setItem('spotify_expires_at', String(Date.now() + expiresIn * 1000));
    } else {
      const localToken = localStorage.getItem("spotify_token");
      if (localToken && !isValidAccessToken(localToken)) { clearSession(); return; }
      if (localToken) {
        const expiresAt = localStorage.getItem('spotify_expires_at');
        if (expiresAt && Date.now() > parseInt(expiresAt)) {
          const refreshTokenValue = localStorage.getItem('spotify_refresh_token');
          if (refreshTokenValue) refreshAccessToken(refreshTokenValue);
          else clearSession();
        } else {
          setToken(localToken);
        }
      }
    }
  }, [refreshAccessToken, clearSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      const expiresAt = localStorage.getItem('spotify_expires_at');
      const refreshTokenValue = localStorage.getItem('spotify_refresh_token');
      if (expiresAt && refreshTokenValue && Date.now() > parseInt(expiresAt) - 300000) {
        refreshAccessToken(refreshTokenValue);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshAccessToken]);

  return (
    <div className="app-container">
      <Topbar
        token={token}
        onSearch={setSearchQuery}
        searchQuery={searchQuery}
        onHome={goHome}
      />
      <main className="main-content">
        <MainContent
          token={token}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery('')}
          homeResetCounter={homeResetCounter}
        />
      </main>
      <Player token={token} />
    </div>
  );
}

export default App;
