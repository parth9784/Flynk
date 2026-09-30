import type { MinimalPeerConnection } from "./webrtc-types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Used when this app is bundled for Expo web — the browser already has
 * native WebRTC support, identical to the client/ web app. */
export function createPeerConnection(
  onIceCandidate: (candidate: RTCIceCandidate) => void,
  onStateChange?: (label: string, state: string) => void,
): MinimalPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate);
  };
  pc.oniceconnectionstatechange = () => onStateChange?.("iceConnectionState", pc.iceConnectionState);
  pc.onconnectionstatechange = () => onStateChange?.("connectionState", pc.connectionState);

  return pc as unknown as MinimalPeerConnection;
}

/** Browsers accept a plain RTCIceCandidateInit object directly. */
export function toIceCandidate(raw: unknown): unknown {
  return raw;
}
