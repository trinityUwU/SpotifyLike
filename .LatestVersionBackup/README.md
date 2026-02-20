# SpotifyLIKE

A hybrid music player that uses **Deezer API** for metadata/search and **Spotify API** for audio playback.

## Features
- **Search**: Uses Deezer API (No Spotify search limit).
- **Playback**: Uses Spotify Web Playback SDK (Requires Premium).
- **Smart Resolution**: Automatically finds the Spotify track corresponding to the Deezer track using ISRC codes and fuzzy matching.
- **Caching**: Minimizes Spotify API calls by caching ID mappings.

## Configuration

1. **Spotify Developer Account**:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
   - Create an app.
   - Set Redirect URI to `http://127.0.0.1:8888/callback`.
   - Get `Client ID` and `Client Secret`.

2. **Environment Variables**:
   - Rename `.env.example` to `.env`.
   - Fill in your `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.

## Running the Project

1. Open PowerShell.
2. Navigate to the project directory:
   ```powershell
   cd F:\DEVS\SpotifyLIKE
   ```
3. Install dependencies (if not already done):
   ```powershell
   npm install
   ```
4. Start the server:
   ```powershell
   node server.js
   ```
5. Open your browser at `http://127.0.0.1:8888`.

## Architecture

- **Frontend**: Vanilla JS, handles UI and Spotify Web Player SDK.
- **Backend (Node.js)**: 
  - Proxies Deezer API requests (to avoid CORS).
  - Handles Spotify OAuth flow.
  - Implements the `Deezer ID -> Spotify URI` resolution logic using ISRC and caching.
