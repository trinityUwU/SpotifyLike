require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { app, BrowserWindow, shell, session, Menu, components, ipcMain } = require('electron');
const path = require('path');
const { startServer } = require('../src/server');

// ── Widevine / EME (requis par le Spotify Web Playback SDK) ──────────────────
// Sans ça : "EMEError: No supported keysystem was found"
// Fonctionne avec @castlabs/electron-releases (Widevine intégré).
app.commandLine.appendSwitch('enable-features', 'PlatformEncryptedMediaExtensions');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let httpServer;
let mprisPlayer = null;

// ── MPRIS2 : service D-Bus pour l'intégration système ──────────────────────────
function createMprisPlayer() {
  try {
    const Player = require('mpris-service');
    mprisPlayer = Player({
      name: 'spotifylike',
      identity: 'SpotifyLIKE',
      supportedUriSchemes: ['http', 'https'],
      supportedMimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/mp4'],
      supportedInterfaces: ['player'],
      desktopEntry: 'spotifylike',
    });

    mprisPlayer.playbackStatus = 'Stopped';
    mprisPlayer.canPlay = true;
    mprisPlayer.canPause = true;
    mprisPlayer.canGoNext = true;
    mprisPlayer.canGoPrevious = true;
    mprisPlayer.canSeek = true;
    mprisPlayer.canControl = true;
    mprisPlayer.shuffle = false;
    mprisPlayer.loopStatus = 'None';
    mprisPlayer.rate = 1.0;
    mprisPlayer.minimumRate = 1.0;
    mprisPlayer.maximumRate = 1.0;
    mprisPlayer.volume = 0.6;
    mprisPlayer.metadata = {
      'mpris:trackid': mprisPlayer.objectPath('track/none'),
      'xesam:title': 'SpotifyLIKE',
      'xesam:artist': [''],
    };

    // Commandes topbar → renderer
    const fwd = (cmd, extra = {}) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mpris:command', { cmd, ...extra });
      }
    };

    mprisPlayer.on('play',      () => fwd('play'));
    mprisPlayer.on('pause',     () => fwd('pause'));
    mprisPlayer.on('playpause', () => fwd('playpause'));
    mprisPlayer.on('stop',      () => fwd('stop'));
    mprisPlayer.on('next',      () => fwd('next'));
    mprisPlayer.on('previous',  () => fwd('previous'));
    mprisPlayer.on('seek',      (offset)    => fwd('seek',     { offset }));
    mprisPlayer.on('position',  ({ position }) => fwd('position', { position }));
    mprisPlayer.on('shuffle',   (shuffle)   => { mprisPlayer.shuffle = shuffle;   fwd('shuffle',    { shuffle }); });
    mprisPlayer.on('loopStatus',(loop)      => { mprisPlayer.loopStatus = loop;   fwd('loopStatus', { loopStatus: loop }); });
    mprisPlayer.on('volume',    (vol)       => { mprisPlayer.volume = vol;         fwd('volume',     { volume: Math.round(vol * 100) }); });

    console.log('[MPRIS] Service D-Bus enregistré : org.mpris.MediaPlayer2.spotifylike');
  } catch (e) {
    console.warn('[MPRIS] Impossible de créer le service D-Bus :', e.message);
  }
}

// Renderer → Main : mise à jour de l'état MPRIS
ipcMain.on('mpris:update', (_event, data) => {
  if (!mprisPlayer) return;

  if (data.playbackStatus !== undefined) {
    mprisPlayer.playbackStatus = data.playbackStatus; // 'Playing' | 'Paused' | 'Stopped'
  }
  if (data.metadata) {
    const m = data.metadata;
    mprisPlayer.metadata = {
      'mpris:trackid':  mprisPlayer.objectPath(`track/${String(m.id || '0').replace(/[^a-zA-Z0-9_]/g, '_')}`),
      'mpris:length':   Math.round((m.duration || 0) * 1e6), // s → µs
      'mpris:artUrl':   m.artUrl || '',
      'xesam:title':    m.title  || 'Unknown',
      'xesam:artist':   [m.artist || 'Unknown'],
      'xesam:album':    m.album  || '',
      'xesam:url':      m.spotifyUrl || '',
    };
  }
  if (data.position !== undefined) {
    // ms → µs (MPRIS utilise des microsecondes)
    mprisPlayer.position = Math.round(data.position * 1e3);
  }
  if (data.shuffle    !== undefined) mprisPlayer.shuffle    = data.shuffle;
  if (data.loopStatus !== undefined) mprisPlayer.loopStatus = data.loopStatus;
  if (data.volume     !== undefined) mprisPlayer.volume     = data.volume / 100;
  if (data.canGoNext      !== undefined) mprisPlayer.canGoNext      = data.canGoNext;
  if (data.canGoPrevious  !== undefined) mprisPlayer.canGoPrevious  = data.canGoPrevious;
});

function createWindow() {
  const config = require('../src/config');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      plugins: true,           // nécessaire pour le CDM Widevine
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Autoriser les permissions media/DRM dans la session
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem'];
    callback(allowed.includes(permission));
  });

  mainWindow.loadURL(`http://127.0.0.1:${config.PORT}/`);

  // F12 / Ctrl+Shift+I → DevTools (menu supprimé, raccourcis réactivés manuellement)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // ── Flux OAuth Spotify ────────────────────────────────────────────────────
  // Le flux complet se déroule dans la fenêtre Electron :
  //   /login → Spotify OAuth (accounts.spotify.com) → /callback → /#access_token=...
  //
  // IMPORTANT : ne PAS intercepter /login pour l'ouvrir dans le navigateur système —
  // sinon les tokens atterrissent dans le browser et jamais dans Electron.
  mainWindow.webContents.on('will-navigate', (_event, url) => {
    const isLocal    = url.startsWith(`http://127.0.0.1:${config.PORT}`) ||
                       url.startsWith(`http://localhost:${config.PORT}`);
    const isSpotifyAuth = url.startsWith('https://accounts.spotify.com/');

    // Laisser passer : local + Spotify OAuth
    if (isLocal || isSpotifyAuth) return;

    // Tout lien externe (ex. liens artistiques Spotify.com) → ouvrir dans le browser
    _event.preventDefault();
    shell.openExternal(url);
  });
}

// Supprimer la barre de menu native (File, Edit, View, Window, Help)
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  // Attendre que le CDM Widevine soit prêt (castlabs +wvcus)
  await components.whenReady();
  console.log('[Widevine] CDM components ready:', components.status());

  createMprisPlayer();
  startServer((server) => {
    httpServer = server;
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (httpServer) httpServer.close();
});
