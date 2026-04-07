#!/bin/bash
# SpotifyLIKE — script de lancement stable
# Utilise le binaire Electron castlabs (Widevine intégré)

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON="$APP_DIR/node_modules/electron/dist/electron"
LOG_FILE="$HOME/.local/share/spotifylike/spotifylike.log"

mkdir -p "$(dirname "$LOG_FILE")"

# Wayland natif si disponible (Hyprland), fallback XWayland automatique
export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-auto}"

# Éviter les conflits de sandbox dans certains environnements Wayland
export ELECTRON_NO_ASAR=0

exec "$ELECTRON" \
  --ozone-platform-hint=auto \
  --enable-features=WaylandWindowDecorations,UseOzonePlatform \
  "$APP_DIR/electron/main.js" \
  "$@" \
  >> "$LOG_FILE" 2>&1
