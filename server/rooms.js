import { nanoid } from "nanoid";

const rooms = new Map();

const createRoom = ({ pin } = {}) => {
  const roomId = nanoid(6);
  const room = {
    roomId,
    pin: pin || null,
    hostId: null,
    queue: [],
    current: null,
    playing: false,
    currentTime: 0,
    updatedAt: Date.now()
  };
  rooms.set(roomId, room);
  return room;
};

const getRoom = (roomId) => rooms.get(roomId) || null;

const removeRoom = (roomId) => rooms.delete(roomId);

const setHost = (roomId, socketId) => {
  const room = getRoom(roomId);
  if (!room) return null;
  room.hostId = socketId;
  return room;
};

const updateState = (roomId, patch = {}) => {
  const room = getRoom(roomId);
  if (!room) return null;
  Object.assign(room, patch);
  room.updatedAt = Date.now();
  return room;
};

const addToQueue = (roomId, item) => {
  const room = getRoom(roomId);
  if (!room) return null;
  room.queue.push(item);
  room.updatedAt = Date.now();
  return room;
};

const popNext = (roomId) => {
  const room = getRoom(roomId);
  if (!room) return null;
  const next = room.queue.shift() || null;
  room.current = next;
  room.currentTime = 0;
  room.playing = Boolean(next);
  room.updatedAt = Date.now();
  return room;
};

const getState = (roomId) => {
  const room = getRoom(roomId);
  if (!room) return null;
  return {
    roomId: room.roomId,
    pinRequired: Boolean(room.pin),
    hostId: room.hostId,
    queue: room.queue,
    current: room.current,
    playing: room.playing,
    currentTime: room.currentTime,
    updatedAt: room.updatedAt
  };
};

export { rooms, createRoom, getRoom, removeRoom, setHost, updateState, addToQueue, popNext, getState };
