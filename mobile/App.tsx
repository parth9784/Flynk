import { useRef, useState, useEffect } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { File } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  parseChunkFrame,
  type AnonymousSession,
  type ControlMessage,
  type JoinRoomAck,
} from "@p2p/shared";
import { createPeerConnection, toIceCandidate } from "./src/services/webrtc";
import type { MinimalDataChannel, MinimalPeerConnection } from "./src/services/webrtc-types";
import { FileReceiver, sendFile, type IncomingFile } from "./src/lib/file-transfer";
import type { PickedFile } from "./src/lib/file-types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000";
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? "http://localhost:5000";

export default function App() {
  const [session, setSession] = useState<AnonymousSession | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [role, setRole] = useState<"none" | "sender" | "receiver">("none");
  const [roomJoined, setRoomJoined] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);
  const [incomingFile, setIncomingFile] = useState<IncomingFile | null>(null);
  const [fileDecided, setFileDecided] = useState(false);
  const [receiveProgress, setReceiveProgress] = useState<{ received: number; total: number } | null>(null);
  const [verifyResult, setVerifyResult] = useState<"verified" | "failed" | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<MinimalPeerConnection | null>(null);
  const controlChannelRef = useRef<MinimalDataChannel | null>(null);
  const fileChannelRef = useRef<MinimalDataChannel | null>(null);
  const pendingCandidatesRef = useRef<unknown[]>([]);
  const acceptResolversRef = useRef(new Map<string, (result: { accepted: boolean; reason?: string }) => void>());
  const fileReceiverRef = useRef(new FileReceiver());
  const pendingCompleteRef = useRef(new Map<string, string>());

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
      setIncomingFile({ fileId: message.fileId, name: message.name, size: message.size, totalChunks: message.totalChunks });
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
    setSavedPath(result.savedInfo);
    appendLog(matches ? `file verified, ${result.savedInfo}` : "FILE INTEGRITY CHECK FAILED");
  }

  function setupDataChannels(pc: MinimalPeerConnection, isInitiator: boolean) {
    function wireControlChannel(channel: MinimalDataChannel) {
      controlChannelRef.current = channel;
      channel.onmessage = (event) => void handleControlMessage(JSON.parse(event.data as string) as ControlMessage);
    }

    function wireFileChannel(channel: MinimalDataChannel) {
      channel.binaryType = "arraybuffer";
      fileChannelRef.current = channel;
      channel.onmessage = async (event) => {
        const parsed = parseChunkFrame(event.data as ArrayBuffer);
        const progress = await fileReceiverRef.current.writeChunk(parsed.fileId, parsed.data);
        if (progress) {
          setReceiveProgress({ received: progress.receivedBytes, total: progress.totalBytes });
          if (progress.receivedChunks === progress.totalChunks) {
            await tryFinalize(parsed.fileId);
          }
        }
      };
    }

    function checkAllOpen() {
      if (controlChannelRef.current?.readyState === "open" && fileChannelRef.current?.readyState === "open") {
        setChannelsOpen(true);
        appendLog("data channels open");
      }
    }

    if (isInitiator) {
      const control = pc.createDataChannel("control");
      const file = pc.createDataChannel("file");
      wireControlChannel(control);
      wireFileChannel(file);
      control.onopen = checkAllOpen;
      file.onopen = checkAllOpen;
    } else {
      pc.ondatachannel = (event) => {
        if (event.channel.label === "control") {
          wireControlChannel(event.channel);
          event.channel.onopen = checkAllOpen;
        } else if (event.channel.label === "file") {
          wireFileChannel(event.channel);
          event.channel.onopen = checkAllOpen;
        }
      };
    }
  }

  function connectSocket(sessionToken: string, code: string, isInitiator: boolean) {
    const socket = io(SOCKET_URL, { auth: { sessionToken } });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { shareCode: code }, (ack: JoinRoomAck) => {
        if (ack.error) {
          setError(`join-room failed: ${ack.error}`);
          return;
        }
        setRoomJoined(true);
        appendLog(`joined signaling room ${code}`);
      });
    });

    socket.on(SOCKET_EVENTS.PEER_JOINED, async (data) => {
      appendLog(`peer-joined: ${JSON.stringify(data)}`);
      if (!isInitiator) return;

      const pc = createPeerConnection(
        (candidate) => socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, { shareCode: code, candidate }),
        (label, state) => appendLog(`${label}: ${state}`),
      );
      pcRef.current = pc;
      setupDataChannels(pc, true);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(SOCKET_EVENTS.OFFER, { shareCode: code, offer });
      appendLog("sent offer");
    });

    socket.on(SOCKET_EVENTS.OFFER, async (data: { offer: { type: string; sdp?: string } }) => {
      appendLog("received offer");
      const pc = createPeerConnection(
        (candidate) => socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, { shareCode: code, candidate }),
        (label, state) => appendLog(`${label}: ${state}`),
      );
      pcRef.current = pc;
      setupDataChannels(pc, false);

      await pc.setRemoteDescription(data.offer);
      for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit(SOCKET_EVENTS.ANSWER, { shareCode: code, answer });
      appendLog("sent answer");
    });

    socket.on(SOCKET_EVENTS.ANSWER, async (data: { answer: { type: string; sdp?: string } }) => {
      appendLog("received answer");
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(data.answer);
      for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
      pendingCandidatesRef.current = [];
    });

    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, async (data: { candidate: unknown }) => {
      const pc = pcRef.current;
      const candidate = toIceCandidate(data.candidate);
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(candidate);
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    });

    socket.on(SOCKET_EVENTS.PEER_LEFT, (data) => appendLog(`peer-left: ${JSON.stringify(data)}`));
    socket.on("connect_error", (err) => setError(`socket connect_error: ${err.message}`));
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

  async function pickAndSendFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !controlChannelRef.current || !fileChannelRef.current) return;

      // On web, expo-document-picker exposes the real browser File objects
      // via `output` (a FileList) — use that directly rather than its
      // asset-descriptor shape, since it already satisfies PickedFile. On
      // native, wrap the picked uri in expo-file-system's File, which
      // supports real .slice()-based chunked reads.
      const file: PickedFile =
        Platform.OS === "web" && result.output
          ? (result.output[0] as unknown as PickedFile)
          : (new File(result.assets[0].uri) as unknown as PickedFile);

      setSelectedFile(file);
      setSendProgress({ sent: 0, total: file.size ?? 0 });

      const waitForAccept = (fileId: string) =>
        new Promise<{ accepted: boolean; reason?: string }>((resolve) => {
          acceptResolversRef.current.set(fileId, resolve);
        });

      await sendFile(file, controlChannelRef.current, fileChannelRef.current, waitForAccept, {
        onProgress: (sent, total) => setSendProgress({ sent, total }),
        onComplete: () => appendLog("sent file-complete"),
        onRejected: (reason) => appendLog(`file rejected: ${reason ?? ""}`),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error picking file");
    }
  }

  async function acceptIncomingFile() {
    if (!incomingFile || !controlChannelRef.current) return;
    try {
      await fileReceiverRef.current.begin(incomingFile);
      const message: ControlMessage = { type: "file-accept", fileId: incomingFile.fileId };
      controlChannelRef.current.send(JSON.stringify(message));
      setFileDecided(true);
      appendLog("accepted incoming file");
    } catch (err) {
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

  function startOver() {
    socketRef.current?.disconnect();
    pcRef.current?.close();
    socketRef.current = null;
    pcRef.current = null;
    controlChannelRef.current = null;
    fileChannelRef.current = null;
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
    setSavedPath(null);
    setError(null);
    setLog([]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar style="auto" />
      <Text style={styles.title}>P2P File Share</Text>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Works here because this build runs in a browser (Expo web), which has native WebRTC. A plain Expo Go app on
          a phone cannot do real P2P transfer — that needs react-native-webrtc, which requires a custom dev client
          build.
        </Text>
      </View>

      {session ? (
        <Text style={styles.mono}>Session: {session.sessionToken.slice(0, 20)}...</Text>
      ) : (
        <Text>Creating anonymous session...</Text>
      )}

      {role === "none" && session && (
        <View>
          <TouchableOpacity style={styles.button} onPress={createShare}>
            <Text style={styles.buttonText}>Create Share</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Share code"
            autoCapitalize="characters"
            value={joinCodeInput}
            onChangeText={(text) => setJoinCodeInput(text.toUpperCase())}
          />
          <TouchableOpacity style={styles.button} onPress={joinShare}>
            <Text style={styles.buttonText}>Join Share</Text>
          </TouchableOpacity>
        </View>
      )}

      {role !== "none" && (
        <View>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={startOver}>
            <Text style={styles.buttonText}>← Start Over</Text>
          </TouchableOpacity>
          <Text>
            Role: {role} | Share code: {shareCode} | Room: {roomJoined ? "joined" : "connecting..."} | Channels:{" "}
            {channelsOpen ? "open" : "connecting..."}
          </Text>
        </View>
      )}

      {role === "sender" && channelsOpen && (
        <View>
          <TouchableOpacity style={styles.button} onPress={pickAndSendFile}>
            <Text style={styles.buttonText}>Pick & Send File</Text>
          </TouchableOpacity>
          {selectedFile && <Text style={styles.mono}>{selectedFile.name}</Text>}
          {sendProgress && (
            <Text>
              Sent {sendProgress.sent} / {sendProgress.total} bytes (
              {sendProgress.total > 0 ? Math.round((sendProgress.sent / sendProgress.total) * 100) : 0}%)
            </Text>
          )}
        </View>
      )}

      {role === "receiver" && incomingFile && (
        <View>
          <Text>
            Incoming: {incomingFile.name} ({incomingFile.size} bytes)
            {fileDecided ? " — accepted, receiving..." : ""}
          </Text>
          {!fileDecided && (
            <View>
              <TouchableOpacity style={styles.button} onPress={acceptIncomingFile}>
                <Text style={styles.buttonText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={rejectIncomingFile}>
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {receiveProgress && (
        <Text>
          Received {receiveProgress.received} / {receiveProgress.total} bytes (
          {receiveProgress.total > 0 ? Math.round((receiveProgress.received / receiveProgress.total) * 100) : 0}%)
        </Text>
      )}

      {verifyResult && (
        <Text style={{ color: verifyResult === "verified" ? "green" : "red", fontWeight: "bold" }}>
          {verifyResult === "verified" ? "File verified" : "File integrity check failed"}
        </Text>
      )}
      {savedPath && <Text style={styles.mono}>Saved to: {savedPath}</Text>}

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.subtitle}>Event Log</Text>
      <View style={styles.logBox}>
        {log.map((line, i) => (
          <Text key={i} style={styles.mono}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  subtitle: { fontSize: 16, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  banner: { backgroundColor: "#fff3cd", padding: 10, borderRadius: 6, marginBottom: 16 },
  bannerText: { fontSize: 12, color: "#664d03" },
  mono: { fontFamily: "monospace", fontSize: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, marginVertical: 8 },
  button: { backgroundColor: "#2563eb", padding: 10, borderRadius: 6, alignItems: "center", marginVertical: 6 },
  secondaryButton: { backgroundColor: "#6b7280" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "red", marginTop: 8 },
  logBox: { backgroundColor: "#f0f0f0", padding: 10, borderRadius: 6, minHeight: 150 },
});
