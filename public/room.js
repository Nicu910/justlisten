const SOCKET_URL = "https://api.YOUR_DOMAIN";
const HEARTBEAT_MS = 5000;
const DRIFT_THRESHOLD = 0.8;

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const role = params.get("role") || "listener";

const statusEl = document.getElementById("status");
const roomLabel = document.getElementById("roomLabel");
const hostControls = document.getElementById("hostControls");
const listenerControls = document.getElementById("listenerControls");
const nowPlayingEl = document.getElementById("nowPlaying");
const queueList = document.getElementById("queueList");
const tapToStartWrap = document.getElementById("tapToStartWrap");
const tapToStartBtn = document.getElementById("tapToStartBtn");

const youtubeInput = document.getElementById("youtubeInput");
const addBtn = document.getElementById("addBtn");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const skipBtn = document.getElementById("skipBtn");
const volumeRange = document.getElementById("volumeRange");
const volumeValue = document.getElementById("volumeValue");

let player;
let currentState = {
  current: null,
  playing: false,
  currentTime: 0,
  queue: []
};
let isReady = false;
let heartbeatTimer;

const socket = io(SOCKET_URL, { transports: ["websocket"] });

const setStatus = (text) => {
  statusEl.textContent = text;
};

const renderQueue = () => {
  queueList.innerHTML = "";
  const queue = currentState.queue || [];
  queue.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.videoId;
    queueList.appendChild(li);
  });
  if (currentState.current && currentState.current.videoId) {
    nowPlayingEl.textContent = currentState.current.videoId;
  } else {
    nowPlayingEl.textContent = "Nimic";
  }
};

const extractVideoId = (input) => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) return match[1];
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(trimmed)) return trimmed;
  return null;
};

const loadVideo = (videoId, seekTime = 0, autoplay = false) => {
  if (!player || !videoId) return;
  player.loadVideoById(videoId, seekTime);
  if (!autoplay) {
    player.pauseVideo();
  }
};

const syncToState = (state, serverTime) => {
  if (!player || !state) return;
  currentState = state;
  renderQueue();

  const videoId = state.current?.videoId;
  const localTime = player.getCurrentTime ? player.getCurrentTime() : 0;
  const driftSeconds = (Date.now() - serverTime) / 1000;
  const targetTime = (state.currentTime || 0) + driftSeconds;

  if (videoId && player.getVideoData().video_id !== videoId) {
    loadVideo(videoId, targetTime, state.playing);
  } else if (Math.abs(localTime - targetTime) > DRIFT_THRESHOLD) {
    player.seekTo(targetTime, true);
  }

  if (state.playing) {
    player.playVideo();
  } else {
    player.pauseVideo();
  }
};

const startHeartbeat = () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (role !== "host" || !player) return;
    const data = player.getVideoData();
    socket.emit("heartbeat", {
      roomId,
      playing: player.getPlayerState() === 1,
      currentTime: player.getCurrentTime(),
      videoId: data?.video_id || null
    });
  }, HEARTBEAT_MS);
};

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("player", {
    height: "360",
    width: "640",
    videoId: "",
    playerVars: {
      autoplay: 0,
      controls: 1,
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: () => {
        isReady = true;
        setStatus("Player pregatit.");
        startHeartbeat();
      }
    }
  });
};

socket.on("connect", () => {
  setStatus("Conectat la server.");
  roomLabel.textContent = `Camera: ${roomId}`;
  if (!roomId) {
    setStatus("Lipseste roomId.");
    return;
  }
  socket.emit("room:join", { roomId, role });
});

socket.on("room:joined", ({ state, serverTime }) => {
  currentState = state;
  renderQueue();
  if (state.current?.videoId && isReady) {
    syncToState(state, serverTime);
  }
  hostControls.style.display = role === "host" ? "block" : "none";
  listenerControls.style.display = role === "listener" ? "block" : "none";
});

socket.on("state:updated", (state) => {
  currentState = state;
  renderQueue();
  if (role === "listener" && isReady) {
    syncToState(state, Date.now());
  }
});

socket.on("state:heartbeat", ({ state, serverTime }) => {
  currentState = state;
  if (role === "listener" && isReady) {
    syncToState(state, serverTime);
  }
});

socket.on("queue:updated", (state) => {
  currentState = state;
  renderQueue();
});

socket.on("room:error", ({ message }) => {
  setStatus(message || "Eroare.");
});

socket.on("room:closed", () => {
  setStatus("Gazda a inchis camera.");
});

addBtn?.addEventListener("click", () => {
  const videoId = extractVideoId(youtubeInput.value);
  if (!videoId) {
    setStatus("Link YouTube invalid.");
    return;
  }
  socket.emit("queue:add", { roomId, url: videoId });
  youtubeInput.value = "";
});

playBtn?.addEventListener("click", () => {
  if (!player) return;
  player.playVideo();
  socket.emit("state:update", {
    roomId,
    playing: true,
    currentTime: player.getCurrentTime(),
    videoId: player.getVideoData().video_id
  });
});

pauseBtn?.addEventListener("click", () => {
  if (!player) return;
  player.pauseVideo();
  socket.emit("state:update", {
    roomId,
    playing: false,
    currentTime: player.getCurrentTime(),
    videoId: player.getVideoData().video_id
  });
});

skipBtn?.addEventListener("click", () => {
  socket.emit("queue:skip", { roomId });
});

volumeRange?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  volumeValue.textContent = String(value);
  if (player && player.setVolume) player.setVolume(value);
});

const tryStartPlayback = () => {
  if (!player) return;
  player.playVideo();
  tapToStartWrap.style.display = "none";
};

tapToStartBtn?.addEventListener("click", () => {
  tryStartPlayback();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && tapToStartWrap.style.display !== "none") {
    tryStartPlayback();
  }
});
