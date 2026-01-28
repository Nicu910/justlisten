# Just Listen Server (YouTube Sync MVP)

Server Socket.IO care sincronizeaza starea YouTube: videoId, play/pause, currentTime, queue.

## Rulare locala

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\server"
npm install
$env:FRONTEND_ORIGIN="http://localhost:5173"
npm run dev
```

## Render Deploy

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm run start`
- Env vars:
  - `FRONTEND_ORIGIN=https://YOUR_DOMAIN`
  - `NODE_ENV=production` (optional)

Server foloseste `PORT` din environment.

## Health

`/health` -> `{ ok: true }`
