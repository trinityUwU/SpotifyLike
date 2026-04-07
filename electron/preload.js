const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Renderer → Main : mettre à jour l'état MPRIS
    updateMpris: (data) => ipcRenderer.send('mpris:update', data),

    // Main → Renderer : recevoir les commandes de la topbar
    onMprisCommand: (cb) => {
        const handler = (_e, payload) => cb(payload);
        ipcRenderer.on('mpris:command', handler);
        // Retourne un cleanup
        return () => ipcRenderer.removeListener('mpris:command', handler);
    }
});
