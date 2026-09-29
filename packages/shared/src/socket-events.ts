export const SOCKET_EVENTS = {
  JOIN_ROOM: "join-room",
  OFFER: "offer",
  ANSWER: "answer",
  ICE_CANDIDATE: "ice-candidate",
  PEER_JOINED: "peer-joined",
  PEER_LEFT: "peer-left",
} as const;

export interface JoinRoomPayload {
  shareCode: string;
}

export interface JoinRoomAck {
  ok?: true;
  error?: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";
}

export interface OfferPayload {
  shareCode: string;
  offer: unknown;
}

export interface AnswerPayload {
  shareCode: string;
  answer: unknown;
}

export interface IceCandidatePayload {
  shareCode: string;
  candidate: unknown;
}

export interface RelayedOffer {
  offer: unknown;
  from: string;
}

export interface RelayedAnswer {
  answer: unknown;
  from: string;
}

export interface RelayedIceCandidate {
  candidate: unknown;
  from: string;
}

export interface PeerEvent {
  socketId: string;
}
