import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { createRoom, getRoom, getState, setHost, updateState, addToQueue, popNext, removeRoom } from "./rooms.js";
import { extractVideoId } from "./utils/youtube.js";

const app = express();
app.use(express.json());

const frontendOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({
  origin: frontendOrigin,
  credentials: true
}));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  socket.on("room:create", ({ pin } = {}) => {
    const room = createRoom({ pin });
    setHost(room.roomId, socket.id);
    socket.join(room.roomId);
    socket.emit("room:created", { roomId: room.roomId });
  });

  socket.on("room:join", ({ roomId, role, pin } = {}) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit("room:error", { message: "Room not found" });
      return;
    }
    if (room.pin && room.pin !== pin) {
      socket.emit("room:error", { message: "Invalid PIN" });
      return;
    }

    socket.join(roomId);
    if (role === "host") {
      setHost(roomId, socket.id);
    }

    socket.emit("room:joined", {
      roomId,
      role,
      state: getState(roomId),
      serverTime: Date.now()
    });

    if (role === "listener" && room.hostId) {
      io.to(room.hostId).emit("room:listener", { listenerId: socket.id });
    }
  });

  socket.on("queue:add", ({ roomId, url }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;

    const videoId = extractVideoId(url);
    if (!videoId) {
      socket.emit("room:error", { message: "Invalid YouTube link" });
      return;
    }

    addToQueue(roomId, { videoId, addedAt: Date.now() });
    io.to(roomId).emit("queue:updated", getState(roomId));
  });

  socket.on("queue:skip", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;

    popNext(roomId);
    io.to(roomId).emit("state:updated", getState(roomId));
  });

  socket.on("state:update", ({ roomId, playing, currentTime, videoId }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;

    const nextState = {};
    if (typeof playing === "boolean") nextState.playing = playing;
    if (typeof currentTime === "number") nextState.currentTime = currentTime;
    if (videoId) nextState.current = { videoId };

    updateState(roomId, nextState);
    socket.to(roomId).emit("state:updated", getState(roomId));
  });

  socket.on("heartbeat", ({ roomId, playing, currentTime, videoId }) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;

    updateState(roomId, {
      playing: Boolean(playing),
      currentTime: typeof currentTime === "number" ? currentTime : room.currentTime,
      current: videoId ? { videoId } : room.current
    });

    socket.to(roomId).emit("state:heartbeat", {
      state: getState(roomId),
      serverTime: Date.now()
    });
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of Array.from(io.sockets.adapter.rooms.entries())) {
      if (room.has(socket.id)) {
        const state = getRoom(roomId);
        if (state && state.hostId === socket.id) {
          io.to(roomId).emit("room:closed");
          removeRoom(roomId);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
