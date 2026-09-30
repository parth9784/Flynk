import { RTCPeerConnection, RTCIceCandidate } from "react-native-webrtc";
import type { MinimalPeerConnection } from "./webrtc-types";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

/** Used on a native Android/iOS build (requires a custom dev client —
 * react-native-webrtc has native code and does not run inside Expo Go). */
export function createPeerConnection(
  onIceCandidate: (candidate: unknown) => void,
  onStateChange?: (label: string, state: string) => void,
): MinimalPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS }) as unknown as MinimalPeerConnection & {
    addEventListener: (type: string, listener: (event: unknown) => void) => void;
  };

  pc.addEventListener("icecandidate", (event: unknown) => {
    const candidate = (event as { candidate?: unknown }).candidate;
    if (candidate) onIceCandidate(candidate);
  });
  pc.addEventListener("iceconnectionstatechange", () => onStateChange?.("iceConnectionState", pc.iceConnectionState));
  pc.addEventListener("connectionstatechange", () => onStateChange?.("connectionState", pc.connectionState));

  return pc;
}

/** react-native-webrtc requires wrapping the raw candidate data. */
export function toIceCandidate(raw: unknown): unknown {
  return new RTCIceCandidate(raw as ConstructorParameters<typeof RTCIceCandidate>[0]);
}
