import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  parseChunkFrame,
  type AnonymousSession,
  type ControlMessage,
  type JoinRoomAck,
} from "@p2p/shared";
import { createPeerConnection } from "./services/webrtc";
import {
  FileReceiver,
  createFileWriter,
  downloadBlob,
  hasFileSystemAccess,
  sendFile,
  type IncomingFile,
} from "./lib/file-transfer";
import { computeTransferRate, formatBytes, formatDuration, formatSpeed } from "./lib/format";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000";

function App() {
  const [session, setSession] = useState<AnonymousSession | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [role, setRole] = useState<"none" | "sender" | "receiver">("none");
  const [roomJoined, setRoomJoined] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number; startedAt: number } | null>(null);
  const [incomingFile, setIncomingFile] = useState<IncomingFile | null>(null);
  const [fileDecided, setFileDecided] = useState(false);
  const [receiveProgress, setReceiveProgress] = useState<{ received: number; total: number; startedAt: number } | null>(
    null,
  );
  const [verifyResult, setVerifyResult] = useState<"verified" | "failed" | null>(null);

  const [chatMessages, setChatMessages] = useState<{ from: "me" | "peer"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const fileChannelRef = useRef<RTCDataChannel | null>(null);
  const chatChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const acceptResolversRef = useRef(new Map<string, (result: { accepted: boolean; reason?: string }) => void>());
  const fileReceiverRef = useRef(new FileReceiver());
  const pendingCompleteRef = useRef(new Map<string, string>()); // fileId -> expected sha256
  const lastSendUpdateRef = useRef(0);
  const lastReceiveUpdateRef = useRef(0);

  const PROGRESS_UPDATE_INTERVAL_MS = 150;

  function appendLog(line: string) {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);
  }

  useEffect(() => {
    fetch(`${API_URL}/api/anonymous-sessions`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
        return res.json();
      })
      .then((data: AnonymousSession) => setSession(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"));
  }, []);

  async function handleControlMessage(message: ControlMessage) {
    if (message.type === "file-start") {
      setIncomingFile({
        fileId: message.fileId,
        name: message.name,
        size: message.size,
        totalChunks: message.totalChunks,
      });
      setFileDecided(false);
      setReceiveProgress(null);
      setVerifyResult(null);
      appendLog(`incoming file: ${message.name} (${message.size} bytes)`);
      return;
    }

    if (message.type === "file-accept" || message.type === "file-reject") {
      const resolver = acceptResolversRef.current.get(message.fileId);
      resolver?.({ accepted: message.type === "file-accept", reason: message.type === "file-reject" ? message.reason : undefined });
      acceptResolversRef.current.delete(message.fileId);
      appendLog(message.type === "file-accept" ? "receiver accepted" : `receiver rejected: ${message.reason ?? ""}`);
      return;
    }

    if (message.type === "file-complete") {
      // The chunks may still be in flight on the file channel — WebRTC gives
      // no ordering guarantee between separate DataChannels. Only finalize
      // once every chunk has actually arrived (see tryFinalize).
      pendingCompleteRef.current.set(message.fileId, message.sha256);
      await tryFinalize(message.fileId);
      return;
    }

    if (message.type === "file-error") {
      appendLog(`file-error: ${message.reason}`);
    }
  }

  async function tryFinalize(fileId: string) {
    const expectedSha256 = pendingCompleteRef.current.get(fileId);
    if (!expectedSha256 || !fileReceiverRef.current.hasAllChunks(fileId)) return;
    pendingCompleteRef.current.delete(fileId);

    const result = await fileReceiverRef.current.finish(fileId);
    if (!result) return;

    const matches = result.sha256 === expectedSha256;
    setVerifyResult(matches ? "verified" : "failed");
    appendLog(matches ? "file verified (hash matches)" : "FILE INTEGRITY CHECK FAILED");

    if (result.blob) {
      downloadBlob(result.blob, result.meta.name);
      appendLog("download triggered (no File System Access API on this browser)");
    } else {
      appendLog("file saved to disk");
    }
  }

  function setupDataChannels(pc: RTCPeerConnection, isInitiator: boolean, socket: Socket, shareCode: string) {
    function wireControlChannel(channel: RTCDataChannel) {
      controlChannelRef.current = channel;
      channel.onmessage = (event) => void handleControlMessage(JSON.parse(event.data) as ControlMessage);
    }

    function wireFileChannel(channel: RTCDataChannel) {
      channel.binaryType = "arraybuffer";
      fileChannelRef.current = channel;
      channel.onmessage = async (event) => {
        const { fileId, chunkIndex, data } = parseChunkFrame(event.data as ArrayBuffer);
        const progress = await fileReceiverRef.current.writeChunk(fileId, data);
        if (progress) {
          const now = Date.now();
          const isLastChunk = progress.receivedChunks === progress.totalChunks;
          if (isLastChunk || now - lastReceiveUpdateRef.current > PROGRESS_UPDATE_INTERVAL_MS) {
            lastReceiveUpdateRef.current = now;
            setReceiveProgress((prev) => ({
              received: progress.receivedBytes,
              total: progress.totalBytes,
              startedAt: prev?.startedAt ?? now,
            }));
          }
          if (isLastChunk) {
            await tryFinalize(fileId);
          }
        }
        void chunkIndex; // chunk ordering within this channel is guaranteed by WebRTC
      };
    }

    function wireChatChannel(channel: RTCDataChannel) {
      chatChannelRef.current = channel;
      channel.onmessage = (event) => {
        setChatMessages((prev) => [...prev, { from: "peer", text: event.data as string }]);
      };
    }

    function checkAllOpen() {
      if (
        controlChannelRef.current?.readyState === "open" &&
        fileChannelRef.current?.readyState === "open" &&
        chatChannelRef.current?.readyState === "open"
      ) {
        setChannelsOpen(true);
        appendLog("all data channels open (control, file, chat)");
      }
    }

    if (isInitiator) {
      const control = pc.createDataChannel("control");
      const file = pc.createDataChannel("file");
      const chat = pc.createDataChannel("chat");
      wireControlChannel(control);
      wireFileChannel(file);
      wireChatChannel(chat);
      control.onopen = checkAllOpen;
      file.onopen = checkAllOpen;
      chat.onopen = checkAllOpen;
    } else {
      pc.ondatachannel = (event) => {
        if (event.channel.label === "control") {
          wireControlChannel(event.channel);
          event.channel.onopen = checkAllOpen;
        } else if (event.channel.label === "file") {
          wireFileChannel(event.channel);
          event.channel.onopen = checkAllOpen;
        } else if (event.channel.label === "chat") {
          wireChatChannel(event.channel);
          event.channel.onopen = checkAllOpen;
        }
      };
    }

    void socket;
    void shareCode;
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
      if (!isInitiator) return;

      const pc = createPeerConnection(
        (candidate) => {
          socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, { shareCode, candidate });
        },
        (label, state) => appendLog(`${label}: ${state}`),
      );
      pcRef.current = pc;
      setupDataChannels(pc, true, socket, shareCode);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(SOCKET_EVENTS.OFFER, { shareCode, offer });
      appendLog("sent offer");
    });

    socket.on(SOCKET_EVENTS.OFFER, async (data: { offer: RTCSessionDescriptionInit }) => {
      appendLog("received offer");
      const pc = createPeerConnection(
        (candidate) => {
          socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, { shareCode, candidate });
        },
        (label, state) => appendLog(`${label}: ${state}`),
      );
      pcRef.current = pc;
      setupDataChannels(pc, false, socket, shareCode);

      await pc.setRemoteDescription(data.offer);
      for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
      pendingCandidatesRef.current = [];

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
      for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
      pendingCandidatesRef.current = [];
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
        body: JSON.stringify({ files: [{ name: "transfer", size: 1024, mimeType: "application/octet-stream" }] }),
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

  async function handleSendFile() {
    if (!selectedFile || !controlChannelRef.current || !fileChannelRef.current) return;
    const startedAt = Date.now();
    setSendProgress({ sent: 0, total: selectedFile.size, startedAt });

    const waitForAccept = (fileId: string) =>
      new Promise<{ accepted: boolean; reason?: string }>((resolve) => {
        acceptResolversRef.current.set(fileId, resolve);
      });

    await sendFile(selectedFile, controlChannelRef.current, fileChannelRef.current, waitForAccept, {
      onProgress: (sent, total) => {
        const now = Date.now();
        if (sent === total || now - lastSendUpdateRef.current > PROGRESS_UPDATE_INTERVAL_MS) {
          lastSendUpdateRef.current = now;
          setSendProgress({ sent, total, startedAt });
        }
      },
      onComplete: () => appendLog("sent file-complete"),
      onRejected: (reason) => appendLog(`file rejected by receiver: ${reason ?? ""}`),
    });
  }

  async function acceptIncomingFile() {
    if (!incomingFile || !controlChannelRef.current) return;
    try {
      const writer = await createFileWriter(incomingFile.name);
      fileReceiverRef.current.begin(incomingFile, writer);
      const message: ControlMessage = { type: "file-accept", fileId: incomingFile.fileId };
      controlChannelRef.current.send(JSON.stringify(message));
      setFileDecided(true);
      appendLog(`accepted incoming file (${hasFileSystemAccess() ? "streaming to disk" : "buffering in memory"})`);
    } catch (err) {
      // showSaveFilePicker throws AbortError if the user cancels the save dialog.
      appendLog(`save location not chosen, rejecting: ${err instanceof Error ? err.message : "unknown error"}`);
      rejectIncomingFile();
    }
  }

  function rejectIncomingFile() {
    if (!incomingFile || !controlChannelRef.current) return;
    const message: ControlMessage = { type: "file-reject", fileId: incomingFile.fileId, reason: "declined" };
    controlChannelRef.current.send(JSON.stringify(message));
    setIncomingFile(null);
  }

  function sendChatMessage() {
    if (!chatInput.trim() || chatChannelRef.current?.readyState !== "open") return;
    chatChannelRef.current.send(chatInput);
    setChatMessages((prev) => [...prev, { from: "me", text: chatInput }]);
    setChatInput("");
  }

  function startOver() {
    socketRef.current?.disconnect();
    pcRef.current?.close();
    socketRef.current = null;
    pcRef.current = null;
    controlChannelRef.current = null;
    fileChannelRef.current = null;
    chatChannelRef.current = null;
    pendingCandidatesRef.current = [];
    acceptResolversRef.current.clear();
    fileReceiverRef.current = new FileReceiver();
    pendingCompleteRef.current.clear();

    setShareCode("");
    setJoinCodeInput("");
    setRole("none");
    setRoomJoined(false);
    setChannelsOpen(false);
    setSelectedFile(null);
    setSendProgress(null);
    setIncomingFile(null);
    setFileDecided(false);
    setReceiveProgress(null);
    setVerifyResult(null);
    setChatMessages([]);
    setChatInput("");
    setError(null);
    setLog([]);
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 600 }}>
      <h1>P2P File Share — File Transfer</h1>

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
          <button type="button" onClick={startOver}>
            ← Start Over
          </button>{" "}
          Role: <strong>{role}</strong> | Share code: <code>{shareCode}</code> | Room:{" "}
          {roomJoined ? "joined" : "connecting..."} | Channels: {channelsOpen ? "open" : "connecting..."}
        </p>
      )}

      {role === "sender" && channelsOpen && (
        <div>
          <input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={handleSendFile} disabled={!selectedFile}>
            Send File
          </button>
          {sendProgress && (
            <p>
              {(() => {
                const rate = computeTransferRate(sendProgress.sent, sendProgress.total, sendProgress.startedAt);
                return (
                  <>
                    Sent {formatBytes(sendProgress.sent)} / {formatBytes(sendProgress.total)} (
                    {rate.percent.toFixed(1)}%) — {formatSpeed(rate.speedBytesPerSecond)} — ETA{" "}
                    {formatDuration(rate.etaSeconds)}
                  </>
                );
              })()}
            </p>
          )}
        </div>
      )}

      {role === "receiver" && incomingFile && (
        <div>
          <p>
            Incoming: <strong>{incomingFile.name}</strong> ({incomingFile.size} bytes)
            {fileDecided && " — accepted, receiving..."}
          </p>
          {!fileDecided && (
            <>
              <button type="button" onClick={acceptIncomingFile}>
                Accept
              </button>{" "}
              <button type="button" onClick={rejectIncomingFile}>
                Reject
              </button>
            </>
          )}
        </div>
      )}

      {receiveProgress && (
        <p>
          {(() => {
            const rate = computeTransferRate(receiveProgress.received, receiveProgress.total, receiveProgress.startedAt);
            return (
              <>
                Received {formatBytes(receiveProgress.received)} / {formatBytes(receiveProgress.total)} (
                {rate.percent.toFixed(1)}%) — {formatSpeed(rate.speedBytesPerSecond)} — ETA{" "}
                {formatDuration(rate.etaSeconds)}
              </>
            );
          })()}
        </p>
      )}

      {channelsOpen && (
        <div>
          <h3>Chat</h3>
          <div style={{ background: "#fafafa", border: "1px solid #ddd", padding: "0.5rem", minHeight: 100, marginBottom: "0.5rem" }}>
            {chatMessages.map((msg, i) => (
              <p key={i} style={{ margin: "0.25rem 0" }}>
                <strong>{msg.from === "me" ? "You" : "Peer"}:</strong> {msg.text}
              </p>
            ))}
          </div>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
            placeholder="Type a message"
          />
          <button type="button" onClick={sendChatMessage}>
            Send
          </button>
        </div>
      )}

      {verifyResult && (
        <p style={{ color: verifyResult === "verified" ? "green" : "red", fontWeight: "bold" }}>
          {verifyResult === "verified" ? "✅ File verified" : "❌ File integrity verification failed"}
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
