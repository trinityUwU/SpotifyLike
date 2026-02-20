import { useEffect, useState, useCallback } from 'react';
import { Topbar, Player } from './components/SpotifyLayout';
import { MainContent } from './components/MainContent';
import { LoginPage } from './components/LoginPage';
import { useAuthStore } from './stores/useAuthStore';
import { useLibraryStore } from './stores/useLibraryStore';

function App() {
  const { token, profile, setToken, setRefreshToken, initFromStorage, loadProfile, clearSession } = useAuthStore();
  const { loadAll, reset } = useLibraryStore();

  const [currentPage, setCurrentPage] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [navigationStack, setNavigationStack] = useState<Array<{
    type: string;
    id?: string;
    query?: string;
  }>>([{ type: 'home' }]);

  // Init : check URL params (callback OAuth) ou localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      setToken(accessToken);
      setRefreshToken(refreshToken);
      const expiresIn = params.get('expires_in');
      if (expiresIn) {
        localStorage.setItem('spotify_expires_at', String(Date.now() + parseInt(expiresIn) * 1000));
      }
      window.history.replaceState(null, '', '/');
    } else {
      // Check hash (ancienne méthode)
      const hash = window.location.hash;
      if (hash.includes('access_token')) {
        const hashParams = hash.substring(1).split('&').reduce((acc: any, item) => {
          const [k, v] = item.split('=');
          acc[k] = decodeURIComponent(v);
          return acc;
        }, {});
        if (hashParams.access_token) {
          setToken(hashParams.access_token);
          window.location.hash = '';
        }
      } else {
        initFromStorage();
      }
    }
  }, [setToken, setRefreshToken, initFromStorage]);

  // Charger le profil quand le token change
  useEffect(() => {
    if (token && !profile) {
      loadProfile();
    }
  }, [token, profile, loadProfile]);

  // Charger les données de la bibliothèque
  useEffect(() => {
    if (token) {
      loadAll(token);
    }
  }, [token, loadAll]);

  const handleLogout = useCallback(() => {
    clearSession();
    reset();
    setCurrentPage('home');
    setNavigationStack([{ type: 'home' }]);
  }, [clearSession, reset]);

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page);
    setNavigationStack(prev => [...prev, { type: page }]);
  }, []);

  const handleNavigateDetail = useCallback((type: string, id: string) => {
    setCurrentPage(type);
    setNavigationStack(prev => [...prev, { type, id }]);
  }, []);

  const handleGoBack = useCallback(() => {
    setNavigationStack(prev => {
      if (prev.length <= 1) return prev;
      const newStack = prev.slice(0, -1);
      const last = newStack[newStack.length - 1];
      setCurrentPage(last.type);
      if (last.query) setSearchQuery(last.query);
      return newStack;
    });
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setNavigationStack(prev => [...prev, { type: 'search', query }]);
  }, []);

  if (!token) return <LoginPage />;

  const currentNav = navigationStack[navigationStack.length - 1];

  return (
    <div className="app-container">
      <Topbar
        token={token}
        onLogout={handleLogout}
        profile={profile}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onSearch={handleSearch}
      />
      <MainContent
        token={token}
        currentPage={currentPage}
        currentNav={currentNav}
        searchQuery={searchQuery}
        onNavigateDetail={handleNavigateDetail}
        onGoBack={handleGoBack}
        profile={profile}
      />
      <Player token={token} />
    </div>
  );
}

export default App;
