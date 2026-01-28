import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { nanoid } from "nanoid";
import ytdl from "ytdl-core";
import ytdlp from "yt-dlp-exec";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const isAllowedAudioUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

app.get("/audio", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    res.status(400).send("Missing url");
    return;
  }
  console.log("Audio request:", url);
  if (isAllowedAudioUrl(url)) {
    try {
      console.log("Direct audio proxy:", url);
      const range = req.headers.range;
      const upstream = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://audius.co/",
          "Origin": "https://audius.co",
          ...(range ? { Range: range } : {})
        }
      });
      if (!upstream.ok) {
        console.error("Audio upstream error:", upstream.status, upstream.statusText);
        res.status(502).send("Failed to fetch audio");
        return;
      }
      if (!upstream.body) {
        console.error("Audio upstream error: empty body");
        res.status(502).send("Failed to fetch audio");
        return;
      }
      res.status(upstream.status);
      res.setHeader("Access-Control-Allow-Origin", "*");
      const contentType = upstream.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) {
        res.setHeader("Content-Range", contentRange);
      }
      const acceptRanges = upstream.headers.get("accept-ranges");
      if (acceptRanges) {
        res.setHeader("Accept-Ranges", acceptRanges);
      }
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    } catch (error) {
      console.error("Audio proxy error (direct):", error);
      res.status(500).send("Failed to load audio");
      return;
    }
  }
  if (!ytdl.validateURL(url)) {
    res.status(400).send("Invalid YouTube url");
    return;
  }

  try {
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });
    res.setHeader("Content-Type", (format.mimeType || "audio/mpeg").split(";")[0]);
    ytdl(url, {
      quality: "highestaudio",
      filter: "audioonly",
      highWaterMark: 1 << 25,
      requestOptions: {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      }
    }).pipe(res);
  } catch (error) {
    console.error("Audio proxy error (ytdl):", error);
    try {
      res.setHeader("Content-Type", "audio/mpeg");
      const proc = ytdlp(
        url,
        {
          output: "-",
          format: "bestaudio",
          noPlaylist: true,
          userAgent: "Mozilla/5.0",
          addHeader: ["Accept-Language: en-US,en;q=0.9"]
        },
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      proc.on("error", (spawnError) => {
        console.error("yt-dlp-exec error:", spawnError);
        if (!res.headersSent) {
          res.status(500).send("Failed to load audio");
        }
      });
      proc.stderr.on("data", (chunk) => {
        console.error("yt-dlp:", chunk.toString());
      });
      proc.stdout.pipe(res);
    } catch (fallbackError) {
      console.error("Audio proxy error (yt-dlp fallback):", fallbackError);
      res.status(500).send("Failed to load audio");
    }
  }
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

const isHost = (room, socketId) => room && room.hostId === socketId;

io.on("connection", (socket) => {
  socket.on("create-room", () => {
    const roomId = nanoid(6);
    rooms.set(roomId, {
      hostId: socket.id,
      listeners: new Set(),
      createdAt: Date.now()
    });
    socket.join(roomId);
    socket.emit("room-created", { roomId });
  });

  socket.on("join-room", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("room-error", { message: "Room not found" });
      return;
    }
    if (room.hostId === socket.id) {
      socket.emit("room-joined", { roomId, role: "host" });
      return;
    }
    room.listeners.add(socket.id);
    socket.join(roomId);
    socket.emit("room-joined", { roomId, role: "listener", hostId: room.hostId });
    io.to(room.hostId).emit("listener-joined", { listenerId: socket.id });
  });

  socket.on("signal", ({ roomId, targetId, data }) => {
    if (!rooms.has(roomId)) return;
    io.to(targetId).emit("signal", { from: socket.id, data, roomId });
  });

  socket.on("add-track", ({ roomId, url, title, artist }) => {
    const room = rooms.get(roomId);
    if (!isHost(room, socket.id)) return;
    io.to(roomId).emit("track-added", { url, title, artist, addedAt: Date.now(), by: socket.id });
  });

  socket.on("host-status", ({ roomId, status }) => {
    const room = rooms.get(roomId);
    if (!isHost(room, socket.id)) return;
    io.to(roomId).emit("host-status", status);
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        io.to(roomId).emit("host-left");
        rooms.delete(roomId);
        break;
      }
      if (room.listeners.has(socket.id)) {
        room.listeners.delete(socket.id);
        io.to(room.hostId).emit("listener-left", { listenerId: socket.id });
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
