import requests
import json
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

def get_anonymous_token() -> str:
    """Récupère le token anonyme que Spotify génère pour son propre web player."""
    r = requests.get(
        "https://open.spotify.com/get_access_token",
        params={"reason": "transport", "productType": "web_player"},
        headers=HEADERS,
        timeout=15
    )
    r.raise_for_status()
    token = r.json().get("accessToken")
    if not token:
        raise RuntimeError("Impossible de récupérer le token anonyme Spotify.")
    print(f"🔑 Token anonyme obtenu")
    return token

def extract_id(url: str) -> tuple[str, str]:
    match = re.search(r"spotify\.com/(playlist|album|track)/([a-zA-Z0-9]+)", url)
    if not match:
        raise ValueError(f"URL invalide : {url}")
    return match.group(1), match.group(2)

def ms_to_str(ms: int) -> str:
    s = ms // 1000
    return f"{s // 60}:{s % 60:02d}"

def get_playlist_tracks(token: str, playlist_id: str) -> list[dict]:
    tracks = []
    url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"limit": 100, "offset": 0, "fields": "items(track(id,name,duration_ms,artists,album)),next,total"}

    while url:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()

        for item in data.get("items", []):
            track = item.get("track")
            if not track or not track.get("id"):
                continue
            tracks.append(format_track(track))

        url = data.get("next")
        params = {}  # next URL contient déjà tous les params

    return tracks

def get_album_tracks(token: str, album_id: str) -> list[dict]:
    tracks = []
    headers = {"Authorization": f"Bearer {token}"}

    # Infos album
    r = requests.get(f"https://api.spotify.com/v1/albums/{album_id}", headers=headers, timeout=15)
    r.raise_for_status()
    album_data = r.json()
    album_name = album_data["name"]

    url = f"https://api.spotify.com/v1/albums/{album_id}/tracks"
    params = {"limit": 50}

    while url:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()

        for track in data.get("items", []):
            tracks.append({
                "id":       track["id"],
                "title":    track["name"],
                "artists":  [a["name"] for a in track["artists"]],
                "album":    album_name,
                "duration": ms_to_str(track["duration_ms"]),
                "url":      f"https://open.spotify.com/track/{track['id']}",
            })

        url = data.get("next")
        params = {}

    return tracks

def get_single_track(token: str, track_id: str) -> list[dict]:
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"https://api.spotify.com/v1/tracks/{track_id}", headers=headers, timeout=15)
    r.raise_for_status()
    return [format_track(r.json())]

def format_track(track: dict) -> dict:
    return {
        "id":       track["id"],
        "title":    track["name"],
        "artists":  [a["name"] for a in track["artists"]],
        "album":    track.get("album", {}).get("name", "N/A"),
        "duration": ms_to_str(track["duration_ms"]),
        "url":      f"https://open.spotify.com/track/{track['id']}",
    }

def get_tracks(url: str) -> list[dict]:
    kind, spotify_id = extract_id(url)
    token = get_anonymous_token()

    if kind == "playlist":
        return get_playlist_tracks(token, spotify_id)
    elif kind == "album":
        return get_album_tracks(token, spotify_id)
    elif kind == "track":
        return get_single_track(token, spotify_id)
    else:
        raise ValueError(f"Type non supporté : {kind}")


if __name__ == "__main__":
    url = input("URL Spotify (playlist / album / track) : ").strip()

    print("⏳ Récupération en cours...")
    tracks = get_tracks(url)

    print(f"\n✅ {len(tracks)} morceaux trouvés\n")
    for i, t in enumerate(tracks, 1):
        artists = ", ".join(t["artists"])
        print(f"{i:>4}. {artists} — {t['title']} ({t['duration']})")

    out = "tracks.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(tracks, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Exporté dans {out}")