import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type AnonymousSession, type JoinRoomAck } from "@p2p/shared";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000";
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? "http://localhost:5000";

export default function App() {
  const [session, setSession] = useState<AnonymousSession | null>(null);
  const [shareCode, setShareCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [role, setRole] = useState<"none" | "sender" | "receiver">("none");
  const [roomJoined, setRoomJoined] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

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

  function connectSocket(sessionToken: string, code: string) {
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

    socket.on(SOCKET_EVENTS.PEER_JOINED, (data) => appendLog(`peer-joined: ${JSON.stringify(data)}`));
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
      connectSocket(session.sessionToken, data.shareCode);
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
      connectSocket(session.sessionToken, joinCodeInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar style="auto" />
      <Text style={styles.title}>P2P File Share</Text>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Real peer-to-peer transfer needs react-native-webrtc, which requires a custom dev client build — it will
          not run inside Expo Go. This screen exercises the REST API and Socket.IO signaling only, to confirm the
          Android client can reach the backend and join a signaling room.
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
        <Text>
          Role: {role} | Share code: {shareCode} | Room: {roomJoined ? "joined" : "connecting..."}
        </Text>
      )}

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
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "red", marginTop: 8 },
  logBox: { backgroundColor: "#f0f0f0", padding: 10, borderRadius: 6, minHeight: 150 },
});
