const SOCKET_URL = "https://api.YOUR_DOMAIN";

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");

const socket = io(SOCKET_URL, { transports: ["websocket"] });

createRoomBtn.addEventListener("click", () => {
  socket.emit("room:create", {});
});

joinRoomBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return;
  window.location.href = `room.html?room=${encodeURIComponent(roomId)}&role=listener`;
});

socket.on("room:created", ({ roomId }) => {
  window.location.href = `room.html?room=${encodeURIComponent(roomId)}&role=host`;
});

socket.on("room:error", ({ message }) => {
  alert(message || "Eroare");
});
