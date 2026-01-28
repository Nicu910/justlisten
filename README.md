# Just Listen (MVP)

Aplicatie radio web accesibila, folosind numai tastatura, cu gazda care mixeaza muzica + microfon si transmite prin WebRTC.

## Structura proiect

- `server` - Node.js + Express + Socket.IO (semnalizare)
- `client` - React + Vite (interfata)

## Cerinte

- Node.js 18+
- npm

## Instalare

### 1) Server

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\server"
npm install
```

### 2) Client

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\client"
npm install
```

## Rulare (dezvoltare)

### Server

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\server"
npm run dev
```

### Client

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\client"
npm run dev
```

Deschide URL-ul afisat de Vite (de obicei http://localhost:5173).

## Publicare (build)

### Client (build static)

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\client"
npm run build
```

Build-ul se genereaza in `client/dist`. Serverul va servi automat `client/dist` daca exista.

Pentru URL-ul serverului in productie, seteaza `VITE_SERVER_URL` in client (vezi `client/.env.example`).

### Server (productie)

```powershell
cd "d:\The D Drive\lucrari\aplicatie radio\server"
npm run start
```

## Cum se foloseste

1) Apasa **Creeaza camera**
2) Trimite linkul
3) Ascultatorii deschid linkul si primesc streamul
4) Gazda adauga un link YouTube
5) Gazda apasa **Porneste vorbirea** pentru voce peste muzica

## Note

- Camerele sunt in memorie; repornirea serverului sterge camerele.
- Proxy-ul YouTube foloseste `ytdl-core` cu fallback pe `yt-dlp-exec`.
- Poti forta modul de test cu `VITE_MOCK_AUDIO=true` in client.
- WebRTC foloseste un STUN public.

## yt-dlp-exec (fallback)

Fallback-ul `yt-dlp-exec` descarca automat binarul necesar la instalare (util pe Render).
