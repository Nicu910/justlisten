import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const USE_MOCK_AUDIO = import.meta.env.VITE_MOCK_AUDIO === "true";

const createPeer = () => {
  return new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
};

function App() {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState("");
  const [hostId, setHostId] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [status, setStatus] = useState("Gata.");
  const [joinInput, setJoinInput] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [queue, setQueue] = useState([]);
  const [isTalking, setIsTalking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState("");
  const [listenerReady, setListenerReady] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [musicVolume, setMusicVolume] = useState(80);
  const [voiceVolume, setVoiceVolume] = useState(70);

  const roleRef = useRef(role);
  const roomIdRef = useRef(roomId);
  const hostIdRef = useRef(hostId);
  const socketRef = useRef(null);
  const queueRef = useRef(queue);
  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentIndex);
  const selectedIndexRef = useRef(selectedIndex);

  const audioCtxRef = useRef(null);
  const mixDestRef = useRef(null);
  const musicGainRef = useRef(null);
  const micGainRef = useRef(null);
  const oscRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioElRef = useRef(null);
  const audioSourceRef = useRef(null);

  const remoteAudioRef = useRef(null);
  const peerMapRef = useRef(new Map());
  const listenerPeerRef = useRef(null);

  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume / 100;
    }
  }, [musicVolume]);

  useEffect(() => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = isTalking ? voiceVolume / 100 : 0;
    }
  }, [voiceVolume, isTalking]);

  useEffect(() => {
    roleRef.current = role;
    roomIdRef.current = roomId;
    hostIdRef.current = hostId;
    queueRef.current = queue;
    isPlayingRef.current = isPlaying;
    currentIndexRef.current = currentIndex;
    selectedIndexRef.current = selectedIndex;
  }, [role, roomId, hostId, queue, isPlaying, currentIndex, selectedIndex]);

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const audioCtx = new AudioContext();
      const mixDest = audioCtx.createMediaStreamDestination();
      const musicGain = audioCtx.createGain();
      const micGain = audioCtx.createGain();
      musicGain.gain.value = 1;
      micGain.gain.value = 0;

      musicGain.connect(mixDest);
      micGain.connect(mixDest);
      musicGain.connect(audioCtx.destination);
      micGain.connect(audioCtx.destination);

      audioCtxRef.current = audioCtx;
      mixDestRef.current = mixDest;
      musicGainRef.current = musicGain;
      micGainRef.current = micGain;
    }
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume / 100;
    }
    if (micGainRef.current) {
      micGainRef.current.gain.value = isTalking ? voiceVolume / 100 : 0;
    }
    if (audioElRef.current && !audioSourceRef.current) {
      audioSourceRef.current = audioCtxRef.current.createMediaElementSource(audioElRef.current);
      audioSourceRef.current.connect(musicGainRef.current);
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  };

  const startMockMusic = () => {
    ensureAudio();
    if (oscRef.current) {
      oscRef.current.stop();
      oscRef.current.disconnect();
      oscRef.current = null;
    }
    const audioCtx = audioCtxRef.current;
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 220 + Math.random() * 220;
    osc.connect(musicGainRef.current);
    osc.start();
    oscRef.current = osc;
  };

  const stopMockMusic = () => {
    if (oscRef.current) {
      oscRef.current.stop();
      oscRef.current.disconnect();
      oscRef.current = null;
    }
  };

  const handleCreateRoom = () => {
    if (!socket) return;
    socket.emit("create-room");
  };

  const handleJoinRoom = () => {
    if (!socket) return;
    const id = joinInput.trim();
    if (!id) return;
    socket.emit("join-room", { roomId: id });
  };

  const handleAddTrack = async () => {
    if (!socket || !roomId) return;
    const url = youtubeUrl.trim();
    if (!url) return;
    socket.emit("add-track", { roomId, url });
    setYoutubeUrl("");
    if (roleRef.current === "host") {
      const next = [...queueRef.current, url];
      queueRef.current = next;
      setQueue(next);
      if (currentIndexRef.current === -1) {
        playIndex(0, next);
        setStatus("Se reda prima piesa.");
      }
    }
  };

  const playTrackUrl = (url) => {
    ensureAudio();
    if (USE_MOCK_AUDIO) {
      startMockMusic();
      return;
    }
    if (!audioElRef.current) return;
    setStatus("Se incarca audio...");
    setNeedsUserGesture(false);
    audioElRef.current.src = `${SERVER_URL}/audio?url=${encodeURIComponent(url)}`;
    audioElRef.current.play().catch(() => {
      setStatus("Apasa Reda pentru a porni audio.");
      setNeedsUserGesture(true);
    });
  };

  const playIndex = (index, list) => {
    if (index < 0 || index >= list.length) return;
    setCurrentIndex(index);
    currentIndexRef.current = index;
    setIsPlaying(true);
    playTrackUrl(list[index]);
    if (socket && roomIdRef.current) {
      socket.emit("host-status", { roomId: roomIdRef.current, status: { isPlaying: true } });
    }
  };

  const handlePlay = async () => {
    if (!roomId || !socket) return;
    ensureAudio();
    musicGainRef.current.gain.value = 1;
    if (currentIndexRef.current === -1 && queueRef.current.length > 0) {
      playIndex(0, queueRef.current);
      setStatus("Se reda.");
      return;
    }
    if (USE_MOCK_AUDIO) {
      if (!oscRef.current) startMockMusic();
    } else if (audioElRef.current) {
      audioElRef.current.play().catch(() => {
        setStatus("Apasa Reda pentru a porni audio.");
        setNeedsUserGesture(true);
      });
    }
    setIsPlaying(true);
    socket.emit("host-status", { roomId, status: { isPlaying: true } });
    setStatus("Se reda.");
  };

  const handlePause = async () => {
    if (!roomId || !socket) return;
    ensureAudio();
    musicGainRef.current.gain.value = 0;
    if (USE_MOCK_AUDIO) {
      // keep oscillator running but muted
    } else if (audioElRef.current) {
      audioElRef.current.pause();
    }
    setIsPlaying(false);
    socket.emit("host-status", { roomId, status: { isPlaying: false } });
    setStatus("Pauza.");
  };

  const handleSkip = async () => {
    if (!roomId || !socket) return;
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex < queueRef.current.length) {
      playIndex(nextIndex, queueRef.current);
      setStatus("Sarim la urmatoarea piesa.");
      return;
    }
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setIsPlaying(false);
    socket.emit("host-status", { roomId, status: { isPlaying: false } });
    if (USE_MOCK_AUDIO) {
      stopMockMusic();
    } else if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    setStatus("Sfarsitul listei.");
  };

  const handlePlaySelected = async () => {
    if (!roomId || !socket) return;
    const idx = Number(selectedIndexRef.current);
    if (Number.isNaN(idx)) return;
    if (idx < 0 || idx >= queueRef.current.length) return;
    playIndex(idx, queueRef.current);
    setStatus("Se reda piesa selectata.");
  };

  const handleStartTalking = async () => {
    ensureAudio();
    if (!micStreamRef.current) {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioCtxRef.current.createMediaStreamSource(micStreamRef.current);
      source.connect(micGainRef.current);
    }
    micGainRef.current.gain.value = voiceVolume / 100;
    setIsTalking(true);
    setStatus("Microfon pornit.");
  };

  const handleStopTalking = () => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = 0;
    }
    setIsTalking(false);
    setStatus("Microfon oprit.");
  };

  const createHostPeer = async (listenerId) => {
    await ensureAudio();
    const pc = createPeer();
    const mixedStream = mixDestRef.current.stream;
    mixedStream.getTracks().forEach((track) => pc.addTrack(track, mixedStream));

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const s = socketRef.current;
      if (!s) return;
      s.emit("signal", {
        roomId: roomIdRef.current,
        targetId: listenerId,
        data: { candidate: event.candidate }
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        peerMapRef.current.delete(listenerId);
      }
    };

    peerMapRef.current.set(listenerId, pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", {
      roomId: roomIdRef.current,
      targetId: listenerId,
      data: pc.localDescription
    });
  };

  const handleSignalForHost = async ({ from, data }) => {
    const pc = peerMapRef.current.get(from);
    if (!pc) return;
    if (data?.type === "answer") {
      await pc.setRemoteDescription(data);
    }
    if (data?.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  };

  const handleSignalForListener = async ({ from, data }) => {
    let pc = listenerPeerRef.current;
    if (!pc) {
      pc = createPeer();
      listenerPeerRef.current = pc;
      pc.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().then(() => {
            setListenerReady(true);
          }).catch(() => {
            setStatus("Apasa Incepe ascultarea pentru audio.");
          });
        }
      };
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const s = socketRef.current;
        if (!s || !roomIdRef.current) return;
        s.emit("signal", {
          roomId: roomIdRef.current,
          targetId: from,
          data: { candidate: event.candidate }
        });
      };
    }

    if (data?.type === "offer") {
      await pc.setRemoteDescription(data);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", {
        roomId: roomIdRef.current,
        targetId: from,
        data: pc.localDescription
      });
      setStatus("Conectat la audio-ul gazdei.");
    }
    if (data?.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  };

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ["websocket"] });
    setSocket(s);
    socketRef.current = s;

    s.on("connect", () => {
      setIsConnected(true);
      setStatus("Conectat la server.");
    });

    s.on("disconnect", () => {
      setIsConnected(false);
      setStatus("Deconectat de la server.");
    });

    s.on("room-created", ({ roomId }) => {
      setRoomId(roomId);
      setRole("host");
      setHostId(s.id);
      const link = `${window.location.origin}?room=${roomId}`;
      setShareLink(link);
      window.history.replaceState({}, "", `?room=${roomId}`);
      setStatus("Camera a fost creata. Trimite linkul.");
    });

    s.on("room-joined", ({ roomId, role, hostId }) => {
      setRoomId(roomId);
      setRole(role);
      if (hostId) setHostId(hostId);
      if (role === "listener") {
        setStatus("Ai intrat in camera. Asteptam audio de la gazda.");
      }
    });

    s.on("room-error", ({ message }) => {
      setStatus(message || "Eroare camera.");
    });

    s.on("listener-joined", ({ listenerId }) => {
      if (roleRef.current === "host") {
        createHostPeer(listenerId);
      }
    });

    s.on("signal", (payload) => {
      if (roleRef.current === "host") {
        handleSignalForHost(payload);
      } else {
        handleSignalForListener(payload);
      }
    });

    s.on("track-added", ({ url, by }) => {
      setQueue((prev) => {
        if (roleRef.current === "host" && by === s.id) {
          return prev;
        }
        return [...prev, url];
      });
    });

    s.on("host-status", (status) => {
      if (roleRef.current === "listener") {
        setIsPlaying(Boolean(status?.isPlaying));
      }
    });

    s.on("host-left", () => {
      setStatus("Gazda a parasit camera.");
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setJoinInput(room);
      if (socket) {
        socket.emit("join-room", { roomId: room });
      }
    }
  }, [socket]);

  return (
    <main className="app" aria-live="polite">
      <header className="app__header">
        <h1>Just Listen</h1>
        <p className="app__subtitle">Camere radio accesibile, doar din tastatura.</p>
      </header>

      <section className="app__status" role="status" aria-label="Stare aplicatie">
        <strong>Stare:</strong> {status}
      </section>

      {!roomId && (
        <section className="panel" aria-label="Creeaza sau intra in camera">
          <div className="button-row">
            <button
              className="btn"
              onClick={handleCreateRoom}
              aria-label="Creeaza camera"
            >
              Creeaza camera
            </button>
          </div>

          <div className="field">
            <label htmlFor="roomIdInput">Cod camera</label>
            <input
              id="roomIdInput"
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Introdu codul camerei"
              aria-label="Cod camera"
            />
          </div>

          <div className="button-row">
            <button
              className="btn"
              onClick={handleJoinRoom}
              aria-label="Intra in camera"
            >
              Intra in camera
            </button>
          </div>
        </section>
      )}

      {roomId && role === "host" && (
        <section className="panel" aria-label="Control gazda">
          <h2>Control gazda</h2>

          <div className="field">
            <label htmlFor="shareLink">Link de distribuit</label>
            <input
              id="shareLink"
              type="text"
              value={shareLink}
              readOnly
              aria-label="Link de distribuit"
            />
          </div>

          <div className="field">
            <label htmlFor="youtubeInput">Link YouTube</label>
            <input
              id="youtubeInput"
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Lipeste link YouTube"
              aria-label="Link YouTube"
            />
          </div>

          <div className="button-row">
            <button className="btn" onClick={handleAddTrack} aria-label="Adauga link YouTube">
              Adauga link YouTube
            </button>
          </div>

          <div className="button-row">
            <button className="btn" onClick={handlePlay} aria-label="Reda">
              Reda
            </button>
            <button className="btn" onClick={handlePause} aria-label="Pauza">
              Pauza
            </button>
            <button className="btn" onClick={handleSkip} aria-label="Sari">
              Sari
            </button>
          </div>

          <div className="field">
            <label htmlFor="musicVolume">Volum muzica: {musicVolume}%</label>
            <input
              id="musicVolume"
              type="range"
              min="0"
              max="100"
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              aria-label="Volum muzica"
            />
          </div>

          <div className="field">
            <label htmlFor="voiceVolume">Volum voce: {voiceVolume}%</label>
            <input
              id="voiceVolume"
              type="range"
              min="0"
              max="100"
              value={voiceVolume}
              onChange={(e) => setVoiceVolume(Number(e.target.value))}
              aria-label="Volum voce"
            />
          </div>

          {needsUserGesture && (
            <div className="button-row">
              <button
                className="btn"
                onClick={() => {
                  if (audioElRef.current) {
                    audioElRef.current.play().then(() => {
                      setNeedsUserGesture(false);
                      setStatus("Se reda.");
                    }).catch(() => {
                      setStatus("Apasa Reda pentru a porni audio.");
                    });
                  }
                }}
                aria-label="Porneste muzica acum"
              >
                Porneste muzica acum
              </button>
            </div>
          )}

          <div className="button-row">
            <button
              className="btn"
              onClick={handleStartTalking}
              aria-label="Porneste vorbirea"
            >
              Porneste vorbirea
            </button>
            <button
              className="btn"
              onClick={handleStopTalking}
              aria-label="Opreste vorbirea"
            >
              Opreste vorbirea
            </button>
          </div>

          <div className="status-row" aria-live="polite">
            <span>Conexiune: {isConnected ? "Online" : "Offline"}</span>
            <span>Vorbire: {isTalking ? "Da" : "Nu"}</span>
            <span>Redare: {isPlaying ? "Da" : "Nu"}</span>
          </div>

          {!USE_MOCK_AUDIO && (
            <audio
              ref={audioElRef}
              className="hidden-audio"
              aria-hidden="true"
              crossOrigin="anonymous"
              onError={() => {
                setStatus("Audio nu s-a incarcat. Incearca alt link YouTube.");
              }}
              onCanPlay={() => {
                setStatus("Audio gata.");
              }}
              onPlaying={() => {
                setNeedsUserGesture(false);
                setIsPlaying(true);
                setStatus("Se reda.");
              }}
              onEnded={handleSkip}
            />
          )}

          <div className="queue" aria-label="Lista">
            <h3>Lista</h3>
            {queue.length === 0 && <p>Nu exista piese.</p>}
            {queue.length > 0 && (
              <>
                <div className="field">
                  <label htmlFor="queueSelect">Selecteaza urmatoarea piesa</label>
                  <select
                    id="queueSelect"
                    value={selectedIndex}
                    onChange={(e) => setSelectedIndex(e.target.value)}
                    aria-label="Selecteaza urmatoarea piesa"
                  >
                    <option value="" disabled>
                      Alege o piesa
                    </option>
                    {queue.map((item, idx) => (
                      <option key={`${item}-${idx}`} value={idx}>
                        {idx + 1}. {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="button-row">
                  <button className="btn" onClick={handlePlaySelected} aria-label="Reda piesa selectata">
                    Reda piesa selectata
                  </button>
                </div>

                <ol>
                  {queue.map((item, idx) => (
                    <li key={`${item}-${idx}`}>
                      {idx === currentIndex ? "Se reda: " : ""}{item}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </section>
      )}

      {roomId && role === "listener" && (
        <section className="panel" aria-label="Ascultator">
          <h2>Ascultare</h2>
          <p>Asculti transmisia gazdei.</p>
          <p>Gazda reda: {isPlaying ? "Da" : "Nu"}</p>
          {!listenerReady && (
            <div className="button-row">
              <button
                className="btn"
                onClick={() => {
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.play().then(() => {
                      setListenerReady(true);
                    }).catch(() => {
                      setStatus("Apasa Incepe ascultarea pentru audio.");
                    });
                  }
                }}
                aria-label="Incepe ascultarea"
              >
                Incepe ascultarea
              </button>
            </div>
          )}
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
            aria-label="Flux radio live"
          />
        </section>
      )}

      <footer className="app__footer">
        <p>Compatibil tastatura. Prietenos cu cititorul de ecran.</p>
        <p>Mod audio: {USE_MOCK_AUDIO ? "Ton fals" : "Proxy YouTube"}</p>
      </footer>
    </main>
  );
}

export default App;
