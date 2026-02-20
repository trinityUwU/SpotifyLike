# 🎵 SPOTIFY API — RÉFÉRENCE COMPLÈTE & AUDIT DU PROJET SpotifyLIKE

> **Date** : 18 février 2026  
> **Objectif** : Refonte complète de l'application Spotify avec un design 100% personnalisé, en utilisant l'intégralité de l'API officielle.  
> **Version API** : Spotify Web API v1  
> **Base URL** : `https://api.spotify.com/v1`

---

## TABLE DES MATIÈRES

1. [AUDIT CRITIQUE DU PROJET ACTUEL](#1-audit-critique-du-projet-actuel)
   - [1.1 Problèmes de Rate Limiting](#11-problèmes-de-rate-limiting-critique)
   - [1.2 Problèmes de Stockage Local](#12-problèmes-de-stockage-local-critique)
   - [1.3 Problèmes Frontend](#13-problèmes-frontend-majeur)
   - [1.4 Appels API non-conformes](#14-appels-api-non-conformes)
2. [AUTHENTIFICATION & AUTORISATION](#2-authentification--autorisation)
3. [RATE LIMITS — GUIDE COMPLET](#3-rate-limits--guide-complet)
4. [RÉFÉRENCE COMPLÈTE DES ENDPOINTS](#4-référence-complète-des-endpoints)
   - [4.1 Albums](#41-albums)
   - [4.2 Artists](#42-artists)
   - [4.3 Audiobooks](#43-audiobooks)
   - [4.4 Categories (Browse)](#44-categories-browse)
   - [4.5 Chapters](#45-chapters)
   - [4.6 Episodes](#46-episodes)
   - [4.7 Genres](#47-genres)
   - [4.8 Markets](#48-markets)
   - [4.9 Player](#49-player)
   - [4.10 Playlists](#410-playlists)
   - [4.11 Search](#411-search)
   - [4.12 Shows](#412-shows)
   - [4.13 Tracks](#413-tracks)
   - [4.14 Users](#414-users)
5. [PLAN DE REFONTE](#5-plan-de-refonte)
6. [ARCHITECTURE CIBLE](#6-architecture-cible)

---

## 1. AUDIT CRITIQUE DU PROJET ACTUEL

### 1.1 Problèmes de Rate Limiting (🔴 CRITIQUE)

Le rate limiting est **le problème numéro 1**. Après ~10 minutes d'utilisation, l'app se fait bloquer (429 Too Many Requests). Voici l'inventaire des causes :

#### 🔴 Cause 1 : Player Polling trop agressif
```
Fichier : src/components/SpotifyLayout.tsx (ligne 373-378)
```
- Le Player poll `fetchPlaybackState()` **toutes les 5 secondes** (`setInterval(fetchState, 5000)`)
- C'est **12 appels/minute** juste pour le player state
- En plus, chaque changement de track déclenche :
  - `fetchQueue()` (QueuePanel)
  - `likeBatcher.check()` → `checkSavedTracks()`
  - `fetchLyrics()` (si panel ouvert)
  - `fetchDevices()` (si panel ouvert)
- **Impact estimé** : ~15-20 appels/minute uniquement pour le player

#### 🔴 Cause 2 : Promise.all massifs sans throttling
```
Fichier : src/components/ArtistDetail.tsx (ligne 146-152)
```
- Quand on ouvre un artiste : **5 appels parallèles** (`Promise.all`) :
  1. `fetchArtist`
  2. `fetchArtistTopTracks`
  3. `fetchArtistAlbums`
  4. `fetchRelatedArtists`
  5. `checkFollowingArtist`
- Même problème dans `TrackDetail.tsx` (ligne 120-135) : **5+ appels parallèles** :
  1. `fetchTrack`
  2. `fetchAudioFeatures`
  3. `fetchArtist` (du premier artiste)
  4. `fetchArtistTopTracks`
  5. `fetchLyrics`

#### 🔴 Cause 3 : Appels directs qui bypasse `spotifyFetch`
```
Fichier : src/components/ArtistDetail.tsx (ligne 185-190)
Fichier : src/components/TrackDetail.tsx (ligne 59-63, 163-168)
```
- `playArtist()` fait un `fetch()` direct vers l'API sans passer par `spotifyFetch`
- `MiniTrackCard.playTrack()` fait pareil
- `playNow()` aussi
- **Ces appels ne bénéficient d'aucun** : cache, déduplication, queue, rate limit handling

#### 🔴 Cause 4 : Queue de requêtes inefficace
```
Fichier : src/services/spotify.ts (ligne 221-238)
```
- Le délai entre les requêtes est de **350ms** — trop court pour un mode développement
- Le cooldown après un 429 ajoute seulement `retryAfter + 1` secondes
- Pas d'exponential backoff
- Les requêtes GET passent par la queue mais les GET sont souvent déjà déduplicés, donc la queue se vide instantanément et envoie plusieurs requêtes en rafale

#### 🔴 Cause 5 : LikeButton vérifie à chaque render + focus
```
Fichier : src/components/LikeButton.tsx (ligne 27-33)
```
- Chaque `LikeButton` s'enregistre sur `window.addEventListener('focus')` pour refresher
- Sur une page artiste avec 5 tracks + like dans le player = **6 vérifications par focus**
- Le batcher aide mais crée quand même un appel API avec les IDs groupés

#### ⚠️ Cause 6 : Pages dupliquant les appels
- `MainContent.tsx` charge les playlists + topArtists + recentlyPlayed au mount
- `PlaylistsPage.tsx` recharge `fetchPlaylists()` indépendamment
- `RadioPage.tsx` recharge `fetchTopArtists()` indépendamment
- `ActivityPage.tsx` recharge `fetchRecentlyPlayed()` indépendamment
- **Pas de state global** → chaque page refait ses appels

### 1.2 Problèmes de Stockage Local (🔴 CRITIQUE)

#### 🔴 Le cache est 100% côté serveur (SQLite via `server.js`)
```
Architecture actuelle :
Frontend → HTTP → server.js:3001 → SQLite (spotify-cache.db)
```
- **PROBLÈME** : Le cache nécessite que `server.js` tourne. Si le serveur Express est arrêté, ZÉRO cache
- Ce n'est pas du vrai stockage local. Chaque lecture de cache = **1 requête HTTP** vers `localhost:3001`
- Pour une app "locale", c'est absurde : 2 requêtes HTTP pour 1 donnée (1 cache miss + 1 API Spotify)

#### 🔴 Le `localStorage` n'est utilisé que pour le token
```javascript
// Seules données en localStorage :
localStorage.setItem('spotify_token', ...)
localStorage.setItem('spotify_refresh_token', ...)
localStorage.setItem('spotify_expires_at', ...)
localStorage.setItem('spotify_user_id', ...)
```
- Pas de cache en `localStorage` ni en `IndexedDB`
- Les données statiques (artistes, albums) passent systématiquement par le serveur
- Les images ne sont pas cachées du tout

#### 🔴 Le serveur cache est surdimensionné
- `better-sqlite3` ajoute une dépendance native lourde
- Le fichier `spotify-cache.db` = binaire SQLite
- Le cache via HTTP REST est lent (sérialisation JSON + HTTP)
- Le nettoyage automatique toutes les 10 minutes (`setInterval(cleanExpiredCache, 10 * 60 * 1000)`) ne nettoie que sur le serveur

#### ⚠️ Solution correcte pour "local"
- Utiliser **IndexedDB** (via `idb` ou `localForage`) directement dans le frontend
- Capacité : illimitée pratiquement (vs 5-10MB pour localStorage)
- Pas besoin du serveur Express juste pour le cache
- Le serveur Express ne devrait servir que pour l'OAuth (token exchange)

### 1.3 Problèmes Frontend (🟠 MAJEUR)

#### 🔴 Pas de scroll sur les pages de détail
```
Fichier : src/styles/layout.css (ligne 217-221)
```
```css
.main-content {
    overflow: hidden; /* ← PROBLÈME : coupe le contenu */
}
```
- Les pages `ArtistDetail`, `AlbumDetail`, `PlaylistDetail`, `TrackDetail` ont du contenu qui dépasse l'écran
- Le `overflow: hidden` empêche le scroll
- Résultat : contenu tronqué, impossible de voir les albums en bas de la page artiste

#### 🔴 Styles inline massifs partout
- `PlaylistDetail.tsx` : **52+ éléments** avec `style={{...}}` inline
- `ArtistDetail.tsx` : **30+ éléments** avec styles inline
- `TrackDetail.tsx` : **40+ éléments** inline
- `BrowsePage.tsx` : styles 100% inline, pas une seule classe CSS
- `RadioPage.tsx` : pareil, 100% inline
- `ActivityPage.tsx` : pareil
- `LoginPage.tsx` : pareil
- **Conséquence** : impossible à maintenir, performances re-render dégradées, pas de responsive

#### 🔴 Pas de responsive design
- Les grilles utilisent des tailles fixes (`minmax(200px, 1fr)`)
- Le player bar ne s'adapte pas aux petits écrans
- La topbar ne collapse pas en mobile
- Les pages de détail (artiste, album) utilisent un layout 2 colonnes fixe sans breakpoint

#### 🔴 Pas de gestion d'erreur UI
- Aucun composant d'erreur/fallback
- Les données `null` affichent juste "—" ou rien
- Pas de skeleton loading (juste "Chargement…" en texte)
- Si l'API rate-limit, aucun feedback utilisateur

#### 🔴 La recherche ne fait rien
```
Fichier : src/components/SpotifyLayout.tsx (ligne 131-140)
```
- Le champ de recherche dans la Topbar est **purement décoratif**
- Aucun `onChange`, aucun appel API, aucun résultat
- L'endpoint `GET /v1/search` n'est même pas importé dans `spotify.ts`

#### ⚠️ Pages incomplètes
- `BrowsePage.tsx` : juste 6 cards statiques ("À venir prochainement")
- `RadioPage.tsx` : affiche les top artistes mais n'utilise aucun endpoint radio
- Profile & Settings : retournent "Cette page sera disponible prochainement"

#### ⚠️ Navigation manque de feedback
- Pas d'animation de transition entre les pages
- Le bouton "Retour" n'a pas d'indication visuelle d'état
- Pas d'indicateur de chargement dans la topbar

#### ⚠️ Background flicker
- Les pages artiste/album utilisent une image en background avec blur
- Le changement d'image cause un flicker (flash blanc avant le chargement)
- Les `useMemo` sur les styles ne suffisent pas à résoudre le problème des transitions d'images

### 1.4 Appels API non-conformes

#### 🔴 Endpoint audio-features déprécié
```typescript
// spotify.ts ligne 391
export const fetchAudioFeatures = (token: string, trackId: string) =>
    spotifyFetch(`https://api.spotify.com/v1/audio-features/${trackId}`, token);
```
- L'endpoint `GET /v1/audio-features/{id}` est **déprécié depuis novembre 2024** pour les apps en mode développement
- Il retournera une erreur 403 pour les nouvelles apps
- Alternative : utiliser les données de base du track (`popularity`, etc.)

#### 🔴 Endpoint Lyrics non-officiel
```typescript
// spotify.ts ligne 409-415
export const fetchLyrics = async (token: string, trackId: string) => {
    return await spotifyFetch(
        `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}`,
        token, { headers: { "App-Platform": "WebPlayer" } }
    );
};
```
- `spclient.wg.spotify.com` est une API **interne de Spotify**, pas officielle
- Peut être bloquée à tout moment
- Non documentée, non supportée

#### ⚠️ Endpoints non utilisés mais disponibles
L'application n'utilise pas les endpoints suivants qui seraient utiles :
- `GET /v1/search` — Recherche globale
- `GET /v1/browse/categories` — Catégories réelles
- `GET /v1/browse/featured-playlists` — Playlists à la une
- `GET /v1/browse/new-releases` — Nouvelles sorties
- `GET /v1/recommendations` — Recommandations personnalisées
- `GET /v1/me/top/tracks` — Top tracks de l'utilisateur (partiellement utilisé mais `limit=10` seulement)
- `POST /v1/playlists/{id}/tracks` — Ajouter des tracks à une playlist
- `PUT /v1/playlists/{id}` — Modifier une playlist
- `DELETE /v1/playlists/{id}/tracks` — Supprimer des tracks

---

## 2. AUTHENTIFICATION & AUTORISATION

### Flux OAuth 2.0

L'API Spotify supporte 3 types de flux d'autorisation :

| Flux | Accès aux données utilisateur | Nécessite un serveur | Refresh Token |
|------|------|------|------|
| **Authorization Code** ✅ (utilisé) | ✅ Oui | ✅ Oui | ✅ Oui |
| Authorization Code + PKCE | ✅ Oui | ❌ Non | ✅ Oui |
| Client Credentials | ❌ Non (public uniquement) | ✅ Oui | ❌ Non |

### Architecture actuelle (Authorization Code Flow)

```
1. Frontend → redirect vers accounts.spotify.com/authorize
2. Utilisateur autorise → redirect vers server.js:3001/callback?code=XXX
3. server.js échange code → access_token + refresh_token
4. Redirect vers frontend avec tokens dans le hash URL
5. Frontend stocke les tokens dans localStorage
6. Refresh automatique via /refresh-token toutes les 60s
```

### Scopes utilisés

| Scope | Usage actuel | Nécessaire |
|-------|-------------|------------|
| `user-read-currently-playing` | ✅ Player | ✅ |
| `user-read-recently-played` | ✅ Historique | ✅ |
| `user-read-playback-state` | ✅ Player state | ✅ |
| `user-top-read` | ✅ Top artistes | ✅ |
| `user-modify-playback-state` | ✅ Play/pause/skip | ✅ |
| `user-library-read` | ✅ Likes check | ✅ |
| `user-library-modify` | ✅ Like/unlike | ✅ |
| `user-follow-read` | ✅ Follow check | ✅ |
| `user-follow-modify` | ✅ Follow/unfollow | ✅ |
| `playlist-read-private` | ✅ Playlists privées | ✅ |
| `playlist-read-collaborative` | ✅ Playlists collab | ✅ |
| `streaming` | ⚠️ Non utilisé réellement | ✅ (pour Web Playback SDK) |
| `user-read-email` | ❌ Non utilisé | ❌ Peut être retiré |
| `user-read-private` | ✅ Profil | ✅ |

### Scopes manquants (pour la refonte)

| Scope | Pour quoi |
|-------|-----------|
| `playlist-modify-public` | Créer/modifier ses playlists publiques |
| `playlist-modify-private` | Créer/modifier ses playlists privées |
| `ugc-image-upload` | Upload d'images de playlist personnalisées |

### Gestion des tokens

```
Access Token : durée de vie = 3600s (1 heure)
Refresh Token : durée de vie = indéfinie (tant que l'utilisateur ne révoque pas)
```

**Problème actuel** : Le refresh token est stocké dans `localStorage` ET dans un objet en mémoire du serveur (`refreshTokens = {}`). Si le serveur redémarre, l'association `accessToken → refreshToken` est perdue côté serveur, mais le frontend a toujours le refresh_token.

---

## 3. RATE LIMITS — GUIDE COMPLET

### Limites Spotify

| Mode | Limite approximative | Fenêtre |
|------|---------------------|---------|
| **Development** (notre cas) | ~100 requêtes par heure par user | Rolling 30s window |
| **Extended Quota** | Beaucoup plus élevé | Rolling 30s window |

### Réponse 429

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
```

### Stratégie recommandée par Spotify

1. **Backoff-Retry** : Respecter le `Retry-After` header
2. **Batch APIs** : Utiliser les endpoints multi-items (ex: `GET /v1/tracks?ids=1,2,3`)
3. **snapshot_id** : Éviter de re-télécharger une playlist non modifiée
4. **Lazy Loading** : Ne charger que ce qui est visible
5. **Cache intelligent** : Pas de re-fetch inutile

### Calcul de notre consommation actuelle

```
Par minute (utilisation normale) :
├── Player polling (5s)                     = 12 appels/min
├── Like check (par changement de track)    = 1 appel/min
├── Queue fetch (si panel ouvert)           = 1 appel/min
├── Playback state (double avec previous)   = 24 appels/min (!!!)
├── Navigation vers artiste (5 parallèles)  = 5 appels
├── Navigation vers track (5 parallèles)    = 5 appels
├── Navigation vers album                   = 1 appel
├── Navigation vers playlist                = 2 appels
├── Homepage load                           = 3 appels
└── TOTAL moyen                             ≈ 40-60 appels/min
                                            ≈ 2400-3600 appels/heure

vs. LIMITE SPOTIFY                         ≈ 100 appels/heure
```

**On est à 24x-36x au-dessus de la limite !** C'est pour ça qu'on se fait rate-limiter en 10 minutes.

### Plan de réduction

| Action | Réduction estimée |
|--------|------------------|
| Player polling → 30s au lieu de 5s | -90% (de 12 à 2/min) |
| Cache IndexedDB robuste (TTL longs) | -70% globalement |
| Lazy loading (ne charger que le visible) | -50% |
| Suppression des appels directs `fetch()` | -10% |
| Suppression du double playbackState | -50% du player |
| **Objectif** | **< 15 appels/min → 900/h** |

Avec un cache IndexedDB de TTL 24h pour les données statiques (artistes, albums, tracks), on peut encore réduire à **< 5 appels/min** en usage courant.

---

## 4. RÉFÉRENCE COMPLÈTE DES ENDPOINTS

### 4.1 Albums

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/albums/{id}` | Détails d'un album | ✅ `fetchAlbum` |
| `GET` | `/v1/albums` | Plusieurs albums (batch) | ❌ |
| `GET` | `/v1/albums/{id}/tracks` | Tracks d'un album | ❌ (utilise le champ `tracks` de l'album) |
| `GET` | `/v1/me/albums` | Albums sauvegardés par l'utilisateur | ❌ |
| `PUT` | `/v1/me/albums` | Sauvegarder des albums | ❌ |
| `DELETE` | `/v1/me/albums` | Supprimer des albums sauvegardés | ❌ |
| `GET` | `/v1/me/albums/contains` | Vérifier si des albums sont sauvegardés | ❌ |
| `GET` | `/v1/browse/new-releases` | Nouvelles sorties | ❌ |

**Paramètres utiles pour `GET /v1/albums/{id}`** :
```
market : string (ISO 3166-1 alpha-2, ex: "FR")
```

**Réponse clé** :
```json
{
  "album_type": "album|single|compilation",
  "total_tracks": 12,
  "artists": [...],
  "images": [{ "url": "...", "height": 640, "width": 640 }],
  "name": "Album Name",
  "release_date": "2024-01-15",
  "tracks": { "items": [...], "total": 12 },
  "uri": "spotify:album:xxx",
  "copyrights": [{ "text": "...", "type": "C|P" }],
  "label": "Label Name",
  "popularity": 75
}
```

### 4.2 Artists

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/artists/{id}` | Détails d'un artiste | ✅ `fetchArtist` |
| `GET` | `/v1/artists` | Plusieurs artistes (batch) | ❌ |
| `GET` | `/v1/artists/{id}/albums` | Albums d'un artiste | ✅ `fetchArtistAlbums` |
| `GET` | `/v1/artists/{id}/top-tracks` | Top tracks d'un artiste | ✅ `fetchArtistTopTracks` |
| `GET` | `/v1/artists/{id}/related-artists` | Artistes similaires | ✅ `fetchRelatedArtists` |

**Paramètres pour `/v1/artists/{id}/albums`** :
```
include_groups : "album,single,appears_on,compilation" (séparés par virgules)
market : "FR"
limit : 20 (max 50)
offset : 0
```

**Paramètres pour `/v1/artists/{id}/top-tracks`** :
```
market : "FR" (obligatoire, ou utiliser "from_token")
```

**Réponse de `GET /v1/artists/{id}`** :
```json
{
  "id": "xxx",
  "name": "Artist Name",
  "genres": ["pop", "rock"],
  "followers": { "total": 1500000 },
  "images": [
    { "url": "...", "height": 640, "width": 640 },
    { "url": "...", "height": 320, "width": 320 },
    { "url": "...", "height": 160, "width": 160 }
  ],
  "popularity": 80,
  "uri": "spotify:artist:xxx",
  "external_urls": { "spotify": "https://open.spotify.com/artist/xxx" }
}
```

### 4.3 Audiobooks

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/audiobooks/{id}` | Détails d'un audiobook | ❌ |
| `GET` | `/v1/audiobooks` | Plusieurs audiobooks | ❌ |
| `GET` | `/v1/audiobooks/{id}/chapters` | Chapitres d'un audiobook | ❌ |
| `GET` | `/v1/me/audiobooks` | Audiobooks sauvegardés | ❌ |
| `PUT` | `/v1/me/audiobooks` | Sauvegarder des audiobooks | ❌ |
| `DELETE` | `/v1/me/audiobooks` | Supprimer des audiobooks | ❌ |
| `GET` | `/v1/me/audiobooks/contains` | Vérifier si sauvegardés | ❌ |

### 4.4 Categories (Browse)

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/browse/categories` | Liste des catégories | ❌ |
| `GET` | `/v1/browse/categories/{id}` | Détails d'une catégorie | ❌ |
| `GET` | `/v1/browse/categories/{id}/playlists` | Playlists d'une catégorie | ❌ |
| `GET` | `/v1/browse/featured-playlists` | Playlists à la une | ❌ |
| `GET` | `/v1/browse/new-releases` | Nouvelles sorties | ❌ |

**⚡ Ces endpoints sont essentiels pour la page "Parcourir" qui est actuellement vide !**

**Paramètres pour `/v1/browse/categories`** :
```
locale : "fr_FR"
country : "FR"
limit : 50 (max)
offset : 0
```

**Réponse** :
```json
{
  "categories": {
    "items": [
      {
        "id": "toplists",
        "name": "Top Lists",
        "icons": [{ "url": "..." }]
      }
    ]
  }
}
```

### 4.5 Chapters

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/chapters/{id}` | Détails d'un chapitre d'audiobook | ❌ |
| `GET` | `/v1/chapters` | Plusieurs chapitres | ❌ |

### 4.6 Episodes

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/episodes/{id}` | Détails d'un épisode de podcast | ❌ |
| `GET` | `/v1/episodes` | Plusieurs épisodes | ❌ |
| `GET` | `/v1/me/episodes` | Épisodes sauvegardés | ❌ |
| `PUT` | `/v1/me/episodes` | Sauvegarder des épisodes | ❌ |
| `DELETE` | `/v1/me/episodes` | Supprimer des épisodes | ❌ |
| `GET` | `/v1/me/episodes/contains` | Vérifier si sauvegardés | ❌ |

### 4.7 Genres

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/recommendations/available-genre-seeds` | Genres disponibles pour les recommandations | ❌ |

### 4.8 Markets

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/markets` | Liste de tous les marchés disponibles | ❌ |

### 4.9 Player

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/me/player` | État de lecture actuel | ✅ `fetchPlaybackState` |
| `PUT` | `/v1/me/player` | Transférer la lecture | ✅ `transferPlayback` |
| `GET` | `/v1/me/player/devices` | Appareils disponibles | ✅ `fetchDevices` |
| `GET` | `/v1/me/player/currently-playing` | Track en cours | ✅ `fetchCurrentlyPlaying` |
| `PUT` | `/v1/me/player/play` | Lancer/reprendre la lecture | ✅ `playerPlay` / `playContext` / `playTracks` |
| `PUT` | `/v1/me/player/pause` | Mettre en pause | ✅ `playerPause` |
| `POST` | `/v1/me/player/next` | Track suivante | ✅ `playerNext` |
| `POST` | `/v1/me/player/previous` | Track précédente | ✅ `playerPrevious` |
| `PUT` | `/v1/me/player/seek` | Chercher position | ✅ `playerSeek` |
| `PUT` | `/v1/me/player/repeat` | Mode répétition | ✅ `playerRepeat` |
| `PUT` | `/v1/me/player/volume` | Volume | ✅ `playerVolume` |
| `PUT` | `/v1/me/player/shuffle` | Mode aléatoire | ✅ `playerShuffle` |
| `GET` | `/v1/me/player/recently-played` | Historique récent | ✅ `fetchRecentlyPlayed` |
| `GET` | `/v1/me/player/queue` | File d'attente | ✅ `fetchQueue` |
| `POST` | `/v1/me/player/queue` | Ajouter à la file d'attente | ❌ |

**État de lecture** (`GET /v1/me/player`) :
```json
{
  "device": {
    "id": "xxx",
    "name": "Mon PC",
    "type": "Computer",
    "volume_percent": 50,
    "is_active": true
  },
  "shuffle_state": false,
  "repeat_state": "off|context|track",
  "progress_ms": 45000,
  "is_playing": true,
  "item": {
    "id": "trackId",
    "name": "Song Name",
    "duration_ms": 210000,
    "artists": [...],
    "album": {...},
    "uri": "spotify:track:xxx"
  },
  "currently_playing_type": "track|episode|ad",
  "context": {
    "type": "album|artist|playlist",
    "uri": "spotify:playlist:xxx"
  }
}
```

**Paramètres du `PUT /v1/me/player/play`** :
```json
{
  "context_uri": "spotify:album:xxx",    // OU
  "uris": ["spotify:track:xxx", ...],    // OU
  "offset": { "position": 0 },          // Position dans le context
  "position_ms": 0                       // Position dans le track
}
```

### 4.10 Playlists

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/playlists/{id}` | Détails d'une playlist | ✅ `fetchPlaylist` |
| `PUT` | `/v1/playlists/{id}` | Modifier une playlist | ❌ |
| `GET` | `/v1/playlists/{id}/tracks` | Tracks d'une playlist | ✅ `fetchPlaylistTracks` |
| `POST` | `/v1/playlists/{id}/tracks` | Ajouter des tracks | ❌ |
| `PUT` | `/v1/playlists/{id}/tracks` | Remplacer les tracks | ❌ |
| `DELETE` | `/v1/playlists/{id}/tracks` | Supprimer des tracks | ❌ |
| `GET` | `/v1/me/playlists` | Playlists de l'utilisateur | ✅ `fetchPlaylists` |
| `GET` | `/v1/users/{user_id}/playlists` | Playlists d'un utilisateur | ❌ |
| `POST` | `/v1/users/{user_id}/playlists` | Créer une playlist | ❌ |
| `GET` | `/v1/playlists/{id}/followers/contains` | Vérifier si l'utilisateur suit | ❌ |
| `PUT` | `/v1/playlists/{id}/followers` | Suivre une playlist | ❌ |
| `DELETE` | `/v1/playlists/{id}/followers` | Ne plus suivre | ❌ |
| `GET` | `/v1/playlists/{id}/images` | Images de la playlist | ❌ |
| `PUT` | `/v1/playlists/{id}/images` | Modifier l'image | ❌ |

**⚡ Paramètre crucial : `snapshot_id`**
- Chaque playlist a un `snapshot_id` qui change quand la playlist est modifiée
- Stocker le `snapshot_id` permet de savoir si une playlist a changé sans la re-télécharger
- Le `DELETE /v1/playlists/{id}/tracks` utilise `snapshot_id` pour garantir qu'on supprime la bonne version

**Paramètres `GET /v1/playlists/{id}/tracks`** :
```
market : "FR"
fields : "items(track(name,id,duration_ms,artists,album(images,name)))" ← IMPORTANT : réduire la taille !
limit : 100 (max)
offset : 0
additional_types : "track,episode"
```

**NOTE** : Le champ `fields` permet de ne récupérer que les données nécessaires → **réduit la taille de la réponse de 80%** et aide avec les rate limits.

### 4.11 Search

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/search` | Recherche globale | ❌ ← **CRITIQUE MANQUANT** |

**⚡ C'est l'endpoint le plus important pour une app Spotify et il n'est pas implémenté !**

**Paramètres** :
```
q : "query string" (obligatoire)
type : "album,artist,playlist,track,show,episode,audiobook" (séparés par virgules)
market : "FR"
limit : 20 (max 50)
offset : 0
include_external : "audio" (pour inclure les résultats externes)
```

**Syntaxe de recherche avancée** :
```
q=artist:Eminem track:Lose Yourself         // Recherche par champ
q=year:2024                                  // Par année
q=genre:hip-hop                              // Par genre
q=tag:new                                    // Nouvelles sorties (max 2 semaines)
q=tag:hipster                                // Peu populaire
q=NOT genre:rock                             // Exclusion
q=artist:Eminem OR artist:Drake              // OU logique
```

**Réponse** :
```json
{
  "tracks": {
    "items": [...],
    "total": 1500,
    "limit": 20,
    "offset": 0,
    "next": "https://api.spotify.com/v1/search?..."
  },
  "artists": { ... },
  "albums": { ... },
  "playlists": { ... }
}
```

### 4.12 Shows (Podcasts)

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/shows/{id}` | Détails d'un podcast | ❌ |
| `GET` | `/v1/shows` | Plusieurs podcasts | ❌ |
| `GET` | `/v1/shows/{id}/episodes` | Épisodes d'un podcast | ❌ |
| `GET` | `/v1/me/shows` | Podcasts sauvegardés | ❌ |
| `PUT` | `/v1/me/shows` | Sauvegarder des podcasts | ❌ |
| `DELETE` | `/v1/me/shows` | Supprimer des podcasts | ❌ |
| `GET` | `/v1/me/shows/contains` | Vérifier si sauvegardés | ❌ |

### 4.13 Tracks

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/tracks/{id}` | Détails d'un track | ✅ `fetchTrack` |
| `GET` | `/v1/tracks` | Plusieurs tracks (batch) | ❌ |
| `GET` | `/v1/me/tracks` | Tracks sauvegardés (liked songs) | ✅ `getSavedTracks` |
| `PUT` | `/v1/me/tracks` | Sauvegarder des tracks | ✅ `saveTrack` |
| `DELETE` | `/v1/me/tracks` | Supprimer des tracks sauvegardés | ✅ `removeSavedTrack` |
| `GET` | `/v1/me/tracks/contains` | Vérifier si sauvegardés | ✅ `checkSavedTracks` |
| `GET` | `/v1/audio-features/{id}` | Caractéristiques audio | ⚠️ `fetchAudioFeatures` (déprécié) |
| `GET` | `/v1/audio-features` | Caractéristiques audio (batch) | ❌ |
| `GET` | `/v1/audio-analysis/{id}` | Analyse audio détaillée | ❌ |
| `GET` | `/v1/recommendations` | Recommandations personnalisées | ❌ |

**⚡ Endpoint `GET /v1/recommendations` — CRUCIAL pour la radio !**

**Paramètres** :
```
seed_artists : "id1,id2,id3" (max 5 seeds total entre artists+tracks+genres)
seed_tracks : "id1,id2"
seed_genres : "pop,rock"
limit : 20 (max 100)
market : "FR"

// Paramètres de tuning (tous optionnels, min_/max_/target_)
min_acousticness : 0.0
max_energy : 1.0
target_tempo : 120.0
target_danceability : 0.8
min_popularity : 50
// ... et beaucoup d'autres
```

**NOTE** : Ce endpoint peut remplacer la page "Radio" actuellement inutile.

### 4.14 Users

| Méthode | Endpoint | Description | Utilisé ? |
|---------|----------|-------------|-----------|
| `GET` | `/v1/me` | Profil de l'utilisateur courant | ✅ `fetchProfile` |
| `GET` | `/v1/me/top/artists` | Top artistes de l'utilisateur | ✅ `fetchTopArtists` |
| `GET` | `/v1/me/top/tracks` | Top tracks de l'utilisateur | ✅ `fetchTopTracks` |
| `GET` | `/v1/users/{user_id}` | Profil public d'un utilisateur | ❌ |
| `PUT` | `/v1/me/following` | Suivre des artistes/utilisateurs | ✅ `followArtist` |
| `DELETE` | `/v1/me/following` | Ne plus suivre | ✅ `unfollowArtist` |
| `GET` | `/v1/me/following` | Liste des artistes/utilisateurs suivis | ❌ |
| `GET` | `/v1/me/following/contains` | Vérifier si on suit | ✅ `checkFollowingArtist` |

**Paramètres pour `/v1/me/top/artists` et `/v1/me/top/tracks`** :
```
time_range : "short_term" (4 semaines) | "medium_term" (6 mois) | "long_term" (toujours)
limit : 50 (max)
offset : 0
```

**Profil utilisateur** (`GET /v1/me`) :
```json
{
  "id": "user_id",
  "display_name": "Username",
  "email": "user@example.com",
  "country": "FR",
  "product": "premium|free|open",
  "images": [{ "url": "...", "height": 300, "width": 300 }],
  "followers": { "total": 150 },
  "external_urls": { "spotify": "https://open.spotify.com/user/xxx" },
  "uri": "spotify:user:xxx"
}
```

---

## 5. PLAN DE REFONTE

### Phase 1 : Infrastructure (Priorité CRITIQUE)

#### 1.1 — Remplacement du système de cache
```
AVANT : Frontend → HTTP → Express → SQLite
APRÈS : Frontend → IndexedDB (idb-keyval ou localForage)
```
- Supprimer la dépendance à `better-sqlite3`
- Supprimer les endpoints `/cache/*` du serveur Express
- Simplifier le serveur Express à son rôle unique : OAuth token exchange
- Cache par clé avec TTL directement dans IndexedDB
- Cache en mémoire (Map) pour les données super-fréquentes (playback state)

#### 1.2 — Refonte du système de rate limiting
```typescript
// NOUVEAU : Queue intelligente avec backoff exponentiel
const API_CONFIG = {
  minDelayBetweenRequests: 500,    // 500ms entre chaque requête
  maxConcurrent: 1,                 // 1 requête à la fois
  backoffMultiplier: 2,             // Doublement du délai après 429
  maxBackoffDelay: 60000,           // Max 60s de pause
  initialBackoffDelay: 2000,        // 2s initial
};
```

#### 1.3 — État global partagé
```
AVANT : Chaque composant a son propre state + fait ses propres appels API
APRÈS : Store centralisé (React Context ou Zustand) avec :
  - profile
  - playlists (liste)
  - currentPlayback
  - likedTracks (Set)
  - topArtists
  - recentlyPlayed
  - cache local
```

### Phase 2 : Optimisation des appels API

| Problème | Solution |
|----------|---------|
| Player polling 5s | Polling 30s + WebSocket si possible |
| Promise.all de 5 requêtes | Sequential avec cache-first |
| `fetch()` direct | Tout passer par `spotifyFetch` |
| Pas de batch | Utiliser `GET /v1/tracks?ids=...` |
| Pas de `fields` parameter | Ajouter `fields=` à toutes les requêtes playlist |
| fetchPlaylists limit=10 | Fonctionnel mais paginer si l'utilisateur a plus de 10 playlists |
| Audio features (deprecated) | Retirer ou mettre en fallback gracieux |

### Phase 3 : Fonctionnalités manquantes

| Fonctionnalité | Endpoints nécessaires |
|----------------|----------------------|
| **Recherche** | `GET /v1/search` |
| **Parcourir (vrais genres)** | `GET /v1/browse/categories` + `.../playlists` |
| **Nouvelles sorties** | `GET /v1/browse/new-releases` |
| **Radio personnalisée** | `GET /v1/recommendations` |
| **Créer playlist** | `POST /v1/users/{id}/playlists` |
| **Editer playlist** | `PUT /v1/playlists/{id}` + `POST/DELETE .../tracks` |
| **Ajouter à la queue** | `POST /v1/me/player/queue` |
| **Profil complet** | `GET /v1/me` + `GET /v1/me/following` |
| **Liked Songs** | `GET /v1/me/tracks` (paginé) |
| **Albums sauvegardés** | `GET /v1/me/albums` |

### Phase 4 : Frontend

| Problème | Solution |
|----------|---------|
| `overflow: hidden` sur main | `overflow-y: auto` ou scroll containers par page |
| Styles inline | Classes CSS dans les fichiers de styles modulaires |
| Pas de responsive | Media queries + CSS Grid/Flexbox adaptatif |
| Pas de skeleton loading | Composants Skeleton réutilisables |
| Pas de gestion d'erreur | Error boundaries + composant d'erreur |
| Background flicker | Preload images + crossfade CSS |
| Animations manquantes | framer-motion page transitions |

---

## 6. ARCHITECTURE CIBLE

### Stack

```
Frontend :
├── React 18
├── TypeScript
├── Vite
├── framer-motion (animations)
├── lucide-react (icônes)
├── Zustand (state management) ← NOUVEAU
├── idb-keyval (IndexedDB cache) ← NOUVEAU
└── CSS Modules ou Vanilla CSS modulaire

Backend (minimal) :
├── Express (uniquement OAuth)
└── Pas de SQLite, pas de cache serveur
```

### Structure fichiers cible

```
src/
├── api/
│   ├── client.ts          # spotifyFetch avec queue, cache, retry
│   ├── albums.ts          # Endpoints albums
│   ├── artists.ts         # Endpoints artistes
│   ├── auth.ts            # OAuth helpers
│   ├── browse.ts          # Categories, featured, new releases
│   ├── player.ts          # Playback controls
│   ├── playlists.ts       # CRUD playlists
│   ├── search.ts          # Recherche
│   ├── tracks.ts          # Tracks + saved tracks
│   └── users.ts           # Profile, top, following
├── cache/
│   ├── indexedDB.ts       # Cache IndexedDB
│   └── memoryCache.ts     # Cache mémoire volatile
├── store/
│   ├── usePlayerStore.ts  # État du player
│   ├── useLibraryStore.ts # Playlists, liked songs, albums
│   ├── useAuthStore.ts    # Token, profile
│   └── useUIStore.ts      # Navigation, modals, panels
├── components/
│   ├── layout/
│   │   ├── Topbar.tsx
│   │   ├── Sidebar.tsx    ← NOUVEAU
│   │   ├── Player.tsx
│   │   └── AppShell.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Search.tsx     ← NOUVEAU
│   │   ├── Browse.tsx
│   │   ├── Library.tsx    ← NOUVEAU (liked songs + albums + playlists)
│   │   ├── ArtistPage.tsx
│   │   ├── AlbumPage.tsx
│   │   ├── PlaylistPage.tsx
│   │   ├── TrackPage.tsx
│   │   ├── Profile.tsx    ← NOUVEAU
│   │   └── Radio.tsx
│   ├── shared/
│   │   ├── Skeleton.tsx   ← NOUVEAU
│   │   ├── ErrorFallback.tsx ← NOUVEAU
│   │   ├── TrackRow.tsx
│   │   ├── CardGrid.tsx
│   │   ├── ScrollRow.tsx
│   │   └── LikeButton.tsx
│   └── player/
│       ├── PlayerBar.tsx
│       ├── QueuePanel.tsx
│       ├── LyricsPanel.tsx
│       └── DevicesPanel.tsx
├── hooks/
│   ├── useSpotifyQuery.ts # Hook custom pour fetch + cache + retry
│   ├── useDebounce.ts
│   └── useIntersectionObserver.ts ← pour lazy loading
├── styles/
│   ├── base.css
│   ├── layout.css
│   ├── player.css
│   ├── search.css
│   ├── cards.css
│   ├── pages/
│   │   ├── artist.css
│   │   ├── album.css
│   │   └── ...
│   └── components/
│       ├── skeleton.css
│       └── ...
└── utils/
    ├── formatters.ts      # formatMs, formatNumber, etc.
    └── colors.ts          # Extraction couleur dominante
```

### Flux de données optimisé

```
Composant → useSpotifyQuery(key, fetcher, TTL)
                    ↓
            1. Check Memory Cache (instantané)
                    ↓ miss
            2. Check IndexedDB Cache (< 5ms)
                    ↓ miss
            3. Queue → spotifyFetch → API Spotify
                    ↓ success
            4. Write to IndexedDB + Memory Cache
                    ↓
            5. Return data to component
```

---

## RÉSUMÉ DES ACTIONS IMMÉDIATES

| # | Action | Priorité | Impact |
|---|--------|----------|--------|
| 1 | Remplacer le cache SQLite par IndexedDB | 🔴 CRITIQUE | Stockage vraiment local |
| 2 | Réduire le polling du player à 30s | 🔴 CRITIQUE | -90% appels player |
| 3 | Fixer tous les `fetch()` directs → `spotifyFetch` | 🔴 CRITIQUE | Rate limit handling |
| 4 | Implémenter un store global (Zustand) | 🔴 CRITIQUE | Éviter les re-fetch |
| 5 | Fixer `overflow: hidden` → permettre le scroll | 🟠 MAJEUR | UX de base |
| 6 | Implémenter `GET /v1/search` | 🟠 MAJEUR | Fonctionnalité clé |
| 7 | Implémenter `GET /v1/recommendations` pour la radio | 🟠 MAJEUR | Page radio fonctionnelle |
| 8 | Implémenter `GET /v1/browse/categories` | 🟠 MAJEUR | Page parcourir fonctionnelle |
| 9 | Supprimer les styles inline → CSS modules | 🟡 IMPORTANT | Maintenabilité |
| 10 | Ajouter le responsive design | 🟡 IMPORTANT | Accessibilité |
| 11 | Retirer ou graceful degrade `audio-features` | 🟡 IMPORTANT | Compatibilité |
| 12 | Ajouter skeleton loading | 🟡 IMPORTANT | UX perçue |
| 13 | Pages Profile & Settings fonctionnelles | 🔵 NICE-TO-HAVE | Complétude |
| 14 | Gestion des podcasts/shows | 🔵 NICE-TO-HAVE | Feature avancée |
| 15 | Ajouter à la queue depuis l'UI | 🔵 NICE-TO-HAVE | Meilleure UX |

---

> **Ce document sert de référence unique pour la refonte complète de l'application.**  
> Chaque endpoint listé ici est une documentation officielle de l'API Spotify Web API v1.  
> Les priorités sont classées par impact sur les problèmes actuels (rate limiting > stockage > frontend).
