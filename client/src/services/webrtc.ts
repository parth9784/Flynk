const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeerConnection(onIceCandidate: (candidate: RTCIceCandidate) => void): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate);
  };
  return pc;
}
