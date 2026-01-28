# Hostico upload

1) Intra in cPanel / File Manager.
2) Deschide `public_html`.
3) Urca toate fisierele din folderul `public/` (index.html, room.html, app.js, room.js, styles.css).
4) Seteaza `SOCKET_URL` in `app.js` si `room.js`:
   - `https://api.YOUR_DOMAIN`
5) Testeaza:
   - https://YOUR_DOMAIN
   - https://YOUR_DOMAIN/room.html?room=TEST&role=listener

Nota: foloseste HTTPS, nu HTTP.
