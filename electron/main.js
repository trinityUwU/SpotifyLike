require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { app, BrowserWindow, shell, session, Menu } = require('electron');
const { startServer } = require('../src/server');

// ── Widevine / EME (requis par le Spotify Web Playback SDK) ──────────────────
// Sans ça : "EMEError: No supported keysystem was found"
// Fonctionne avec @castlabs/electron-releases (Widevine intégré).
app.commandLine.appendSwitch('enable-features', 'PlatformEncryptedMediaExtensions');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let httpServer;

function createWindow() {
  const config = require('../src/config');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      plugins: true,           // nécessaire pour le CDM Widevine
    },
  });

  // Autoriser les permissions media/DRM dans la session
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem'];
    callback(allowed.includes(permission));
  });

  mainWindow.loadURL(`http://127.0.0.1:${config.PORT}/`);

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

app.whenReady().then(() => {
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
