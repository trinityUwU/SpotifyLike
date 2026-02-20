# 🎵 Spotify Web API — Référence Complète
> **Mis à jour : Février 2026** | Base URL : `https://api.spotify.com/v1`

---

## ⚠️ ALERTE CRITIQUE — Changements Majeurs Février 2026

Spotify a effectué la **plus grande restriction de son API depuis son lancement**. Le 11 février 2026, de nouvelles règles sont entrées en vigueur pour tous les nouveaux `Client ID` en Development Mode. À partir du **9 mars 2026**, ces règles s'appliquent à **toutes les intégrations existantes**.

### Nouvelles contraintes du Development Mode
| Restriction | Détail |
|---|---|
| Compte requis | **Spotify Premium** obligatoire |
| Client IDs | Limité à **1 seul** Client ID par développeur |
| Utilisateurs autorisés | Maximum **5 utilisateurs** par Client ID |
| Endpoints disponibles | **Réduit à un sous-ensemble** d'endpoints |
| Usage autorisé | Apprentissage, expérimentation, projets personnels non-commerciaux uniquement |

> **Source officielle :** https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security

---

## 📋 Sommaire

1. [Changelog Février 2026](#-changelog-février-2026)
2. [Authentification & Autorisation](#-authentification--autorisation)
3. [Référence Complète des Endpoints](#-référence-complète-des-endpoints)
   - [Albums](#albums)
   - [Artists](#artists)
   - [Audiobooks](#audiobooks)
   - [Categories](#categories)
   - [Chapters](#chapters)
   - [Episodes](#episodes)
   - [Genres](#genres)
   - [Library (Nouveau système unifié)](#library--nouveau-système-unifié)
   - [Markets](#markets)
   - [Player](#player)
   - [Playlists](#playlists)
   - [Search](#search)
   - [Shows](#shows)
   - [Tracks](#tracks)
   - [Users](#users)
4. [Changements de Champs (Fields)](#-changements-de-champs-fields)
5. [Scopes OAuth](#-scopes-oauth)
6. [Rate Limits & Codes HTTP](#-rate-limits--codes-http)
7. [Guide de Migration](#-guide-de-migration)

---

## 🔴 Changelog Février 2026

### Endpoints SUPPRIMÉS ❌

| Méthode | Endpoint | Description | Remplacement |
|---|---|---|---|
| `POST` | `/users/{user_id}/playlists` | Créer playlist pour un utilisateur | `POST /me/playlists` |
| `GET` | `/artists/{id}/top-tracks` | Top tracks d'un artiste | ❌ Aucun |
| `GET` | `/markets` | Marchés disponibles | ❌ Aucun |
| `GET` | `/browse/new-releases` | Nouvelles sorties | ❌ Aucun |
| `GET` | `/albums` | Plusieurs albums (batch) | `GET /albums/{id}` individuellement |
| `GET` | `/artists` | Plusieurs artistes (batch) | `GET /artists/{id}` individuellement |
| `GET` | `/audiobooks` | Plusieurs audiobooks (batch) | `GET /audiobooks/{id}` individuellement |
| `GET` | `/browse/categories` | Catégories de navigation | ❌ Aucun |
| `GET` | `/browse/categories/{id}` | Catégorie unique | ❌ Aucun |
| `GET` | `/chapters` | Plusieurs chapitres (batch) | `GET /chapters/{id}` individuellement |
| `GET` | `/episodes` | Plusieurs épisodes (batch) | `GET /episodes/{id}` individuellement |
| `GET` | `/shows` | Plusieurs shows (batch) | `GET /shows/{id}` individuellement |
| `GET` | `/tracks` | Plusieurs tracks (batch) | `GET /tracks/{id}` individuellement |
| `GET` | `/users/{id}/playlists` | Playlists d'un utilisateur | ❌ Uniquement `/me/playlists` |
| `GET` | `/users/{id}` | Profil d'un utilisateur | ❌ Aucun |
| `PUT` | `/me/albums` | Sauvegarder albums | `PUT /me/library` |
| `PUT` | `/me/audiobooks` | Sauvegarder audiobooks | `PUT /me/library` |
| `PUT` | `/me/episodes` | Sauvegarder épisodes | `PUT /me/library` |
| `PUT` | `/me/shows` | Sauvegarder shows | `PUT /me/library` |
| `PUT` | `/me/tracks` | Sauvegarder tracks | `PUT /me/library` |
| `DELETE` | `/me/albums` | Supprimer albums | `DELETE /me/library` |
| `DELETE` | `/me/audiobooks` | Supprimer audiobooks | `DELETE /me/library` |
| `DELETE` | `/me/episodes` | Supprimer épisodes | `DELETE /me/library` |
| `DELETE` | `/me/shows` | Supprimer shows | `DELETE /me/library` |
| `DELETE` | `/me/tracks` | Supprimer tracks | `DELETE /me/library` |

### Endpoints AJOUTÉS ✅

| Méthode | Endpoint | Description |
|---|---|---|
| `PUT` | `/me/library` | Sauvegarder **n'importe quel** URI Spotify dans la bibliothèque (unifié) |
| `DELETE` | `/me/library` | Supprimer **n'importe quel** URI Spotify de la bibliothèque (unifié) |

### Endpoints MODIFIÉS ⚡

| Méthode | Endpoint | Changement |
|---|---|---|
| `GET` | `/search` | `limit` max réduit de 50 → **10**, valeur par défaut de 20 → **5** |
| `GET` | `/playlists/{id}` | Le champ `tracks` renommé en `items`. Contenu retourné **uniquement pour les playlists dont l'utilisateur est propriétaire ou collaborateur** |

---

## 🔐 Authentification & Autorisation

Base URL des tokens : `https://accounts.spotify.com`

### Flux disponibles

| Flux | Endpoint | Usage recommandé |
|---|---|---|
| **Authorization Code** | `GET /authorize` → `POST /api/token` | Apps serveur, accès long terme |
| **Authorization Code + PKCE** | `GET /authorize` → `POST /api/token` | Apps mobile/SPA, recommandé |
| **Client Credentials** | `POST /api/token` | Données publiques uniquement, pas de données utilisateur |
| ~~Implicit Grant~~ | ~~`GET /authorize`~~ | **Déprécié** — migrer vers PKCE |

### Headers requis pour tous les appels API

```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Refresh Token

```
POST https://accounts.spotify.com/api/token
Body: grant_type=refresh_token&refresh_token={token}
Headers: Authorization: Basic {base64(client_id:client_secret)}
```

---

## 📚 Référence Complète des Endpoints

> **Légende :**
> - ✅ Actif
> - ❌ Supprimé en février 2026
> - 🆕 Ajouté en février 2026
> - ⚡ Modifié en février 2026
> - 🔒 Scope requis indiqué entre parenthèses

---

### Albums

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/albums/{id}` | Métadonnées d'un album | ✅ |
| `GET` | `/albums/{id}/tracks` | Tracks d'un album | ✅ |
| ~~`GET`~~ | ~~`/albums`~~ | ~~Plusieurs albums en batch~~ | ❌ |
| `GET` | `/browse/new-releases` | Nouvelles sorties | ❌ |
| `GET` | `/me/albums` | Albums sauvegardés de l'utilisateur | ✅ |
| `GET` | `/me/albums/contains` | Vérifier si albums sont sauvegardés | ✅ |
| ~~`PUT`~~ | ~~`/me/albums`~~ | ~~Sauvegarder albums~~ | ❌ → `PUT /me/library` |
| ~~`DELETE`~~ | ~~`/me/albums`~~ | ~~Supprimer albums~~ | ❌ → `DELETE /me/library` |

**Champs supprimés des objets Album :**
- `album_group` — relation artiste/album
- `available_markets` — marchés disponibles
- `external_ids` — identifiants externes (ISRC, EAN, UPC)
- `label` — label du disque
- `popularity` — score de popularité (0-100)

---

### Artists

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/artists/{id}` | Métadonnées d'un artiste | ✅ |
| `GET` | `/artists/{id}/albums` | Albums d'un artiste | ✅ |
| ~~`GET`~~ | ~~`/artists/{id}/top-tracks`~~ | ~~Top tracks d'un artiste~~ | ❌ |
| ~~`GET`~~ | ~~`/artists/{id}/related-artists`~~ | ~~Artistes similaires~~ | ❌* |
| ~~`GET`~~ | ~~`/artists`~~ | ~~Plusieurs artistes en batch~~ | ❌ |

> *Note : `/artists/{id}/related-artists` n'est **pas** listé dans les endpoints encore disponibles du changelog officiel.

**Champs supprimés des objets Artist :**
- `followers` — nombre de followers
- `popularity` — score de popularité (0-100)

---

### Audiobooks

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/audiobooks/{id}` | Métadonnées d'un audiobook | ✅ |
| `GET` | `/audiobooks/{id}/chapters` | Chapitres d'un audiobook | ✅ |
| ~~`GET`~~ | ~~`/audiobooks`~~ | ~~Plusieurs audiobooks en batch~~ | ❌ |
| `GET` | `/me/audiobooks` | Audiobooks sauvegardés | ✅ |
| `GET` | `/me/audiobooks/contains` | Vérifier si audiobooks sauvegardés | ✅ |
| ~~`PUT`~~ | ~~`/me/audiobooks`~~ | ~~Sauvegarder audiobooks~~ | ❌ → `PUT /me/library` |
| ~~`DELETE`~~ | ~~`/me/audiobooks`~~ | ~~Supprimer audiobooks~~ | ❌ → `DELETE /me/library` |

**Champs supprimés des objets Audiobook :**
- `available_markets`
- `publisher`

---

### Categories

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| ~~`GET`~~ | ~~`/browse/categories`~~ | ~~Liste des catégories de navigation~~ | ❌ |
| ~~`GET`~~ | ~~`/browse/categories/{id}`~~ | ~~Une catégorie unique~~ | ❌ |

> ⚠️ L'ensemble du système de catégories de navigation a été supprimé.

---

### Chapters

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/chapters/{id}` | Métadonnées d'un chapitre | ✅ |
| ~~`GET`~~ | ~~`/chapters`~~ | ~~Plusieurs chapitres en batch~~ | ❌ |

**Champs supprimés des objets Chapter :**
- `available_markets`

---

### Episodes

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/episodes/{id}` | Métadonnées d'un épisode | ✅ |
| ~~`GET`~~ | ~~`/episodes`~~ | ~~Plusieurs épisodes en batch~~ | ❌ |
| `GET` | `/me/episodes` | Épisodes sauvegardés *(beta)* | ✅ |
| `GET` | `/me/episodes/contains` | Vérifier si épisodes sauvegardés *(beta)* | ✅ |
| ~~`PUT`~~ | ~~`/me/episodes`~~ | ~~Sauvegarder épisodes~~ | ❌ → `PUT /me/library` |
| ~~`DELETE`~~ | ~~`/me/episodes`~~ | ~~Supprimer épisodes~~ | ❌ → `DELETE /me/library` |

---

### Genres

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/recommendations/available-genre-seeds` | Seeds de genres pour les recommandations | ✅ |

---

### Library — Nouveau système unifié 🆕

Le système de bibliothèque a été **unifié** en deux endpoints universels acceptant n'importe quel URI Spotify.

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `PUT` | `/me/library` | Sauvegarder une liste d'URIs Spotify | 🆕 |
| `DELETE` | `/me/library` | Supprimer une liste d'URIs Spotify | 🆕 |
| `GET` | `/me/albums` | Albums sauvegardés | ✅ |
| `GET` | `/me/tracks` | Tracks sauvegardées | ✅ |
| `GET` | `/me/shows` | Shows sauvegardés | ✅ |
| `GET` | `/me/episodes` | Épisodes sauvegardés | ✅ |
| `GET` | `/me/audiobooks` | Audiobooks sauvegardés | ✅ |
| `GET` | `/me/albums/contains` | Vérifier albums | ✅ |
| `GET` | `/me/tracks/contains` | Vérifier tracks | ✅ |
| `GET` | `/me/shows/contains` | Vérifier shows | ✅ |
| `GET` | `/me/episodes/contains` | Vérifier épisodes | ✅ |
| `GET` | `/me/audiobooks/contains` | Vérifier audiobooks | ✅ |

**Exemple — Nouveau endpoint `PUT /me/library` :**
```json
PUT https://api.spotify.com/v1/me/library
{
  "uris": [
    "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
    "spotify:album:1DFixLWuPkv3KT3TnV35m3",
    "spotify:show:5CfCWKI5pZ28U0uOzXkDHe"
  ]
}
```

---

### Markets

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| ~~`GET`~~ | ~~`/markets`~~ | ~~Liste des marchés disponibles~~ | ❌ |

---

### Player

> 🔒 Scope requis : `user-modify-playback-state` (write), `user-read-playback-state` (read)
> ⚠️ Nécessite **Spotify Premium**

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/me/player` | État de lecture actuel | ✅ |
| `PUT` | `/me/player` | Transférer la lecture vers un appareil | ✅ |
| `GET` | `/me/player/devices` | Appareils disponibles | ✅ |
| `GET` | `/me/player/currently-playing` | Track en cours de lecture | ✅ |
| `PUT` | `/me/player/play` | Démarrer / reprendre la lecture | ✅ |
| `PUT` | `/me/player/pause` | Mettre en pause | ✅ |
| `POST` | `/me/player/next` | Passer au suivant | ✅ |
| `POST` | `/me/player/previous` | Revenir au précédent | ✅ |
| `PUT` | `/me/player/seek` | Seek à une position (ms) | ✅ |
| `PUT` | `/me/player/repeat` | Mode répétition (`track`, `context`, `off`) | ✅ |
| `PUT` | `/me/player/volume` | Volume (0-100) | ✅ |
| `PUT` | `/me/player/shuffle` | Mode shuffle | ✅ |
| `GET` | `/me/player/recently-played` | Tracks récemment jouées | ✅ |
| `GET` | `/me/player/queue` | File d'attente | ✅ |
| `POST` | `/me/player/queue` | Ajouter un item à la file | ✅ |

**Exemple — Démarrer la lecture :**
```json
PUT https://api.spotify.com/v1/me/player/play
{
  "context_uri": "spotify:album:1DFixLWuPkv3KT3TnV35m3",
  "offset": { "position": 5 },
  "position_ms": 0
}
```

---

### Playlists

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/playlists/{id}` | Détails complets d'une playlist | ⚡ |
| `PUT` | `/playlists/{id}` | Modifier nom, description, visibilité | ✅ |
| `GET` | `/playlists/{id}/tracks` | Items d'une playlist | ✅ |
| `POST` | `/playlists/{id}/tracks` | Ajouter items à une playlist | ✅ |
| `PUT` | `/playlists/{id}/tracks` | Réordonner ou remplacer les items | ✅ |
| `DELETE` | `/playlists/{id}/tracks` | Supprimer items d'une playlist | ✅ |
| `GET` | `/me/playlists` | Playlists de l'utilisateur connecté | ✅ |
| `POST` | `/me/playlists` | Créer une playlist | ✅ |
| ~~`POST`~~ | ~~`/users/{id}/playlists`~~ | ~~Créer playlist pour un user~~ | ❌ → `POST /me/playlists` |
| ~~`GET`~~ | ~~`/users/{id}/playlists`~~ | ~~Playlists d'un autre user~~ | ❌ |
| `GET` | `/playlists/{id}/images` | Image de couverture | ✅ |
| `PUT` | `/playlists/{id}/images` | Upload image de couverture (base64 JPEG) | ✅ |
| `PUT` | `/playlists/{id}/followers` | Suivre une playlist | ✅ |
| `DELETE` | `/playlists/{id}/followers` | Ne plus suivre une playlist | ✅ |
| `GET` | `/me/playlists/contains` | Vérifier si l'user suit une playlist | ✅ |
| `GET` | `/playlists/{id}/followers/contains` | Vérifier suivi d'une playlist | ✅ |
| ~~`GET`~~ | ~~`/browse/featured-playlists`~~ | ~~Playlists featured~~ | ❌* |
| ~~`GET`~~ | ~~`/browse/categories/{id}/playlists`~~ | ~~Playlists d'une catégorie~~ | ❌* |

> *Ces endpoints sont supprimés de facto avec la suppression des catégories.

**⚡ Changement majeur sur `/playlists/{id}` :**
- Le champ `tracks` a été **renommé** en `items`
- `tracks.tracks` → `items.items`
- `tracks.tracks.track` → `items.items.item`
- Le contenu des items **n'est retourné que pour les playlists dont l'utilisateur est propriétaire ou collaborateur**. Pour les autres playlists, seules les métadonnées sont retournées.

---

### Search

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/search` | Recherche dans le catalogue Spotify | ⚡ |

**⚡ Changements sur `/search` :**

| Paramètre | Avant | Après |
|---|---|---|
| `limit` (max) | 50 | **10** |
| `limit` (défaut) | 20 | **5** |

**Paramètres disponibles :**
```
q=<query>&type=album,artist,playlist,track,show,episode,audiobook
&limit=10&offset=0&market=FR
```

**Types de recherche supportés :** `album`, `artist`, `playlist`, `track`, `show`, `episode`, `audiobook`

---

### Shows

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/shows/{id}` | Métadonnées d'un show | ✅ |
| `GET` | `/shows/{id}/episodes` | Épisodes d'un show | ✅ |
| ~~`GET`~~ | ~~`/shows`~~ | ~~Plusieurs shows en batch~~ | ❌ |
| `GET` | `/me/shows` | Shows sauvegardés | ✅ |
| `GET` | `/me/shows/contains` | Vérifier si shows sauvegardés | ✅ |
| ~~`PUT`~~ | ~~`/me/shows`~~ | ~~Sauvegarder shows~~ | ❌ → `PUT /me/library` |
| ~~`DELETE`~~ | ~~`/me/shows`~~ | ~~Supprimer shows~~ | ❌ → `DELETE /me/library` |

**Champs supprimés des objets Show :**
- `available_markets`
- `publisher`

---

### Tracks

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/tracks/{id}` | Métadonnées d'une track | ✅ |
| ~~`GET`~~ | ~~`/tracks`~~ | ~~Plusieurs tracks en batch~~ | ❌ |
| `GET` | `/me/tracks` | Tracks sauvegardées (Liked Songs) | ✅ |
| `GET` | `/me/tracks/contains` | Vérifier si tracks sauvegardées | ✅ |
| ~~`PUT`~~ | ~~`/me/tracks`~~ | ~~Sauvegarder tracks~~ | ❌ → `PUT /me/library` |
| ~~`DELETE`~~ | ~~`/me/tracks`~~ | ~~Supprimer tracks~~ | ❌ → `DELETE /me/library` |
| `GET` | `/audio-features/{id}` | Caractéristiques audio d'une track | ✅* |
| ~~`GET`~~ | ~~`/audio-features`~~ | ~~Caractéristiques audio en batch~~ | ❌ |
| `GET` | `/audio-analysis/{id}` | Analyse audio détaillée | ✅* |
| `GET` | `/recommendations` | Recommandations musicales | ✅* |

> ⚠️ *Ces endpoints (`audio-features`, `audio-analysis`, `recommendations`) restent dans la documentation officielle mais leur **accessibilité en Development Mode est incertaine**. Des reports de développeurs indiquent qu'ils peuvent retourner 403 en mode Dev sans Extended Access. En production avec Extended Access, ils restent fonctionnels.

**Champs supprimés des objets Track :**
- `available_markets`
- `external_ids` — ISRC, EAN, UPC
- `linked_from` — track originale en cas de relinking
- `popularity` — score de popularité (0-100)

---

### Users

| Méthode | Endpoint | Description | Statut |
|---|---|---|---|
| `GET` | `/me` | Profil de l'utilisateur connecté | ✅ |
| `GET` | `/me/top/artists` | Top artistes de l'utilisateur | ✅ |
| `GET` | `/me/top/tracks` | Top tracks de l'utilisateur | ✅ |
| ~~`GET`~~ | ~~`/users/{id}`~~ | ~~Profil public d'un autre utilisateur~~ | ❌ |
| `GET` | `/me/following` | Artistes suivis | ✅ |
| `PUT` | `/me/following` | Suivre artistes ou utilisateurs | ✅ |
| `DELETE` | `/me/following` | Ne plus suivre artistes ou utilisateurs | ✅ |
| `GET` | `/me/following/contains` | Vérifier si on suit artistes/users | ✅ |

**Champs supprimés des objets User :**
- `country` — pays de l'utilisateur
- `email` — email (même avec scope `user-read-email`)
- `explicit_content` — paramètres de contenu explicite
- `followers` — nombre de followers
- `product` — niveau d'abonnement (premium/free)

---

## 🗑️ Changements de Champs (Fields)

Récapitulatif global de tous les champs supprimés par type d'objet :

### Album
```diff
- album_group       // relation artiste/album
- available_markets // marchés de disponibilité
- external_ids      // ISRC, EAN, UPC
- label             // label musical
- popularity        // score 0-100
```

### Artist
```diff
- followers         // info followers
- popularity        // score 0-100
```

### Audiobook
```diff
- available_markets
- publisher
```

### Chapter
```diff
- available_markets
```

### Show
```diff
- available_markets
- publisher
```

### Track
```diff
- available_markets
- external_ids      // ISRC, EAN, UPC
- linked_from       // track originale (track relinking)
- popularity        // score 0-100
```

### User
```diff
- country
- email
- explicit_content
- followers
- product           // "premium", "free", etc.
```

### Playlist (renommages)
```diff
- tracks            → items
- tracks.tracks     → items.items
- tracks.tracks.track → items.items.item
```

---

## 🔑 Scopes OAuth

### Lecture des données utilisateur
| Scope | Accès |
|---|---|
| `user-read-private` | Profil, pays, abonnement |
| `user-read-email` | Email de l'utilisateur |
| `user-top-read` | Top artistes et tracks |
| `user-read-recently-played` | Historique d'écoute |
| `user-read-playback-state` | État de lecture |
| `user-read-currently-playing` | Track en cours |

### Bibliothèque
| Scope | Accès |
|---|---|
| `user-library-read` | Lire la bibliothèque |
| `user-library-modify` | Modifier la bibliothèque |

### Playlists
| Scope | Accès |
|---|---|
| `playlist-read-private` | Playlists privées |
| `playlist-read-collaborative` | Playlists collaboratives |
| `playlist-modify-public` | Modifier playlists publiques |
| `playlist-modify-private` | Modifier playlists privées |

### Player (Premium uniquement)
| Scope | Accès |
|---|---|
| `user-modify-playback-state` | Contrôler la lecture |
| `streaming` | SDK Web Playback |

### Social
| Scope | Accès |
|---|---|
| `user-follow-read` | Lire les follows |
| `user-follow-modify` | Modifier les follows |
| `ugc-image-upload` | Uploader des images de playlist |

---

## ⏱️ Rate Limits & Codes HTTP

### Rate Limiting
- Basé sur une fenêtre glissante de **30 secondes**
- En cas de dépassement : réponse `429 Too Many Requests` avec header `Retry-After`
- Utiliser les **ETags** pour la mise en cache : envoyer `If-None-Match: {etag}`, réponse `304 Not Modified` si pas de changement

### Codes HTTP

| Code | Signification |
|---|---|
| `200` | OK |
| `201` | Created |
| `202` | Accepted |
| `204` | No Content |
| `304` | Not Modified (cache) |
| `400` | Bad Request |
| `401` | Unauthorized (token invalide/expiré) |
| `403` | Forbidden (pas le bon scope ou pas Premium) |
| `404` | Not Found |
| `429` | Too Many Requests (rate limit) |
| `500` | Internal Server Error |
| `502` | Bad Gateway |
| `503` | Service Unavailable |

### Format d'erreur standard
```json
{
  "error": {
    "status": 401,
    "message": "No token provided"
  }
}
```

---

## 🔄 Guide de Migration

### 1. Bibliothèque — Nouveau endpoint unifié

**Avant (déprécié) :**
```http
PUT /me/tracks
PUT /me/albums
PUT /me/shows
DELETE /me/episodes
```

**Après :**
```http
PUT /me/library
Body: { "uris": ["spotify:track:xxx", "spotify:album:yyy"] }

DELETE /me/library
Body: { "uris": ["spotify:track:xxx"] }
```

### 2. Batch → Requêtes individuelles

Les endpoints batch (`/tracks`, `/albums`, `/artists`, etc.) ont été supprimés. Vous devez maintenant faire des requêtes individuelles :

```python
# Avant
GET /tracks?ids=id1,id2,id3,id4,id5

# Après — requêtes séparées
GET /tracks/id1
GET /tracks/id2
# ...
```

### 3. Recherche — Pagination obligatoire

```python
# Avant
GET /search?q=daft punk&type=track&limit=50

# Après — max 10 résultats par page, paginer avec offset
GET /search?q=daft punk&type=track&limit=10&offset=0
GET /search?q=daft punk&type=track&limit=10&offset=10
GET /search?q=daft punk&type=track&limit=10&offset=20
```

### 4. Playlist — Champ `items` au lieu de `tracks`

```python
# Avant
playlist["tracks"]["items"][0]["track"]

# Après
playlist["items"]["items"][0]["item"]
```

### 5. Création de playlist

```http
# Avant
POST /users/{user_id}/playlists

# Après
POST /me/playlists
```

### 6. Fonctionnalités supprimées sans remplacement

Ces fonctionnalités **n'ont pas de remplacement** dans l'API publique :

- ❌ Top tracks d'un artiste (`/artists/{id}/top-tracks`)
- ❌ Nouvelles sorties (`/browse/new-releases`)
- ❌ Catégories de navigation
- ❌ Profil public d'autres utilisateurs (`/users/{id}`)
- ❌ Playlists d'autres utilisateurs (`/users/{id}/playlists`)
- ❌ Champs `popularity`, `followers`, `available_markets`, `external_ids`

---

## 📊 Tableau de Bord — Vue d'ensemble par catégorie

| Catégorie | Endpoints actifs | Supprimés | Ajoutés | Modifiés |
|---|---|---|---|---|
| Albums | 3 | 5 | 0 | 0 |
| Artists | 2 | 3 | 0 | 0 |
| Audiobooks | 3 | 4 | 0 | 0 |
| Categories | 0 | 2 | 0 | 0 |
| Chapters | 1 | 1 | 0 | 0 |
| Episodes | 3 | 4 | 0 | 0 |
| Genres | 1 | 0 | 0 | 0 |
| Library | 12 | 10 | 2 | 0 |
| Markets | 0 | 1 | 0 | 0 |
| Player | 15 | 0 | 0 | 0 |
| Playlists | 12 | 4 | 0 | 1 |
| Search | 1 | 0 | 0 | 1 |
| Shows | 3 | 4 | 0 | 0 |
| Tracks | 5 | 5 | 0 | 0 |
| Users | 6 | 1 | 0 | 0 |
| **Total** | **67** | **44** | **2** | **2** |

---

## 🔗 Ressources officielles

| Ressource | URL |
|---|---|
| Documentation principale | https://developer.spotify.com/documentation/web-api |
| Changelog Février 2026 | https://developer.spotify.com/documentation/web-api/references/changes/february-2026 |
| Guide de migration Dev Mode | https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide |
| Blog — Annonce officielle | https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security |
| Dashboard développeur | https://developer.spotify.com/dashboard |
| Forum communautaire | https://community.spotify.com/t5/Spotify-for-Developers/bd-p/Spotify_Developer |
| Conditions d'utilisation | https://developer.spotify.com/terms |

---

*Document généré le 19 février 2026 — Sources : developer.spotify.com (changelog officiel + blog officiel)*
