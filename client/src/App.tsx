import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type AnonymousSession, type JoinRoomAck } from "@p2p/shared";
import { createPeerConnection } from "./services/webrtc";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000";

function App() {
  const [session, setSession] = useState<AnonymousSession | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [role, setRole] = useState<"none" | "sender" | "receiver">("none");
  const [roomJoined, setRoomJoined] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  function appendLog(line: string) {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);
  }

  useEffect(() => {
    fetch(`${API_URL}/api/anonymous-sessions`, { method: "POST" })
      .then((res) => res.json())
      .then((data: AnonymousSession) => setSession(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"));
  }, []);

  function setupDataChannel(channel: RTCDataChannel, isInitiator: boolean) {
    dataChannelRef.current = channel;
    channel.onopen = () => {
      setChannelOpen(true);
      appendLog("data channel open");
      if (isInitiator) {
        channel.send("Hello World");
        appendLog("sent: Hello World");
      }
    };
    channel.onmessage = (event) => appendLog(`received: ${event.data}`);
    channel.onclose = () => {
      setChannelOpen(false);
      appendLog("data channel closed");
    };
  }

  async function flushPendingCandidates(pc: RTCPeerConnection) {
    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(candidate);
    }
    pendingCandidatesRef.current = [];
  }

  function connectSocket(sessionToken: string, shareCode: string, isInitiator: boolean) {
    const socket = io(SOCKET_URL, { auth: { sessionToken } });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { shareCode }, (ack: JoinRoomAck) => {
        if (ack.error) {
          setError(`join-room failed: ${ack.error}`);
          return;
        }
        setRoomJoined(true);
        appendLog(`joined room ${shareCode}`);
      });
    });

    socket.on(SOCKET_EVENTS.PEER_JOINED, async (data) => {
      appendLog(`peer-joined: ${JSON.stringify(data)}`);
      if (!isInitiator) return; // only the sender initiates the offer

      const pc = createPeerConnection((candidate) => {
        socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, { shareCode, candidate });
      });
      pcRef.current = pc;

      const channel = pc.createDataChannel("hello");
      setupDataChannel(channel, true);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(SOCKET_EVENTS.OFFER, { shareCode, offer });
      appendLog("sent offer");
    });

    socket.on(SOCKET_EVENTS.OFFER, async (data: { offer: RTCSessionDescriptionInit }) => {
      appendLog("received offer");
      const pc = createPeerConnection((candidate) => {
        socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, { shareCode, candidate });
      });
      pcRef.current = pc;
      pc.ondatachannel = (event) => setupDataChannel(event.channel, false);

      await pc.setRemoteDescription(data.offer);
      await flushPendingCandidates(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit(SOCKET_EVENTS.ANSWER, { shareCode, answer });
      appendLog("sent answer");
    });

    socket.on(SOCKET_EVENTS.ANSWER, async (data: { answer: RTCSessionDescriptionInit }) => {
      appendLog("received answer");
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(data.answer);
      await flushPendingCandidates(pc);
    });

    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, async (data: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(data.candidate);
      } else {
        pendingCandidatesRef.current.push(data.candidate);
      }
    });

    socket.on(SOCKET_EVENTS.PEER_LEFT, (data) => appendLog(`peer-left: ${JSON.stringify(data)}`));

    return socket;
  }

  async function createShare() {
    if (!session) return;
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Token": session.sessionToken },
        body: JSON.stringify({ files: [{ name: "test.txt", size: 1024, mimeType: "text/plain" }] }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setShareCode(data.shareCode);
      setRole("sender");
      connectSocket(session.sessionToken, data.shareCode, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function joinShare() {
    if (!session || !joinCodeInput) return;
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/shares/${joinCodeInput}/join`, {
        method: "POST",
        headers: { "X-Session-Token": session.sessionToken },
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      setShareCode(joinCodeInput);
      setRole("receiver");
      connectSocket(session.sessionToken, joinCodeInput, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 600 }}>
      <h1>P2P File Share — WebRTC Hello World</h1>

      {session ? (
        <p>
          Session: <code>{session.sessionToken.slice(0, 16)}...</code>
        </p>
      ) : (
        <p>Creating anonymous session...</p>
      )}

      {role === "none" && session && (
        <div style={{ display: "flex", gap: "2rem" }}>
          <div>
            <h3>Sender</h3>
            <button type="button" onClick={createShare}>
              Create Share
            </button>
          </div>
          <div>
            <h3>Receiver</h3>
            <input
              placeholder="Share code"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
            />
            <button type="button" onClick={joinShare}>
              Join Share
            </button>
          </div>
        </div>
      )}

      {role !== "none" && (
        <p>
          Role: <strong>{role}</strong> | Share code: <code>{shareCode}</code> | Room:{" "}
          {roomJoined ? "joined" : "connecting..."} | DataChannel: {channelOpen ? "open" : "connecting..."}
        </p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <h3>Event Log</h3>
      <pre style={{ background: "#f0f0f0", padding: "1rem", minHeight: 200, whiteSpace: "pre-wrap" }}>
        {log.join("\n")}
      </pre>
    </main>
  );
}

export default App;
