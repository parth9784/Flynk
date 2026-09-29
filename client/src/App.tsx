import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type AnonymousSession, type JoinRoomAck } from "@p2p/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000";

function App() {
  const [session, setSession] = useState<AnonymousSession | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [role, setRole] = useState<"none" | "sender" | "receiver">("none");
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  function appendLog(line: string) {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);
  }

  useEffect(() => {
    fetch(`${API_URL}/api/anonymous-sessions`, { method: "POST" })
      .then((res) => res.json())
      .then((data: AnonymousSession) => setSession(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"));
  }, []);

  function connectSocket(sessionToken: string) {
    const socket = io(SOCKET_URL, { auth: { sessionToken } });
    socketRef.current = socket;

    socket.on(SOCKET_EVENTS.PEER_JOINED, (data) => appendLog(`peer-joined: ${JSON.stringify(data)}`));
    socket.on(SOCKET_EVENTS.PEER_LEFT, (data) => appendLog(`peer-left: ${JSON.stringify(data)}`));
    socket.on(SOCKET_EVENTS.OFFER, (data) => appendLog(`offer received: ${JSON.stringify(data)}`));
    socket.on(SOCKET_EVENTS.ANSWER, (data) => appendLog(`answer received: ${JSON.stringify(data)}`));
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, (data) => appendLog(`ice-candidate received: ${JSON.stringify(data)}`));

    return socket;
  }

  function joinRoom(socket: Socket, code: string) {
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { shareCode: code }, (ack: JoinRoomAck) => {
      if (ack.error) {
        setError(`join-room failed: ${ack.error}`);
        return;
      }
      setConnected(true);
      appendLog(`joined room ${code}`);
    });
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
      const socket = connectSocket(session.sessionToken);
      socket.on("connect", () => joinRoom(socket, data.shareCode));
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
      const socket = connectSocket(session.sessionToken);
      socket.on("connect", () => joinRoom(socket, joinCodeInput));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function sendFakeOffer() {
    socketRef.current?.emit(SOCKET_EVENTS.OFFER, {
      shareCode,
      offer: { type: "offer", sdp: `fake-sdp-${Date.now()}` },
    });
    appendLog("sent fake offer");
  }

  function sendFakeAnswer() {
    socketRef.current?.emit(SOCKET_EVENTS.ANSWER, {
      shareCode,
      answer: { type: "answer", sdp: `fake-sdp-${Date.now()}` },
    });
    appendLog("sent fake answer");
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 600 }}>
      <h1>P2P File Share — Signaling Test</h1>

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
        <div>
          <p>
            Role: <strong>{role}</strong> | Share code: <code>{shareCode}</code> | Room:{" "}
            {connected ? "joined" : "connecting..."}
          </p>
          <button type="button" onClick={sendFakeOffer} disabled={!connected}>
            Send Fake Offer
          </button>{" "}
          <button type="button" onClick={sendFakeAnswer} disabled={!connected}>
            Send Fake Answer
          </button>
        </div>
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
