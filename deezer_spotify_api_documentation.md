# 🎵 Documentation Technique — Architecture Deezer + Spotify
> **Deezer** pour les métadonnées & recherche (public, sans token) · **Spotify** pour le playback & la file d'attente
> Base URL Deezer : `https://api.deezer.com` · Base URL Spotify : `https://api.spotify.com/v1`
> *Mis à jour : Février 2026*

---

## 📋 Sommaire

1. [Concept de l'Architecture Hybride](#-concept-de-larchitecture-hybride)
2. [Deezer API — Vue d'ensemble](#-deezer-api--vue-densemble)
3. [Référence Complète Deezer (sans token)](#-référence-complète-deezer-sans-token)
   - [Search](#search--recherche)
   - [Artist](#artist--artiste)
   - [Album](#album--album)
   - [Track](#track--piste)
   - [Chart](#chart--classements)
   - [Genre](#genre--genres)
   - [Editorial](#editorial--éditorial)
   - [Playlist](#playlist--playlists)
   - [Radio](#radio--radios)
   - [Podcast & Episode](#podcast--épisode)
4. [Objets de Réponse Deezer](#-objets-de-réponse-deezer)
5. [Spotify API — Playback & Queue](#-spotify-api--playback--queue)
6. [Pont ISRC — Clé de l'Intégration](#-pont-isrc--clé-de-lintégration)
7. [Flux d'Intégration Complet](#-flux-dintégration-complet)
8. [Exemples de Code](#-exemples-de-code)
9. [Limites & Contraintes](#-limites--contraintes)

---

## 🏗️ Concept de l'Architecture Hybride

L'idée centrale est d'exploiter le meilleur de chaque plateforme :

```
┌─────────────────────────────────────────────────────────────┐
│                    VOTRE APPLICATION                        │
│                                                             │
│  ┌──────────────────┐       ┌──────────────────────────┐   │
│  │   DEEZER API     │       │     SPOTIFY API          │   │
│  │  (sans token)    │       │  (OAuth requis)          │   │
│  │                  │       │                          │   │
│  │  • Recherche     │──────▶│  • Lecture audio         │   │
│  │  • Métadonnées   │  ISRC │  • File d'attente        │   │
│  │  • Artistes      │       │  • Contrôle playback     │   │
│  │  • Albums/EP/    │       │  • Transfert d'appareil  │   │
│  │    Singles       │       │  • Volume, shuffle...    │   │
│  │  • Cover Art     │       │                          │   │
│  │  • Genres        │       │                          │   │
│  │  • Charts        │       │                          │   │
│  └──────────────────┘       └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Pourquoi cette approche ?**
- Deezer offre une API publique **sans authentification** pour les métadonnées (recherche, artistes, albums, cover art)
- Spotify dispose du **meilleur SDK de lecture** (Web Playback, contrôle complet) mais nécessite un token Premium
- Le champ `isrc` de Deezer permet de **retrouver le track Spotify correspondant** via `GET /search?q=isrc:{isrc}&type=track`
- Les images Deezer (`picture_xl` = 1000×1000px) sont **supérieures aux images Spotify** post-restrictions de février 2026

---

## 🎵 Deezer API — Vue d'ensemble

### Informations générales

| Propriété | Valeur |
|---|---|
| Base URL | `https://api.deezer.com` |
| Format de réponse | JSON (+ JSONP avec `output=jsonp&callback=func`) |
| Authentification | **Aucune** pour les endpoints publics |
| Rate limit | ~50 requêtes / 5 secondes par IP |
| CORS | ❌ Bloqué en navigateur → utiliser JSONP ou un proxy backend |
| Pagination | Paramètres `limit` (max 100) et `index` (offset) |
| Streaming | 30 secondes preview MP3 uniquement (champ `preview`) |
| Images artiste | `picture`, `picture_small`, `picture_medium`, `picture_big`, `picture_xl` |

### Paramètres globaux disponibles

| Paramètre | Type | Description |
|---|---|---|
| `limit` | int | Nombre de résultats (défaut : 25, max : 100) |
| `index` | int | Offset de pagination (défaut : 0) |
| `output` | string | Format de réponse : `json` (défaut) ou `jsonp` |
| `callback` | string | Nom de la fonction callback pour JSONP |

---

## 📚 Référence Complète Deezer (sans token)

---

### Search — Recherche

> Base URL : `https://api.deezer.com/search`

#### Paramètres de recherche avancée

| Paramètre | Description | Exemple |
|---|---|---|
| `q` | Requête libre | `q=daft punk` |
| `strict` | Mode strict (exact match) | `strict=on` |
| `order` | Ordre de tri | voir tableau ci-dessous |

**Valeurs de `order` :**

| Valeur | Description |
|---|---|
| `RANKING` | Par popularité (défaut) |
| `TRACK_ASC` / `TRACK_DESC` | Par titre de track |
| `ARTIST_ASC` / `ARTIST_DESC` | Par nom d'artiste |
| `ALBUM_ASC` / `ALBUM_DESC` | Par titre d'album |
| `RATING_ASC` / `RATING_DESC` | Par note utilisateur |
| `DURATION_ASC` / `DURATION_DESC` | Par durée |

**Filtres dans la query `q` :**

```
artist:"Daft Punk"
album:"Random Access Memories"
track:"Get Lucky"
label:"Columbia"
dur_min:120        # durée minimale en secondes
dur_max:300        # durée maximale en secondes
bpm_min:120        # BPM minimal
bpm_max:140        # BPM maximal
```

**Exemples combinés :**
```
q=artist:"Daft Punk" album:"Discovery"
q=track:"Harder Better Faster" dur_min:220
```

#### Endpoints de recherche

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/search` | Recherche globale (tracks) | ❌ |
| `GET` | `/search/track` | Recherche de tracks | ❌ |
| `GET` | `/search/album` | Recherche d'albums | ❌ |
| `GET` | `/search/artist` | Recherche d'artistes | ❌ |
| `GET` | `/search/playlist` | Recherche de playlists | ❌ |
| `GET` | `/search/podcast` | Recherche de podcasts | ❌ |
| `GET` | `/search/radio` | Recherche de radios | ❌ |
| `GET` | `/search/user` | Recherche d'utilisateurs | ❌ |

**Exemple de requête :**
```
GET https://api.deezer.com/search/artist?q=Daft+Punk&limit=5&order=RANKING
```

**Structure de réponse :**
```json
{
  "data": [ { /* objets du type recherché */ } ],
  "total": 247,
  "next": "https://api.deezer.com/search/artist?q=Daft+Punk&index=25"
}
```

---

### Artist — Artiste

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/artist/{id}` | Profil complet d'un artiste | ❌ |
| `GET` | `/artist/{id}/top` | Top tracks de l'artiste | ❌ |
| `GET` | `/artist/{id}/albums` | Tous les albums / singles / EPs | ❌ |
| `GET` | `/artist/{id}/related` | Artistes similaires | ❌ |
| `GET` | `/artist/{id}/radio` | Radio générée à partir de l'artiste | ❌ |
| `GET` | `/artist/{id}/playlists` | Playlists Deezer incluant cet artiste | ❌ |
| `GET` | `/artist/{id}/fans` | Nombre de fans (nécessite token) | 🔒 |
| `GET` | `/artist/{id}/comments` | Commentaires (nécessite token) | 🔒 |

**Paramètre spécifique pour `/artist/{id}/albums` :**

```
?record_type=album    # albums complets uniquement
?record_type=single   # singles uniquement
?record_type=ep       # EPs uniquement
?record_type=all      # tous (défaut)
```

**Exemple — Récupérer tous les singles d'un artiste :**
```
GET https://api.deezer.com/artist/27/albums?record_type=single&limit=50
```

---

### Album — Album

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/album/{id}` | Métadonnées complètes d'un album | ❌ |
| `GET` | `/album/{id}/tracks` | Toutes les tracks d'un album | ❌ |
| `GET` | `/album/{id}/fans` | Fans de l'album (nécessite token) | 🔒 |
| `GET` | `/album/{id}/comments` | Commentaires | 🔒 |

**Lookup par UPC :**
```
GET https://api.deezer.com/album/upc:{UPC_CODE}
```

---

### Track — Piste

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/track/{id}` | Métadonnées complètes d'une track | ❌ |

**Lookup par ISRC (non documenté officiel mais fonctionnel) :**
```
GET https://api.deezer.com/track/isrc:{ISRC_CODE}
# Exemple: GET https://api.deezer.com/track/isrc:USQX91300105
```

> ⚠️ Si plusieurs tracks partagent le même ISRC, seule la première est retournée.

---

### Chart — Classements

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/chart` | Top global (tracks, albums, artistes, playlists) | ❌ |
| `GET` | `/chart/0/tracks` | Top tracks global | ❌ |
| `GET` | `/chart/0/albums` | Top albums global | ❌ |
| `GET` | `/chart/0/artists` | Top artistes global | ❌ |
| `GET` | `/chart/0/playlists` | Top playlists global | ❌ |
| `GET` | `/chart/0/podcasts` | Top podcasts global | ❌ |
| `GET` | `/chart/{genre_id}/tracks` | Top tracks par genre | ❌ |
| `GET` | `/chart/{genre_id}/albums` | Top albums par genre | ❌ |
| `GET` | `/chart/{genre_id}/artists` | Top artistes par genre | ❌ |
| `GET` | `/chart/{genre_id}/playlists` | Top playlists par genre | ❌ |
| `GET` | `/chart/{genre_id}/podcasts` | Top podcasts par genre | ❌ |

> `0` = classement global. Pour un genre spécifique, utiliser l'ID du genre (ex : `132` = Pop).

---

### Genre — Genres

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/genre` | Liste de tous les genres musicaux | ❌ |
| `GET` | `/genre/{id}` | Détails d'un genre | ❌ |
| `GET` | `/genre/{id}/artists` | Artistes de ce genre | ❌ |
| `GET` | `/genre/{id}/podcasts` | Podcasts de ce genre | ❌ |
| `GET` | `/genre/{id}/radios` | Radios de ce genre | ❌ |

**Genres principaux et leurs IDs :**

| ID | Genre |
|---|---|
| 0 | Tous genres |
| 132 | Pop |
| 116 | Rap/Hip-Hop |
| 152 | Rock |
| 113 | Dance |
| 165 | R&B |
| 166 | Electro |
| 464 | Reggae |
| 197 | Metal |
| 144 | Classique |
| 75 | Jazz |
| 129 | Soul & Funk |
| 153 | Country |
| 173 | Afrobeats |

---

### Editorial — Éditorial

Les editorials sont des sélections curatoriales de Deezer par genre.

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/editorial` | Liste de tous les éditoriaux | ❌ |
| `GET` | `/editorial/{id}` | Détails d'un éditorial | ❌ |
| `GET` | `/editorial/{id}/selection` | Sélection musicale de cet éditorial | ❌ |
| `GET` | `/editorial/{id}/charts` | Charts de cet éditorial | ❌ |
| `GET` | `/editorial/{id}/releases` | Nouvelles sorties de cet éditorial | ❌ |

> L'ID de l'éditorial correspond généralement à l'ID du genre.

---

### Playlist — Playlists

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/playlist/{id}` | Détails d'une playlist publique | ❌ |
| `GET` | `/playlist/{id}/tracks` | Tracks d'une playlist | ❌ |
| `GET` | `/playlist/{id}/radio` | Radio basée sur la playlist | ❌ |
| `GET` | `/playlist/{id}/fans` | Fans de la playlist | ❌ |
| `GET` | `/playlist/{id}/comments` | Commentaires | 🔒 |

---

### Radio — Radios

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/radio` | Liste des radios disponibles | ❌ |
| `GET` | `/radio/{id}` | Détails d'une radio | ❌ |
| `GET` | `/radio/{id}/tracks` | Tracks d'une radio | ❌ |
| `GET` | `/radio/genres` | Radios par genre | ❌ |
| `GET` | `/radio/top` | Top 5 des radios | ❌ |
| `GET` | `/radio/lists` | Toutes les listes de radios | ❌ |

---

### Podcast & Épisode

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/podcast/{id}` | Détails d'un podcast | ❌ |
| `GET` | `/podcast/{id}/episodes` | Épisodes d'un podcast | ❌ |
| `GET` | `/episode/{id}` | Détails d'un épisode | ❌ |

---

### Endpoints Utilitaires

| Méthode | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/infos` | Informations sur l'API, version, pays | ❌ |
| `GET` | `/options` | Options disponibles pour l'app | ❌ |

---

## 🗂️ Objets de Réponse Deezer

### Objet Artist (complet — `/artist/{id}`)

```json
{
  "id": 27,
  "name": "Daft Punk",
  "link": "https://www.deezer.com/artist/27",
  "share": "https://www.deezer.com/artist/27?utm_source=deezer",
  "picture": "https://e-cdns-images.dzcdn.net/images/artist/{md5}/56x56-000000-80-0-0.jpg",
  "picture_small": "https://e-cdns-images.dzcdn.net/images/artist/{md5}/56x56-000000-80-0-0.jpg",
  "picture_medium": "https://e-cdns-images.dzcdn.net/images/artist/{md5}/250x250-000000-80-0-0.jpg",
  "picture_big": "https://e-cdns-images.dzcdn.net/images/artist/{md5}/500x500-000000-80-0-0.jpg",
  "picture_xl": "https://e-cdns-images.dzcdn.net/images/artist/{md5}/1000x1000-000000-80-0-0.jpg",
  "nb_album": 28,
  "nb_fan": 7842163,
  "radio": true,
  "tracklist": "https://api.deezer.com/artist/27/top?limit=50",
  "type": "artist"
}
```

**Construction des URLs d'images :**
```
https://e-cdns-images.dzcdn.net/images/artist/{md5_image}/{WIDTH}x{HEIGHT}-000000-80-0-0.jpg
```

Tailles disponibles (passer n'importe quelle résolution) :
- `56x56` — miniature
- `250x250` — medium
- `500x500` — grande
- `1000x1000` — XL (meilleure qualité)

### Objet Artist (simplifié — dans une réponse Search ou Album)

```json
{
  "id": 27,
  "name": "Daft Punk",
  "tracklist": "https://api.deezer.com/artist/27/top?limit=50",
  "type": "artist"
}
```

---

### Objet Album (complet — `/album/{id}`)

```json
{
  "id": 302127,
  "title": "Discovery",
  "upc": "724384960650",
  "link": "https://www.deezer.com/album/302127",
  "share": "https://www.deezer.com/album/302127?utm_source=deezer",
  "cover": "https://e-cdns-images.dzcdn.net/images/cover/{md5}/56x56-000000-80-0-0.jpg",
  "cover_small": "https://e-cdns-images.dzcdn.net/images/cover/{md5}/56x56-000000-80-0-0.jpg",
  "cover_medium": "https://e-cdns-images.dzcdn.net/images/cover/{md5}/250x250-000000-80-0-0.jpg",
  "cover_big": "https://e-cdns-images.dzcdn.net/images/cover/{md5}/500x500-000000-80-0-0.jpg",
  "cover_xl": "https://e-cdns-images.dzcdn.net/images/cover/{md5}/1000x1000-000000-80-0-0.jpg",
  "md5_image": "2e018122cb56986277102d2041a592c8",
  "genre_id": 113,
  "genres": {
    "data": [
      { "id": 113, "name": "Dance", "picture": "...", "type": "genre" }
    ]
  },
  "label": "Virgin Records",
  "nb_tracks": 14,
  "duration": 3664,
  "fans": 1234567,
  "release_date": "2001-02-26",
  "record_type": "album",
  "available": true,
  "tracklist": "https://api.deezer.com/album/302127/tracks",
  "explicit_lyrics": false,
  "explicit_content_lyrics": 0,
  "explicit_content_cover": 0,
  "contributors": [
    {
      "id": 27,
      "name": "Daft Punk",
      "role": "Main"
    }
  ],
  "artist": {
    "id": 27,
    "name": "Daft Punk",
    "picture_small": "...",
    "picture_medium": "...",
    "picture_big": "...",
    "picture_xl": "...",
    "tracklist": "https://api.deezer.com/artist/27/top?limit=50",
    "type": "artist"
  },
  "type": "album",
  "tracks": {
    "data": [ { /* Objets Track simplifiés */ } ]
  }
}
```

**Valeurs de `record_type` :**

| Valeur | Description |
|---|---|
| `album` | Album complet |
| `single` | Single (1 à 3 tracks) |
| `ep` | Extended Play (3 à 6 tracks) |
| `compile` | Compilation |

**Valeurs de `explicit_content_lyrics` :**

| Valeur | Signification |
|---|---|
| `0` | Pas de paroles explicites |
| `1` | Paroles explicites |
| `2` | Non disponible |
| `4` | Non applicable |
| `6` | Inconnu |

---

### Objet Track (complet — `/track/{id}`)

```json
{
  "id": 3135556,
  "readable": true,
  "title": "Harder, Better, Faster, Stronger",
  "title_short": "Harder, Better, Faster, Stronger",
  "title_version": "",
  "isrc": "GBDUW0000059",
  "link": "https://www.deezer.com/track/3135556",
  "share": "https://www.deezer.com/track/3135556?utm_source=deezer",
  "duration": 224,
  "track_position": 3,
  "disk_number": 1,
  "rank": 862812,
  "release_date": "2001-02-26",
  "explicit_lyrics": false,
  "explicit_content_lyrics": 0,
  "explicit_content_cover": 0,
  "preview": "https://cdns-preview-d.dzcdn.net/stream/c-{hash}-3.mp3",
  "bpm": 123.0,
  "gain": -12.4,
  "available_countries": ["FR", "US", "GB", "DE"],
  "contributors": [
    {
      "id": 27,
      "name": "Daft Punk",
      "link": "https://www.deezer.com/artist/27",
      "picture_xl": "...",
      "role": "Main"
    }
  ],
  "md5_image": "2e018122cb56986277102d2041a592c8",
  "artist": {
    "id": 27,
    "name": "Daft Punk",
    "link": "https://www.deezer.com/artist/27",
    "picture_medium": "...",
    "picture_big": "...",
    "picture_xl": "...",
    "tracklist": "https://api.deezer.com/artist/27/top?limit=50",
    "type": "artist"
  },
  "album": {
    "id": 302127,
    "title": "Discovery",
    "link": "https://www.deezer.com/album/302127",
    "cover": "...",
    "cover_small": "...",
    "cover_medium": "...",
    "cover_big": "...",
    "cover_xl": "...",
    "md5_image": "2e018122cb56986277102d2041a592c8",
    "release_date": "2001-02-26",
    "tracklist": "https://api.deezer.com/album/302127/tracks",
    "type": "album"
  },
  "type": "track"
}
```

**Champs importants :**

| Champ | Type | Description |
|---|---|---|
| `isrc` | string | **Clé du pont Spotify** — identifiant universel de la track |
| `preview` | string | URL MP3 30 secondes (public, gratuit) |
| `bpm` | float | Tempo (uniquement sur `/track/{id}` direct) |
| `gain` | float | Gain audio en dB |
| `rank` | int | Popularité Deezer (0 → max) |
| `readable` | bool | `true` = disponible dans votre zone géographique |
| `available_countries` | array | Codes pays ISO 3166-1 alpha-2 |

---

### Objet Track (simplifié — dans Search / Album / Playlist)

Quand les tracks apparaissent dans un résultat de recherche ou de liste d'album, certains champs sont **absents** :

```json
{
  "id": 3135556,
  "readable": true,
  "title": "Harder, Better, Faster, Stronger",
  "title_short": "...",
  "title_version": "",
  "isrc": "GBDUW0000059",
  "link": "...",
  "duration": 224,
  "rank": 862812,
  "explicit_lyrics": false,
  "preview": "https://cdns-preview-d.dzcdn.net/...",
  "md5_image": "...",
  "artist": { /* simplifié */ },
  "album": { /* simplifié */ },
  "type": "track"
  // ❌ bpm, gain, available_countries, contributors absents
}
```

> **Stratégie :** Pour obtenir `bpm`, `gain` et `contributors`, toujours faire un second appel sur `/track/{id}`.

---

## 🎧 Spotify API — Playback & Queue

> **Scope requis :** `user-modify-playback-state` (écriture) · `user-read-playback-state` (lecture)  
> **Compte requis :** Spotify **Premium** pour le contrôle playback

### Endpoints Player (tous actifs — non supprimés en février 2026)

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/me/player` | État de lecture actuel (device, track, progression) |
| `PUT` | `/me/player` | Transférer la lecture vers un autre appareil |
| `GET` | `/me/player/devices` | Liste des appareils disponibles |
| `GET` | `/me/player/currently-playing` | Track en cours |
| `PUT` | `/me/player/play` | ▶ Démarrer / Reprendre la lecture |
| `PUT` | `/me/player/pause` | ⏸ Pause |
| `POST` | `/me/player/next` | ⏭ Track suivante |
| `POST` | `/me/player/previous` | ⏮ Track précédente |
| `PUT` | `/me/player/seek` | ⏩ Seek à une position (ms) |
| `PUT` | `/me/player/repeat` | 🔁 Mode répétition (`track`, `context`, `off`) |
| `PUT` | `/me/player/volume` | 🔊 Volume (0–100) |
| `PUT` | `/me/player/shuffle` | 🔀 Mode shuffle (`true`/`false`) |
| `GET` | `/me/player/recently-played` | Historique de lecture |
| `GET` | `/me/player/queue` | File d'attente actuelle |
| `POST` | `/me/player/queue` | ➕ Ajouter un item à la file d'attente |

### Endpoint Search (pour le pont ISRC)

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/search` | Recherche par ISRC → obtenir le Spotify URI |

**⚠️ Rappel changement février 2026 :** `limit` max = 10, défaut = 5

### Payloads clés

**Lancer la lecture d'un track Spotify URI :**
```http
PUT https://api.spotify.com/v1/me/player/play
Authorization: Bearer {token}
Content-Type: application/json

{
  "uris": ["spotify:track:4uLU6hMCjMI75M1A2tKUQC"],
  "position_ms": 0
}
```

**Ajouter un track à la file d'attente :**
```http
POST https://api.spotify.com/v1/me/player/queue?uri=spotify:track:4uLU6hMCjMI75M1A2tKUQC
Authorization: Bearer {token}
```

**Obtenir la file d'attente actuelle :**
```http
GET https://api.spotify.com/v1/me/player/queue
Authorization: Bearer {token}
```

**Transférer la lecture vers un appareil :**
```http
PUT https://api.spotify.com/v1/me/player
Authorization: Bearer {token}
Content-Type: application/json

{
  "device_ids": ["{spotify_device_id}"],
  "play": true
}
```

---

## 🔗 Pont ISRC — Clé de l'Intégration

L'**ISRC** (International Standard Recording Code) est l'identifiant universel d'un enregistrement musical. Il est présent dans les deux APIs et constitue le lien parfait entre Deezer et Spotify.

### Flux de résolution ISRC → Spotify URI

```
Deezer Track → champ "isrc" → Spotify Search → Spotify URI
```

**Étape 1 — Récupérer l'ISRC depuis Deezer :**
```
GET https://api.deezer.com/track/3135556
→ isrc: "GBDUW0000059"
```

**Étape 2 — Rechercher par ISRC sur Spotify :**
```http
GET https://api.spotify.com/v1/search?q=isrc:GBDUW0000059&type=track&limit=1
Authorization: Bearer {token}
```

**Réponse Spotify :**
```json
{
  "tracks": {
    "items": [
      {
        "id": "4uLU6hMCjMI75M1A2tKUQC",
        "uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
        "name": "Harder, Better, Faster, Stronger"
      }
    ]
  }
}
```

**Étape 3 — Jouer sur Spotify :**
```http
PUT https://api.spotify.com/v1/me/player/play
{ "uris": ["spotify:track:4uLU6hMCjMI75M1A2tKUQC"] }
```

### Cas d'échec ISRC

Si le track Deezer n'existe pas sur Spotify via ISRC, les stratégies de fallback :

```
1. Recherche par titre + artiste :
   GET /search?q=track:"{title}" artist:"{artist}"&type=track

2. Recherche libre :
   GET /search?q={title} {artist}&type=track&limit=5
   → Comparer la durée avec duration Deezer pour choisir le bon résultat

3. Utiliser le preview Deezer (30s) comme fallback audio
```

---

## ⚡ Flux d'Intégration Complet

### Scénario 1 — Recherche et lecture d'un track

```
Utilisateur tape "Get Lucky Daft Punk"
         │
         ▼
GET /search/track?q=Get+Lucky+Daft+Punk&limit=10
         │
         ▼ Réponse Deezer (metadata + cover + ISRC)
         │
         ├── Afficher : titre, artiste, durée, cover_xl
         │
         ▼
GET /track/{deezer_id}  ← si bpm ou gain nécessaires
         │
         ▼
ISRC → GET /search?q=isrc:{isrc}&type=track (Spotify)
         │
         ├── [Succès] URI Spotify trouvé
         │         ▼
         │    PUT /me/player/play { uris: ["spotify:track:..."] }
         │
         └── [Échec ISRC] Fallback : Search titre+artiste Spotify
                   ▼
             Comparer durées → choisir meilleur match
                   ▼
             PUT /me/player/play
```

### Scénario 2 — Ajout à la file d'attente

```
Utilisateur clique "Ajouter à la file"
         │
         ▼
Vérifier si URI Spotify déjà résolu (cache)
         │
    ┌────┴────┐
  Cache    Pas en cache
    │            │
    ▼            ▼
URI connu   GET /track/{id} → ISRC → Spotify search
    │            │
    └──────┬─────┘
           ▼
POST /me/player/queue?uri={spotify_uri}
           │
           ▼
Feedback visuel : "Ajouté à la file ✓"
```

### Scénario 3 — Page Artiste complète

```
Clic sur un artiste (ID Deezer connu)
         │
         ├── GET /artist/{id}              → photo XL, nb_fan, radio
         ├── GET /artist/{id}/albums?record_type=album&limit=20  → albums
         ├── GET /artist/{id}/albums?record_type=single&limit=20 → singles
         ├── GET /artist/{id}/albums?record_type=ep&limit=20     → EPs
         ├── GET /artist/{id}/top?limit=10 → top tracks
         └── GET /artist/{id}/related     → artistes similaires

         Afficher simultanément :
         ├── Photo artiste (picture_xl = 1000×1000)
         ├── Nombre de fans
         ├── Top 10 tracks
         ├── Discographie complète (albums / singles / EPs / compilations)
         └── Artistes similaires
```

---

## 💻 Exemples de Code

### Client Deezer (TypeScript)

```typescript
const DEEZER_BASE = 'https://api.deezer.com';

interface DeezerTrack {
  id: number;
  title: string;
  isrc: string;
  duration: number;
  preview: string;
  rank: number;
  bpm?: number;
  artist: { id: number; name: string; picture_xl: string };
  album: { id: number; title: string; cover_xl: string };
}

interface DeezerArtist {
  id: number;
  name: string;
  picture_xl: string;
  nb_album: number;
  nb_fan: number;
}

// Recherche de tracks
async function searchTracks(query: string, limit = 25): Promise<DeezerTrack[]> {
  const res = await fetch(
    `${DEEZER_BASE}/search/track?q=${encodeURIComponent(query)}&limit=${limit}&order=RANKING`
  );
  const data = await res.json();
  return data.data;
}

// Recherche avancée avec filtres
async function searchAdvanced(opts: {
  artist?: string;
  album?: string;
  track?: string;
  bpmMin?: number;
  bpmMax?: number;
  durMin?: number;
  durMax?: number;
}) {
  let q = '';
  if (opts.artist) q += `artist:"${opts.artist}" `;
  if (opts.album)  q += `album:"${opts.album}" `;
  if (opts.track)  q += `track:"${opts.track}" `;
  if (opts.bpmMin) q += `bpm_min:${opts.bpmMin} `;
  if (opts.bpmMax) q += `bpm_max:${opts.bpmMax} `;
  if (opts.durMin) q += `dur_min:${opts.durMin} `;
  if (opts.durMax) q += `dur_max:${opts.durMax} `;
  
  const res = await fetch(`${DEEZER_BASE}/search?q=${encodeURIComponent(q.trim())}`);
  return (await res.json()).data;
}

// Profil artiste complet
async function getArtistFull(artistId: number) {
  const [profile, albums, singles, eps, topTracks, related] = await Promise.all([
    fetch(`${DEEZER_BASE}/artist/${artistId}`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/artist/${artistId}/albums?record_type=album&limit=50`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/artist/${artistId}/albums?record_type=single&limit=50`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/artist/${artistId}/albums?record_type=ep&limit=50`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/artist/${artistId}/top?limit=10`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/artist/${artistId}/related?limit=6`).then(r => r.json()),
  ]);

  return {
    profile,
    discography: { albums: albums.data, singles: singles.data, eps: eps.data },
    topTracks: topTracks.data,
    related: related.data,
  };
}

// Lookup par ISRC
async function getTrackByISRC(isrc: string): Promise<DeezerTrack | null> {
  try {
    const res = await fetch(`${DEEZER_BASE}/track/isrc:${isrc}`);
    const data = await res.json();
    return data.error ? null : data;
  } catch { return null; }
}

// Construction URL cover album en taille custom
function getCoverUrl(md5Image: string, size: 56|250|500|1000 = 500): string {
  return `https://e-cdns-images.dzcdn.net/images/cover/${md5Image}/${size}x${size}-000000-80-0-0.jpg`;
}

// Construction URL photo artiste en taille custom
function getArtistPicUrl(md5Image: string, size: 56|250|500|1000 = 500): string {
  return `https://e-cdns-images.dzcdn.net/images/artist/${md5Image}/${size}x${size}-000000-80-0-0.jpg`;
}
```

### Résolution ISRC → Spotify URI (TypeScript)

```typescript
const SPOTIFY_BASE = 'https://api.spotify.com/v1';

// Cache local pour éviter les appels répétés
const isrcToSpotifyUri = new Map<string, string | null>();

async function resolveSpotifyUri(
  deezerTrack: DeezerTrack,
  spotifyToken: string
): Promise<string | null> {
  const { isrc, title, artist, duration } = deezerTrack;

  // Vérification cache
  if (isrcToSpotifyUri.has(isrc)) {
    return isrcToSpotifyUri.get(isrc)!;
  }

  // Tentative 1 : recherche par ISRC
  const isrcRes = await fetch(
    `${SPOTIFY_BASE}/search?q=isrc:${isrc}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${spotifyToken}` } }
  );
  const isrcData = await isrcRes.json();
  
  if (isrcData.tracks?.items?.length > 0) {
    const uri = isrcData.tracks.items[0].uri;
    isrcToSpotifyUri.set(isrc, uri);
    return uri;
  }

  // Tentative 2 : recherche titre + artiste
  const query = `track:"${title}" artist:"${artist.name}"`;
  const fallbackRes = await fetch(
    `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${spotifyToken}` } }
  );
  const fallbackData = await fallbackRes.json();
  
  if (fallbackData.tracks?.items?.length > 0) {
    // Choisir le track dont la durée est la plus proche
    const best = fallbackData.tracks.items
      .sort((a: any, b: any) =>
        Math.abs(a.duration_ms / 1000 - duration) -
        Math.abs(b.duration_ms / 1000 - duration)
      )[0];
    
    const uri = best.uri;
    isrcToSpotifyUri.set(isrc, uri);
    return uri;
  }

  isrcToSpotifyUri.set(isrc, null);
  return null; // Utiliser preview Deezer comme fallback
}

// Jouer un track Deezer via Spotify
async function playDeezerTrack(
  deezerTrack: DeezerTrack,
  spotifyToken: string,
  deviceId?: string
): Promise<boolean> {
  const spotifyUri = await resolveSpotifyUri(deezerTrack, spotifyToken);
  
  if (!spotifyUri) {
    // Fallback : jouer le preview 30s Deezer
    console.warn('Track non trouvé sur Spotify, fallback preview Deezer');
    const audio = new Audio(deezerTrack.preview);
    audio.play();
    return false;
  }

  const body: any = { uris: [spotifyUri], position_ms: 0 };
  if (deviceId) body.device_id = deviceId;

  await fetch(`${SPOTIFY_BASE}/me/player/play`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  return true;
}

// Ajouter à la file Spotify
async function addToSpotifyQueue(
  deezerTrack: DeezerTrack,
  spotifyToken: string
): Promise<boolean> {
  const spotifyUri = await resolveSpotifyUri(deezerTrack, spotifyToken);
  if (!spotifyUri) return false;

  await fetch(`${SPOTIFY_BASE}/me/player/queue?uri=${spotifyUri}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${spotifyToken}` },
  });
  
  return true;
}
```

### Contrôleur de Playback Spotify

```typescript
class SpotifyController {
  constructor(private token: string) {}

  private async req(method: string, path: string, body?: object) {
    return fetch(`${SPOTIFY_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // ▶ Play / Resume
  async play(uris?: string[], deviceId?: string) {
    return this.req('PUT', '/me/player/play', { uris, device_id: deviceId });
  }

  // ⏸ Pause
  async pause() { return this.req('PUT', '/me/player/pause'); }

  // ⏭ Suivant
  async next() { return this.req('POST', '/me/player/next'); }

  // ⏮ Précédent
  async previous() { return this.req('POST', '/me/player/previous'); }

  // ⏩ Seek (ms)
  async seek(positionMs: number) {
    return this.req('PUT', `/me/player/seek?position_ms=${positionMs}`);
  }

  // 🔊 Volume (0-100)
  async setVolume(pct: number) {
    return this.req('PUT', `/me/player/volume?volume_percent=${pct}`);
  }

  // 🔀 Shuffle
  async setShuffle(state: boolean) {
    return this.req('PUT', `/me/player/shuffle?state=${state}`);
  }

  // 🔁 Répétition
  async setRepeat(mode: 'track' | 'context' | 'off') {
    return this.req('PUT', `/me/player/repeat?state=${mode}`);
  }

  // 📋 File d'attente
  async getQueue() {
    const res = await this.req('GET', '/me/player/queue');
    return res.json();
  }

  // ➕ Ajouter à la file
  async addToQueue(uri: string) {
    return this.req('POST', `/me/player/queue?uri=${uri}`);
  }

  // 📱 Appareils disponibles
  async getDevices() {
    const res = await this.req('GET', '/me/player/devices');
    return res.json();
  }

  // 🔄 État complet du player
  async getState() {
    const res = await this.req('GET', '/me/player');
    return res.json();
  }

  // 📱 Transférer vers un appareil
  async transferTo(deviceId: string, play = true) {
    return this.req('PUT', '/me/player', {
      device_ids: [deviceId],
      play,
    });
  }
}
```

---

## ⚠️ Limites & Contraintes

### Deezer

| Limitation | Détail |
|---|---|
| Streaming | **30 secondes maximum** via `preview` URL. L'audio complet nécessite le SDK natif Deezer (déprécié) |
| CORS | Les appels depuis un navigateur sont bloqués → utiliser un **proxy backend** ou **JSONP** |
| Rate limit | ~50 req / 5s par IP. En cas de dépassement : `HTTP 429` |
| Images | Interdiction de **stocker les images** localement (conditions d'utilisation) |
| Données privées | Genre/biographie d'artiste **non disponibles publiquement** |
| Pagination max | `limit=100` maximum par requête |
| Données utilisateur | Favoris, historique, playlists privées → nécessitent OAuth |

### Spotify (post-février 2026)

| Limitation | Détail |
|---|---|
| Development Mode | 1 Client ID, 5 utilisateurs max, compte Premium requis |
| Search limit | Max 10 résultats par page (était 50 avant) |
| Batch endpoints | Tous supprimés → une requête par ressource |
| Profils autres users | `/users/{id}` supprimé |
| Top tracks artiste | `/artists/{id}/top-tracks` supprimé |
| Audio features | `/audio-features` batch supprimé (un par un encore possible) |
| Player | Requiert **Spotify Premium** |

### Stratégies de Contournement

**CORS sur Deezer :**
```javascript
// Option 1 : JSONP (browser uniquement)
const script = document.createElement('script');
script.src = `https://api.deezer.com/search?q=daft+punk&output=jsonp&callback=handleResult`;
document.body.appendChild(script);
window.handleResult = (data) => console.log(data);

// Option 2 : Proxy backend (recommandé)
// Votre serveur Node/Python relaie les requêtes Deezer
app.get('/api/deezer/*', async (req, res) => {
  const deezerUrl = `https://api.deezer.com/${req.params[0]}`;
  const response = await fetch(deezerUrl);
  res.json(await response.json());
});
```

**Cache ISRC pour limiter les appels Spotify :**
```javascript
// Stocker en localStorage ou Redis
const cache = {
  get: (isrc) => localStorage.getItem(`spotify_uri:${isrc}`),
  set: (isrc, uri) => localStorage.setItem(`spotify_uri:${isrc}`, uri ?? 'null'),
};
```

**Preview audio 30s comme fallback :**
```javascript
// Si le track n'existe pas sur Spotify
if (!spotifyUri && deezerTrack.preview) {
  const audio = new Audio(deezerTrack.preview);
  audio.play(); // 30s gratuit, pas de compte requis
}
```

---

## 📊 Tableau de Bord Récapitulatif

### Deezer — Endpoints publics (sans token)

| Catégorie | Endpoints | Token requis |
|---|---|---|
| Search | 8 endpoints | ❌ |
| Artist | 5 endpoints | ❌ |
| Album | 2 endpoints | ❌ |
| Track | 1 endpoint + lookup ISRC | ❌ |
| Chart | 11 endpoints | ❌ |
| Genre | 4 endpoints | ❌ |
| Editorial | 5 endpoints | ❌ |
| Playlist | 4 endpoints | ❌ |
| Radio | 6 endpoints | ❌ |
| Podcast/Episode | 3 endpoints | ❌ |
| Utilitaires | 2 endpoints | ❌ |
| **Total sans token** | **51 endpoints** | |
| User data (library, historique...) | ~15 endpoints | ✅ OAuth |

### Spotify — Endpoints actifs pour le playback

| Catégorie | Endpoints | Premium |
|---|---|---|
| Player (lecture, file, contrôles) | 15 endpoints | ✅ |
| Search (pont ISRC) | 1 endpoint | ❌ |
| **Total utilisé** | **16 endpoints** | |

---

## 🔗 Ressources

| Ressource | URL |
|---|---|
| Deezer Developers | https://developers.deezer.com |
| Deezer API FAQ | https://support.deezer.com/hc/en-gb/articles/360011538897 |
| Deezer Terms of Use | https://developers.deezer.com/termsofuse |
| Spotify Web API Docs | https://developer.spotify.com/documentation/web-api |
| Spotify Changelog Fév. 2026 | https://developer.spotify.com/documentation/web-api/references/changes/february-2026 |
| Spotify Player API | https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback |
| ISRC Standard | https://www.ifpi.org/isrc |

---

*Document généré le 19 février 2026*  
*Sources : developers.deezer.com · developer.spotify.com · deezer-python.readthedocs.io · changelog officiel Spotify février 2026*
