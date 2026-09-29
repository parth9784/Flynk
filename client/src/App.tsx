import { useState } from "react";
import type { AnonymousSession } from "@p2p/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function App() {
  const [session, setSession] = useState<AnonymousSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createAnonymousSession() {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/anonymous-sessions`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as AnonymousSession;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>P2P File Share — Walking Skeleton</h1>
      <button type="button" onClick={createAnonymousSession}>
        Create anonymous session
      </button>

      {session && (
        <pre>{JSON.stringify(session, null, 2)}</pre>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}

export default App;
