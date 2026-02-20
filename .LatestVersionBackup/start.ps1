Write-Host "Starting SpotifyLIKE..."
if (!(Test-Path .env)) {
    Write-Error ".env file not found! Please copy .env.example to .env and fill in your Spotify credentials."
    exit 1
}
npm install
node server.js
