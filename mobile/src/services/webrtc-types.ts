/**
 * Minimal structural interfaces covering what App.tsx needs from a peer
 * connection / data channel. Both the browser's built-in WebRTC (used when
 * this app runs as Expo web) and react-native-webrtc's classes (used on a
 * native Android/iOS build) satisfy this shape, so App.tsx can stay
 * platform-agnostic without depending on either's concrete types.
 */
export interface MinimalDataChannel {
  label: string;
  readyState: string;
  binaryType: string;
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  addEventListener(type: string, listener: () => void): void;
}

export interface MinimalPeerConnection {
  connectionState: string;
  iceConnectionState: string;
  createDataChannel(label: string): MinimalDataChannel;
  ondatachannel: ((event: { channel: MinimalDataChannel }) => void) | null;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(desc: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(desc: { type: string; sdp?: string }): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  remoteDescription: unknown;
  close(): void;
}
