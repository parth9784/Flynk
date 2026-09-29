# 🚀 P2P File Sharing Platform

A secure, cross-platform **peer-to-peer file-sharing application** that allows users to transfer files directly between devices using **WebRTC**.

The platform supports:

- 🌐 Web application
- 📱 Android application
- 🔓 Login-free transfer for files up to 500 MB
- 🔐 Optional/required account for files above 500 MB and for transfer history
- 📤 File sending
- 📥 File receiving
- 🔗 Share links
- 🔢 Share codes
- 📷 QR-based device connection
- ⚡ Peer-to-peer file transfer
- 💬 Real-time chat during transfer
- 📊 Transfer progress and speed
- 🔒 Encrypted WebRTC communication
- 🧩 STUN/TURN support
- 🗄️ Transfer history (accounts only)
- 🛡️ File integrity verification
- ⏱️ Temporary/expiring sharing sessions

The primary goal is to create a simple experience similar to:

> **Select a file → Generate QR/code → Connect another device → Transfer directly.**

---

# 📌 Table of Contents

1. [Project Overview](#-project-overview)
2. [Problem Statement](#-problem-statement)
3. [Project Goals](#-project-goals)
4. [Key Features](#-key-features)
5. [How It Works](#-how-it-works)
6. [System Architecture](#-system-architecture)
7. [Technology Stack](#-technology-stack)
8. [Web Application](#-web-application)
9. [Android Application](#-android-application)
10. [Backend](#-backend)
11. [WebRTC Architecture](#-webrtc-architecture)
12. [Signaling](#-signaling)
13. [STUN and TURN](#-stun-and-turn)
14. [File Transfer Architecture](#-file-transfer-architecture)
14a. [Transfer Message Framing (Wire Protocol)](#-transfer-message-framing-wire-protocol)
14b. [Large File Memory Strategy](#-large-file-memory-strategy)
15. [Chat Architecture](#-chat-architecture)
16. [Authentication](#-authentication)
17. [Database Design](#-database-design)
18. [Project Structure](#-project-structure)
19. [Prerequisites](#-prerequisites)
20. [Installation](#-installation)
21. [Environment Variables](#-environment-variables)
22. [Running the Project](#-running-the-project)
23. [Web Application Setup](#-web-application-setup)
24. [Android Application Setup](#-android-application-setup)
25. [Backend Setup](#-backend-setup)
26. [Database Setup](#-database-setup)
27. [WebRTC Connection Flow](#-webrtc-connection-flow)
28. [File Transfer Flow](#-file-transfer-flow)
29. [QR Code Sharing](#-qr-code-sharing)
30. [API Design](#-api-design)
31. [Socket Events](#-socket-events)
32. [Security](#-security)
33. [File Integrity](#-file-integrity)
34. [Error Handling](#-error-handling)
35. [Testing](#-testing)
36. [Docker](#-docker)
37. [Production Deployment](#-production-deployment)
38. [Monitoring](#-monitoring)
39. [Development Roadmap](#-development-roadmap)
40. [Future Features](#-future-features)
41. [Open Source Contribution](#-open-source-contribution)
42. [License](#-license)

---

# 🎯 Project Overview

This project is a **cross-platform peer-to-peer file-sharing system**.

Users can send files from:

```text
Web → Web
Web → Android
Android → Web
Android → Android
```

The application uses **WebRTC DataChannels** to transfer files between peers.

The backend is primarily responsible for:

- Authentication
- User management
- Share sessions
- Peer discovery
- WebRTC signaling
- Room management
- Transfer metadata
- Authorization
- Rate limiting

The backend should **not normally store the actual file being transferred**.

The intended transfer architecture is:

```text
Sender
   │
   │
   │ WebRTC
   │
   ▼
Receiver
```

rather than:

```text
Sender
   │
   ▼
Backend
   │
   ▼
Storage
   │
   ▼
Receiver
```

This reduces the need for the application server to handle the actual file payload during successful direct P2P transfers.

---

# ❗ Problem Statement

Traditional file-sharing applications commonly use a central server:

```text
Device A
   │
   ▼
Server
   │
   ▼
Device B
```

This can introduce:

- Server bandwidth costs
- Storage requirements
- Upload/download latency
- Additional infrastructure
- Privacy concerns around server-side file storage

This project aims to provide a P2P alternative:

```text
Device A
    ═══════════════
       WebRTC
    ═══════════════
Device B
```

The server is used primarily for coordination and signaling.

---

# 🎯 Project Goals

The project should provide:

### Primary goals

- Easy file sharing
- **Zero-friction entry**: no account required to send or receive files ≤ 500 MB
- Cross-platform support
- Peer-to-peer transfer
- Secure communication
- Real-time progress
- Simple device pairing
- QR-based connection
- Temporary sharing sessions
- Convert casual anonymous users into registered users once they need larger transfers or history

### Secondary goals

- Transfer history
- Chat
- File integrity verification
- Resumable transfers
- Multiple-file transfer
- Transfer analytics
- Open-source extensibility

---

# ✨ Key Features

## 1. User Authentication

Users can:

- Register
- Login
- Logout
- Manage profile
- View transfer history

Authentication uses JWT-based sessions.

---

## 2. Send Files

A user can:

1. Select files
2. Create a share session
3. Generate a share code/QR
4. Wait for receiver
5. Approve the receiver
6. Start transfer

Example:

```text
Select File
     ↓
Create Share
     ↓
Generate QR
     ↓
Receiver Scans
     ↓
Connection Established
     ↓
Transfer
```

---

# 3. Receive Files

A receiver can:

- Scan QR
- Enter share code
- Open share link
- View file details
- Accept/reject transfer
- Download received file

---

# 4. QR Code Sharing

Example:

```text
https://app.example.com/share/7F8K2P
```

The QR code contains the temporary share information.

Example:

```text
┌─────────────────────┐
│                     │
│      QR CODE        │
│                     │
│       ▓▓▓▓▓         │
│       ▓  ▓▓         │
│       ▓▓▓▓▓         │
│                     │
└─────────────────────┘

Expires in: 09:52
```

---

# 5. Share Codes

Users can also enter:

```text
7F8K2P
```

instead of scanning a QR code.

---

# 6. Real-Time Transfer Progress

The UI displays:

```text
project.zip

████████████████░░░░

82%

697 MB / 850 MB

Speed: 18.4 MB/s
ETA: 8 seconds
```

---

# 7. Real-Time Chat

Users can communicate during transfer:

```text
Parth:
Sending the project ZIP.

Gopala:
Okay 👍

Parth:
It is around 850 MB.
```

Chat messages are transmitted through WebRTC DataChannels.

---

# 8. File Integrity Verification

The sender calculates a SHA-256 hash.

The receiver calculates the hash after receiving the file.

```text
Sender Hash
     │
     ▼
ABC123XYZ
     │
     │ compare
     ▼
Receiver Hash
     │
     ▼
ABC123XYZ
```

If they match:

```text
✅ File verified
```

Otherwise:

```text
❌ File integrity verification failed
```

---

# 🏗️ System Architecture

```text
                         INTERNET
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
          ▼                                   ▼
     WEB CLIENT                         ANDROID CLIENT
     React + TS                        React Native
          │                                   │
          │                                   │
          └───────────────┬───────────────────┘
                          │
                     HTTPS / WSS
                          │
                          ▼
                ┌─────────────────────┐
                │     Node.js API     │
                │                     │
                │ Authentication      │
                │ User Management     │
                │ Share Sessions      │
                │ Signaling           │
                │ Authorization       │
                └──────────┬──────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
           Redis       PostgreSQL    Socket.IO
              │
              │
              ▼
        Temporary State


        ┌────────────────────────────────┐
        │          WebRTC Layer           │
        │                                │
        │        STUN / TURN              │
        │                                │
        └───────────────┬────────────────┘
                        │
                        ▼

             ┌─────────────────────┐
             │    P2P Connection   │
             │                     │
             │      WebRTC         │
             │                     │
             └──────────┬──────────┘
                        │
                ┌───────┴────────┐
                │                │
                ▼                ▼
             File Data          Chat
```

---

# 🧰 Technology Stack

## Frontend — Web

```text
React
TypeScript
Vite
Tailwind CSS
React Router
Socket.IO Client
WebRTC APIs
Lucide React
```

---

## Mobile

```text
React Native
Expo
TypeScript
React Navigation
WebRTC-compatible React Native library
Socket.IO Client
```

---

## Backend

```text
Node.js
TypeScript
Express
Socket.IO
JWT
bcrypt
Prisma
```

---

## Database

```text
PostgreSQL
```

---

## Cache / Temporary State

```text
Redis
```

---

## WebRTC Infrastructure

```text
WebRTC
STUN
TURN
coturn
```

---

## Deployment

```text
Docker
Docker Compose
Nginx
HTTPS
Let's Encrypt
```

---

# 🌐 Web Application

The web application is built using:

```text
React + TypeScript + Vite + Tailwind
```

## Main screens

```text
Login
Register
Dashboard
Send
Receive
Transfer
History
Profile
Settings
```

---

# 📱 Android Application

The Android application is built using:

```text
React Native
Expo
TypeScript
```

## Main screens

```text
Splash
Login
Register
Home
Send
Receive
QR Scanner
Transfer
Chat
History
Profile
Settings
```

---

# 🔧 Backend

The backend has two major responsibilities.

## 1. REST API

Used for:

```text
Authentication
User management
Share management
Transfer metadata
History
```

## 2. WebSocket / Socket.IO

Used for:

```text
WebRTC signaling
Room management
Peer discovery
Real-time transfer state
```

---

# 🌐 WebRTC Architecture

WebRTC provides real-time peer-to-peer communication.

The major APIs used are:

```text
RTCPeerConnection
RTCDataChannel
```

---

# 🔌 RTCPeerConnection

Creates the WebRTC connection.

Example:

```javascript
const peerConnection =
    new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.example.com"
            }
        ]
    });
```

---

# 📡 RTCDataChannel

Used for sending arbitrary data.

Example:

```javascript
const dataChannel =
    peerConnection.createDataChannel("file");

dataChannel.onopen = () => {
    console.log("Data channel connected");
};
```

Data can be sent using:

```javascript
dataChannel.send(data);
```

---

# 🤝 Signaling

WebRTC requires peers to exchange connection information.

The application uses Socket.IO for signaling.

The signaling server exchanges:

```text
SDP Offer
SDP Answer
ICE Candidates
```

The server does not need to transfer the actual file during a successful direct P2P connection.

---

# 📤 SDP Offer

Sender creates an offer:

```javascript
const offer =
    await peerConnection.createOffer();

await peerConnection.setLocalDescription(
    offer
);
```

Then:

```text
Sender
   │
   │ offer
   ▼
Socket.IO
   │
   ▼
Receiver
```

---

# 📥 SDP Answer

Receiver responds:

```javascript
await peerConnection.setRemoteDescription(
    offer
);

const answer =
    await peerConnection.createAnswer();

await peerConnection.setLocalDescription(
    answer
);
```

Then:

```text
Receiver
   │
   │ answer
   ▼
Socket.IO
   │
   ▼
Sender
```

---

# 🧭 ICE Candidates

ICE helps determine how peers can connect.

```javascript
peerConnection.onicecandidate =
    (event) => {

        if (event.candidate) {

            socket.emit(
                "ice-candidate",
                event.candidate
            );

        }

    };
```

---

# 🌍 STUN

STUN helps discover public-facing network information.

Example:

```javascript
{
    urls: "stun:stun.example.com"
}
```

STUN does not normally relay the actual file.

---

# 🔄 TURN

If direct P2P communication cannot be established, TURN can relay traffic.

```text
Peer A
   │
   ▼
TURN Server
   │
   ▼
Peer B
```

TURN is important for production reliability because some networks prevent direct peer connectivity.

## Short-lived TURN credentials

Handing every client a static `TURN_USERNAME`/`TURN_PASSWORD` means anyone who inspects the client can extract long-lived relay credentials. Instead, the backend mints per-connection credentials on demand, using coturn's standard time-limited REST API mechanism:

```text
Client requests ICE config
        ↓
Backend: username = "<expiryTimestamp>:<clientId>"
         password = base64(HMAC-SHA1(TURN_SECRET, username))
        ↓
Return { urls, username, password } with ~1 hour TTL
        ↓
coturn validates HMAC + expiry on connect
```

This works identically for anonymous sessions and authenticated users — `clientId` is either the session token or the user id, and coturn never needs to know which.

---

# 📦 File Transfer Architecture

Large files should be transferred in chunks.

Example:

```text
850 MB file
     ↓
Split
     ↓
64 KB chunks
     ↓
WebRTC DataChannel
     ↓
Receiver
     ↓
Reassemble
     ↓
850 MB file
```

Example:

```javascript
const CHUNK_SIZE = 64 * 1024;

for (
    let offset = 0;
    offset < file.size;
    offset += CHUNK_SIZE
) {
    const chunk = file.slice(
        offset,
        offset + CHUNK_SIZE
    );

    const buffer =
        await chunk.arrayBuffer();

    dataChannel.send(buffer);
}
```

---

# 📨 Transfer Message Framing (Wire Protocol)

A raw `dataChannel.send(buffer)` per chunk is not enough — the receiver needs to know which file a chunk belongs to, its position, and when a file is complete. A single DataChannel carries two kinds of messages, so every message needs an explicit type.

## Two-channel approach

```text
WebRTC Connection
│
├── control-channel   (JSON, ordered/reliable)
│     - file metadata
│     - chunk ACKs
│     - start/complete/error signals
│
├── file-channel       (binary, ordered/reliable)
│     - raw chunk bytes only
│
└── chat-channel       (JSON, ordered/reliable)
```

Keeping control messages off the binary channel avoids ambiguity between "is this JSON or a chunk?" and keeps chunk framing minimal.

## Control messages

```json
{ "type": "file-start", "fileId": "f1", "name": "project.zip", "size": 890000000, "totalChunks": 13579, "sha256": "ABC123..." }
{ "type": "file-complete", "fileId": "f1" }
{ "type": "file-error", "fileId": "f1", "reason": "hash-mismatch" }
```

## Binary chunk framing

Each binary message on `file-channel` is prefixed with a small fixed header so the receiver can demux chunks belonging to multiple in-flight files without needing a separate message per chunk on the control channel:

```text
[ fileIdLength: 1 byte ][ fileId: N bytes ][ chunkIndex: 4 bytes ][ chunkData: rest ]
```

```javascript
function frameChunk(fileId, chunkIndex, chunkData) {
    const fileIdBytes = new TextEncoder().encode(fileId);
    const header = new Uint8Array(1 + fileIdBytes.length + 4);
    header[0] = fileIdBytes.length;
    header.set(fileIdBytes, 1);
    new DataView(header.buffer).setUint32(1 + fileIdBytes.length, chunkIndex);
    return new Blob([header, chunkData]);
}
```

The receiver reads the header, routes the payload to the right file's reassembly buffer by `fileId`, and writes it at `chunkIndex * CHUNK_SIZE`.

---

# 💾 Large File Memory Strategy

Buffering an entire 500 MB–1 GB file in memory (as an array of chunks or one large `ArrayBuffer`) is not viable in a browser tab. The write path must stream to disk as chunks arrive rather than accumulate them first.

```text
Chunk received
      ↓
Write to disk incrementally
      ↓
(never hold the full file in RAM)
```

## Web

Prefer the **File System Access API** (`showSaveFilePicker` + `FileSystemWritableFileStream`) where available (Chromium-based browsers), writing each chunk as it arrives:

```javascript
const handle = await window.showSaveFilePicker({ suggestedName: file.name });
const writable = await handle.createWritable();
// per chunk:
await writable.write(chunkData);
// on file-complete:
await writable.close();
```

For browsers without File System Access API support (Firefox, Safari), fall back to writing chunks into an IndexedDB-backed buffer and assembling the final `Blob` for download only at completion — still bounded, but less ideal for very large files. The UI should reflect which strategy is active so users on unsupported browsers understand any extra memory pressure.

## Android

Write incoming chunks directly to a file in app-scoped storage (`FileOutputStream` / Storage Access Framework `OutputStream`) as they arrive — never accumulate chunks in a JS/React Native bridge buffer before writing.

---

# 🚦 Backpressure

Large file transfers must avoid overwhelming the WebRTC buffer.

Do not poll `bufferedAmount` in a loop — busy-waiting burns CPU and delays reacting to drain. Instead, set a low-water mark and react to the event:

```javascript
const BUFFER_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MB
dataChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

dataChannel.onbufferedamountlow = () => {
    sendNextChunk();
};

function sendChunk(chunk) {
    dataChannel.send(chunk);
    if (dataChannel.bufferedAmount > BUFFER_LOW_THRESHOLD) {
        return; // wait for onbufferedamountlow before sending more
    }
    sendNextChunk();
}
```

```text
Send chunk
      ↓
bufferedAmount > threshold?
      ↓                  ↓
    Yes                 No
      ↓                  ↓
Wait for event      Send next chunk
      ↓
onbufferedamountlow fires
      ↓
Send next chunk
```

This is important for reliable large-file transfers and keeps the UI thread responsive.

---

# 💬 Chat Architecture

A separate DataChannel can be created for chat:

```javascript
const chatChannel =
    peerConnection.createDataChannel("chat");
```

Example:

```text
WebRTC Connection
│
├── file-channel
│
└── chat-channel
```

---

# 🔐 Authentication

Authentication is **optional**, gated by file size, not mandatory up front.

```text
Total share size ≤ 500 MB
        │
        ▼
  Anonymous share
  (no login required)

Total share size > 500 MB
        │
        ▼
   Login required
```

This keeps the core promise — *select a file, generate a code, transfer* — frictionless for the common case, while using the 500 MB threshold as the conversion point to get people to create accounts.

## Anonymous sessions

An anonymous sender/receiver is not un-tracked — the backend still needs to rate-limit and expire their activity. Each anonymous client is issued a short-lived, unauthenticated **session token** (random opaque ID, not a JWT, no user record) on first contact:

```text
Client connects
      ↓
POST /api/anonymous-sessions
      ↓
{ sessionToken, expiresAt }
      ↓
Stored client-side (memory/localStorage)
      ↓
Sent as X-Session-Token on share/transfer requests
```

The anonymous session token is used purely for:

```text
Rate limiting (shares created, join attempts)
Attributing a share to its creator for cancel/accept actions
Abuse tracing in logs
```

It grants no access to another user's data and cannot be exchanged for a real account later — if the user registers, it's a brand-new identity, not an upgrade path. History (see below) is unavailable for anonymous sessions by design; that gap is itself part of the incentive to register.

## Authenticated sessions

Once a transfer requires it (or a user proactively logs in for history/larger limits), the system falls back to JWT-based auth as before:

```text
Register
   ↓
Password Hash
   ↓
PostgreSQL
   ↓
Login
   ↓
JWT
   ↓
Protected APIs
```

Passwords should never be stored directly.

Use a password hashing algorithm such as bcrypt/Argon2 according to the chosen implementation.

## Enforcing the threshold

The size check must happen **server-side**, at share creation, not just in the client UI (a client can be modified to skip a login prompt):

```text
POST /api/shares
      ↓
Sum requested file sizes
      ↓
> MAX_ANONYMOUS_FILE_SIZE_MB?
      ↓                  ↓
    Yes                 No
      ↓                  ↓
Require valid JWT   Session token is enough
      ↓                  ↓
401 if missing      Create share
```

Because the actual bytes never pass through the backend (P2P transport), the server can only enforce this against the size the client *declares* when creating the share — not the real bytes sent over WebRTC afterward. A malicious client could under-report size to skip login and then send more once the DataChannel opens. This is a known limitation of a metadata-only signaling server; if it matters for the deployment, the receiver-side UI should also show the declared vs. actually-received byte count and flag a mismatch, and repeat abuse should be caught via the same rate limiting used for anonymous share creation.

---

# 🗄️ Database Design

## Users

```text
users
--------------------------------
id
name
email
password_hash
created_at
updated_at
```

---

## Anonymous Sessions

```text
anonymous_sessions
--------------------------------
id
session_token (unique, opaque)
ip_hash
created_at
expires_at
```

`ip_hash` (not raw IP) is used for rate-limit lookups without storing raw addresses long-term.

---

## Share Sessions

`sender_id` / `receiver_id` are nullable — an anonymous participant is identified by `sender_session_id` / `receiver_session_id` instead. Exactly one of the pair (user id vs. session id) should be set per side; a `CHECK` constraint enforces this.

```text
share_sessions
--------------------------------
id
share_code
sender_id            (nullable, FK -> users)
sender_session_id    (nullable, FK -> anonymous_sessions)
receiver_id          (nullable, FK -> users)
receiver_session_id  (nullable, FK -> anonymous_sessions)
total_size_bytes
requires_auth         (boolean, computed at creation from total_size_bytes)
status
expires_at
created_at
```

`receiver_id`/`receiver_session_id` start NULL and are only filled once someone actually joins via code/QR/link — a share is not tied to one predetermined receiver ahead of time, so anyone with a valid, unexpired code/link can join (first to join claims the receiver slot; the schema and API should reject a second joiner once `status` moves past `pending`).

---

## Files

```text
files
--------------------------------
id
share_session_id
filename
size
mime_type
sha256
created_at
```

---

## Transfers

`sender_id`/`receiver_id` follow the same nullable-pair pattern as `share_sessions`, since a transfer can belong to an anonymous share.

```text
transfers
--------------------------------
id
file_id
sender_id           (nullable, FK -> users)
sender_session_id   (nullable, FK -> anonymous_sessions)
receiver_id         (nullable, FK -> users)
receiver_session_id (nullable, FK -> anonymous_sessions)
status
started_at
completed_at
```

Transfer history queries (`GET /api/transfers`) only ever join against `users` — anonymous transfers are excluded by definition, which is the intended incentive to register.

---

# 📁 Project Structure

The three surfaces (`client`, `mobile`, `server`) share a wire format — share/transfer payloads, socket event names, control-message shapes. Keeping `types/user.ts`, `file.ts`, `transfer.ts` duplicated in each package guarantees drift as the protocol evolves, so they live in one shared workspace package instead.

```text
p2p-file-share/                    (pnpm/Turborepo workspace)
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   │   ├── user.ts
│       │   │   ├── file.ts
│       │   │   └── transfer.ts
│       │   ├── socket-events.ts     (shared event name constants)
│       │   └── wire-protocol.ts     (control-message schemas, chunk framing)
│       └── package.json
│
├── client/
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUploader.tsx
│   │   │   ├── FileTransfer.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── QRCode.tsx
│   │   │   └── PeerStatus.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Send.tsx
│   │   │   ├── Receive.tsx
│   │   │   ├── Transfer.tsx
│   │   │   └── History.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts
│   │   │   └── useFileTransfer.ts
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── socket.ts
│   │   │   └── webrtc.ts
│   │   │
│   │   └── App.tsx
│   │
│   └── package.json
│
├── mobile/
│   │
│   ├── app/
│   ├── components/
│   ├── screens/
│   ├── services/
│   ├── hooks/
│   └── package.json
│
├── server/
│   │
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── shares/
│   │   ├── transfers/
│   │   ├── signaling/
│   │   ├── middleware/
│   │   ├── database/
│   │   ├── websocket/
│   │   └── server.ts
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   └── package.json
│
├── infrastructure/
│   │
│   ├── nginx/
│   ├── coturn/
│   └── docker-compose.yml
│
├── docs/
│   ├── architecture.md
│   ├── webrtc.md
│   ├── api.md
│   └── deployment.md
│
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

# 💻 Prerequisites

Install:

```text
Node.js 20+
npm
Git
Docker
Docker Compose
PostgreSQL
Redis
```

For Android development:

```text
Android Studio
Android SDK
Java/JDK
Expo CLI / Expo tooling
```

For production WebRTC:

```text
STUN server
TURN server
coturn
HTTPS
```

---

# 📥 Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/p2p-file-share.git
cd p2p-file-share
```

---

# 📦 Install Web Dependencies

```bash
cd client
npm install
```

---

# 📱 Install Mobile Dependencies

```bash
cd mobile
npm install
```

---

# ⚙️ Install Backend Dependencies

```bash
cd server
npm install
```

---

# 🔐 Environment Variables

Create:

```text
server/.env
```

Example:

```env
NODE_ENV=development

PORT=5000

DATABASE_URL=postgresql://postgres:password@localhost:5432/p2p_share

REDIS_URL=redis://localhost:6379

JWT_SECRET=replace_with_secure_secret

CLIENT_URL=http://localhost:5173

STUN_SERVER=stun:stun.example.com

TURN_SERVER=turn:turn.example.com
TURN_SECRET=replace_with_coturn_shared_secret

MAX_ANONYMOUS_FILE_SIZE_MB=500
ANONYMOUS_SESSION_TTL_HOURS=4
```

`TURN_SECRET` is a shared secret used to mint short-lived, per-session TURN credentials (see [Security](#-security-architecture)) rather than a single static `TURN_USERNAME`/`TURN_PASSWORD` pair handed to every client.

For the web client:

```text
client/.env
```

Example:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

For Android:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:5000
EXPO_PUBLIC_SOCKET_URL=http://YOUR_LOCAL_IP:5000
```

Do not commit secrets to Git.

---

# 🗄️ Database Setup

Create the database:

```bash
createdb p2p_share
```

Configure:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/p2p_share
```

Run Prisma migrations:

```bash
npx prisma migrate dev
```

Generate Prisma Client:

```bash
npx prisma generate
```

Optional:

```bash
npx prisma studio
```

---

# 🚀 Running the Backend

```bash
cd server
npm run dev
```

Expected:

```text
Server running on port 5000
Socket.IO initialized
Database connected
Redis connected
```

---

# 🌐 Running the Web Application

```bash
cd client
npm run dev
```

Open:

```text
http://localhost:5173
```

---

# 📱 Running Android

Start Expo:

```bash
cd mobile
npx expo start
```

Then:

```text
Android Emulator
      OR
Physical Android Device
```

For physical devices, make sure the phone can reach the backend running on your development machine.

Do not use `localhost` from the Android device to refer to your computer's backend.

Use the computer's LAN IP, for example:

```text
192.168.1.10
```

---

# 🔄 Complete WebRTC Connection Flow

The connection process is:

```text
User A
  │
  │ Login
  ▼
Backend
  │
  │ Create Share
  ▼
Share ID
  │
  ▼
Generate QR
  │
  ▼
User B scans QR
  │
  ▼
Join Share
  │
  ▼
Socket.IO Room
  │
  ▼
SDP Offer
  │
  ▼
SDP Answer
  │
  ▼
ICE Candidates
  │
  ▼
STUN / TURN
  │
  ▼
WebRTC Connection
  │
  ▼
RTCDataChannel
  │
  ├── File
  └── Chat
```

---

# 📤 File Transfer Flow

```text
Select File
      ↓
Read Metadata
      ↓
Create Transfer
      ↓
Receiver Accepts
      ↓
WebRTC Connection
      ↓
Open DataChannel
      ↓
Calculate File Hash
      ↓
Split Into Chunks
      ↓
Send Chunks
      ↓
Track Progress
      ↓
Receiver Reassembles
      ↓
Calculate Receiver Hash
      ↓
Compare Hashes
      ↓
Transfer Complete
```

---

# 📷 QR Code Sharing Flow

```text
Sender
   │
   ▼
Select File
   │
   ▼
Create Share
   │
   ▼
Generate Share Code
   │
   ▼
Generate QR
   │
   ▼
Receiver Scans
   │
   ▼
Open Share
   │
   ▼
Authenticate
   │
   ▼
Accept Transfer
   │
   ▼
WebRTC
```

---

# 🔌 API Design

## Authentication

### Register

```http
POST /api/auth/register
```

Request:

```json
{
  "name": "Parth",
  "email": "parth@example.com",
  "password": "password"
}
```

---

### Login

```http
POST /api/auth/login
```

Response:

```json
{
  "accessToken": "JWT_TOKEN",
  "user": {
    "id": "123",
    "name": "Parth",
    "email": "parth@example.com"
  }
}
```

---

# Share API

### Create Anonymous Session

```http
POST /api/anonymous-sessions
```

Response:

```json
{
  "sessionToken": "anon_9f8a2...",
  "expiresAt": "2026-09-29T20:00:00Z"
}
```

Called once per device before the first share/join, when no JWT is present. `sessionToken` is then sent as `X-Session-Token` on subsequent requests instead of `Authorization`.

---

### Create Share

```http
POST /api/shares
```

Auth: `Authorization: Bearer <JWT>` **or** `X-Session-Token: <sessionToken>` — either is accepted, but which one is required depends on `total_size_bytes`.

Request:

```json
{
  "files": [
    {
      "name": "project.zip",
      "size": 890000000,
      "mimeType": "application/zip"
    }
  ]
}
```

Response (size ≤ `MAX_ANONYMOUS_FILE_SIZE_MB`):

```json
{
  "shareId": "share_123",
  "shareCode": "7F8K2P",
  "expiresAt": "2026-09-29T18:00:00Z",
  "requiresAuth": false
}
```

Response when only a session token was supplied and the total exceeds the anonymous limit:

```http
401 Unauthorized
```

```json
{
  "error": "LOGIN_REQUIRED",
  "message": "Files over 500 MB require an account.",
  "maxAnonymousSizeMb": 500
}
```

The client should catch `LOGIN_REQUIRED` and route the user to register/login, then retry the same request with a JWT.

---

### Get Share

```http
GET /api/shares/:shareCode
```

---

### Join Share

```http
POST /api/shares/:shareCode/join
```

Auth: `Authorization: Bearer <JWT>` **or** `X-Session-Token: <sessionToken>`. A receiver never needs an account to join a ≤ 500 MB share, regardless of whether the sender is logged in — the 500 MB check only applies to the declared file size, not to either participant's auth state.

---

### Accept Transfer

```http
POST /api/transfers/:id/accept
```

---

### Cancel Transfer

```http
POST /api/transfers/:id/cancel
```

---

# 🔌 Socket Events

## Client → Server

```text
join-room
offer
answer
ice-candidate
transfer-request
transfer-accepted
transfer-rejected
transfer-cancelled
```

---

## Server → Client

```text
peer-joined
peer-left
offer
answer
ice-candidate
transfer-started
transfer-completed
transfer-failed
```

---

# 🔐 Security Architecture

Security is a core requirement.

The application should implement:

```text
HTTPS
   ↓
JWT Authentication
   ↓
Authorization
   ↓
Secure Signaling
   ↓
WebRTC Encrypted Transport
   ↓
File Integrity Verification
```

---

# 🛡️ Security Requirements

## Authentication

Use secure password hashing.

Never store:

```text
password
```

Store:

```text
password_hash
```

---

## JWT

Use:

```text
short-lived access tokens
```

and an appropriate refresh-token strategy if persistent sessions are required.

---

## Share Expiration

Every share should expire.

Example:

```text
Share created
      ↓
15-minute expiration
      ↓
Automatically disabled
```

---

## Authorization

A user should only be able to:

- Access their own transfers
- Join valid shares
- Accept transfers they are authorized to accept
- View permitted history

---

## Share Code Brute-Forcing

A 6-character alphanumeric share code has a large but not infinite keyspace, and anonymous joins mean there's no account-level throttle to fall back on. Explicit limits are required, keyed by `ip_hash` (and `X-Session-Token` where present):

```text
Max join attempts per IP per minute:      10
Max join attempts per share code total:   20 (then the share auto-invalidates)
Max shares created per IP per hour:       20 (anonymous), higher for authenticated users
```

Exceeding a limit returns `429 Too Many Requests`, and a share that hits its total-attempt cap should be marked `status = revoked` rather than silently continuing to accept guesses.

---

# 📦 File Restrictions

Implement configurable limits:

```text
Maximum file size
Maximum number of files
Maximum total transfer size
Allowed MIME types
```

Example configuration:

```env
MAX_FILE_SIZE_MB=1024
MAX_ANONYMOUS_FILE_SIZE_MB=500
MAX_FILES_PER_TRANSFER=20
SHARE_EXPIRY_MINUTES=15
```

`MAX_FILE_SIZE_MB` is the hard ceiling for any share (authenticated or not); `MAX_ANONYMOUS_FILE_SIZE_MB` is the lower threshold above which the backend requires a JWT instead of an anonymous session token (see [Authentication](#-authentication)). These are example values and should be adjusted to the deployment's requirements.

---

# 🧮 File Integrity

Use SHA-256.

Conceptually:

```text
Sender:

SHA256(original)
       ↓
ABC123


Receiver:

SHA256(received)
       ↓
ABC123
```

If:

```text
senderHash === receiverHash
```

then:

```text
Transfer verified
```

---

# 🚨 Error Handling

The application should handle:

```text
Peer disconnected
Network failure
TURN failure
WebRTC connection failure
Transfer cancelled
File corrupted
Share expired
Unauthorized access
File too large
Unsupported file
Browser compatibility issue
Android permission failure
```

Example:

```text
❌ Connection lost

The peer disconnected.
Retry connection
```

---

# 🧪 Testing

Testing should happen at multiple levels.

## Unit Testing

Test:

```text
Authentication
Share creation
File metadata
Hash generation
Chunk management
Progress calculations
```

---

## Integration Testing

Test:

```text
Frontend → Backend
Backend → Database
Backend → Redis
Socket.IO → WebRTC signaling
```

---

## WebRTC Testing

Manual matrix:

```text
Chrome → Chrome
Chrome → Firefox
Chrome → Android
Android → Android
```

Automate the core path with Playwright driving two browser contexts (sender + receiver) in CI, so regressions in signaling/DataChannel handling are caught before manual cross-network testing:

```text
Playwright: context A (sender) + context B (receiver)
      ↓
Both load the app, A creates a share, B joins via code
      ↓
Small fixture file sent over real WebRTC
      ↓
Assert: file received, hash matches, chat message round-trips
```

---

# 🌐 Network Testing

Test:

```text
Same Wi-Fi
Different Wi-Fi
Mobile hotspot
Corporate network
Restricted NAT
VPN
```

This is especially important because WebRTC connectivity depends on network conditions.

---

# 🐳 Docker

Example services:

```text
docker-compose
│
├── frontend
├── backend
├── postgres
├── redis
├── nginx
└── coturn
```

Start:

```bash
docker compose up -d
```

Check:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs -f backend
```

Stop:

```bash
docker compose down
```

---

# 🌍 Production Architecture

A production deployment can look like:

```text
                       INTERNET
                           │
                           ▼
                       Cloudflare
                           │
                           ▼
                         Nginx
                      /          \
                     /            \
                    ▼              ▼
              Web Frontend     Node Backend
                                   │
                     ┌─────────────┼─────────────┐
                     │             │             │
                     ▼             ▼             ▼
                 PostgreSQL      Redis        Socket.IO
                                                 │
                                                 ▼
                                           WebRTC Signaling
                                                 │
                                         ┌───────┴───────┐
                                         │               │
                                        STUN            TURN
                                         │               │
                                         └───────┬───────┘
                                                 │
                                             P2P Network
```

---

# 🔒 HTTPS Requirement

Production WebRTC applications should use secure contexts.

Use:

```text
https://
```

and:

```text
wss://
```

for secure WebSocket connections.

Development can use localhost, but production should be properly configured with TLS.

---

# 📊 Monitoring

Monitor:

```text
API latency
WebSocket connections
Active rooms
WebRTC connection success rate
Transfer success rate
Transfer failures
TURN usage
Bandwidth
Redis health
Database health
CPU
Memory
```

Useful metrics:

```text
Total transfers
Successful transfers
Failed transfers
Average transfer speed
Average transfer duration
TURN relay percentage
Active peers
```

---

# 📝 Logging

The backend should log:

```text
User authentication events
Share creation
Share expiration
Peer connection
Transfer start
Transfer completion
Transfer failure
WebRTC signaling errors
TURN failures
```

Never log:

```text
Passwords
JWT secrets
TURN credentials
Sensitive file contents
```

---

# 🛣️ Development Roadmap

The project should be developed as **vertical slices** — a thin end-to-end path working before adding breadth — rather than finishing each layer (all UI, then all backend) before the next. Building all 8 screens before any backend exists means reworking them once real data shapes and the anonymous/auth split land.

## Phase 1 — Walking Skeleton

Get one path working end-to-end before anything else, to validate the stack wiring:

```text
Minimal Express server
Minimal React page
Anonymous session endpoint (POST /api/anonymous-sessions)
One health-check round trip: client → API → response
```

---

## Phase 2 — Backend Foundations

Implement:

```text
Express
PostgreSQL
Prisma
Redis
Anonymous session model + rate limiting
```

---

## Phase 3 — Authentication

Implement:

```text
Register
Login
JWT
Protected routes
Logout
Anonymous-vs-authenticated request handling (X-Session-Token vs Authorization)
```

---

## Phase 4 — Share Sessions

Implement:

```text
Create share
Join share
Share code
Share expiration
QR code
500 MB anonymous/auth threshold enforcement (server-side)
```

---

## Phase 5 — Signaling

Implement:

```text
Socket.IO
Rooms
Offer
Answer
ICE candidates
```

---

## Phase 6 — WebRTC

First make:

```text
Web → Web
```

work.

Start with:

```text
"Hello World"
```

over an RTCDataChannel.

---

## Phase 7 — File Transfer

Implement:

```text
Control-channel / file-channel wire protocol
Chunk framing (fileId + chunkIndex header)
Small text file
Image
PDF
ZIP
Large file (streamed to disk, not buffered in memory)
```

---

## Phase 8 — Progress

Add:

```text
Percentage
Speed
ETA
Bytes sent
Bytes received
```

---

## Phase 9 — Chat

Add:

```text
Chat DataChannel
```

---

## Phase 10 — Android

Implement:

```text
Android → Web
Web → Android
Android → Android
```

---

## Phase 11 — STUN/TURN

Configure:

```text
STUN
TURN
coturn
```

Test across different networks.

---

## Phase 12 — Security

Implement:

```text
HTTPS
JWT
Authorization
Rate limiting (share creation, join attempts)
Short-lived TURN credentials
Share expiration
File limits
Hash verification
Secure signaling
```

---

## Phase 13 — CI/CD

Implement:

```text
Lint + typecheck on PR
Unit + integration tests on PR
Automated two-browser-context WebRTC smoke test (Playwright)
Build + push Docker images
Deploy on merge to main
```

---

# 🚀 Future Features

Potential future features include:

## 1. Resume Transfers

If a transfer fails at:

```text
75%
```

resume from:

```text
75%
```

instead of restarting.

---

## 2. Multiple Files

Allow:

```text
10 files
100 files
Entire folder
```

where platform capabilities permit.

---

## 3. Folder Transfer

Example:

```text
Project/
├── src/
├── public/
├── package.json
└── README.md
```

---

## 4. Device Discovery

Discover devices on the local network.

---

## 5. Nearby Sharing Mode

A simplified experience:

```text
Nearby devices
│
├── Parth's Laptop
├── Gopala's Phone
└── Office PC
```

---

## 6. Transfer History

```text
Recent Transfers

project.zip       850 MB    Completed
photos.zip        250 MB    Completed
report.pdf         12 MB    Failed
```

---

## 7. Notifications

Android notifications:

```text
Transfer started
Transfer 50%
Transfer complete
Transfer failed
```

---

## 8. Desktop Application

Potential future support:

```text
Windows
macOS
Linux
```

using an appropriate desktop framework.

---

## 9. End-to-End Application-Level Encryption

WebRTC already provides encrypted transport, but the application can additionally explore end-to-end encryption at the application layer where appropriate.

A future design could use:

```text
File
 ↓
Encrypt
 ↓
Chunk
 ↓
WebRTC
 ↓
Receiver
 ↓
Reassemble
 ↓
Decrypt
```

This should be designed carefully so that keys are never unnecessarily exposed to the signaling/backend infrastructure.

---

# 🧠 Learning Objectives

This project is useful for learning:

### Frontend

```text
React
TypeScript
Tailwind
State management
File APIs
Drag & drop
```

### Backend

```text
Node.js
Express
REST APIs
JWT
PostgreSQL
Prisma
Redis
Socket.IO
```

### Networking

```text
WebRTC
SDP
ICE
STUN
TURN
NAT
DataChannels
WebSockets
```

### Security

```text
Authentication
Authorization
TLS
Hashing
File integrity
Rate limiting
Secure sessions
```

### DevOps

```text
Docker
Nginx
HTTPS
coturn
Logging
Monitoring
CI/CD
```

---

# 📚 Important Concepts to Learn

Before implementing the complete project, understand these concepts in order:

```text
1. HTTP
2. WebSockets
3. Socket.IO
4. NAT
5. STUN
6. TURN
7. WebRTC
8. RTCPeerConnection
9. SDP
10. ICE
11. RTCDataChannel
12. Chunked file transfer
13. Backpressure
14. SHA-256
15. JWT
16. PostgreSQL
17. Redis
18. Docker
19. Nginx
20. HTTPS
```

---

# 🔄 Complete Product Flow

The complete application flow is:

```text
                         USER A
                           │
                           ▼
                      Login/Register
                           │
                           ▼
                       Dashboard
                           │
                           ▼
                       Select File
                           │
                           ▼
                     Create Share
                           │
                           ▼
                  QR Code / Share Code
                           │
                           ▼
                    ┌───────────────┐
                    │    USER B     │
                    │               │
                    │ Scan QR       │
                    │      OR       │
                    │ Enter Code    │
                    └───────┬───────┘
                            │
                            ▼
                       Join Share
                            │
                            ▼
                     Authentication
                            │
                            ▼
                       Signaling
                            │
                  ┌─────────┴─────────┐
                  │                   │
                  ▼                   ▼
               SDP Offer          SDP Answer
                  │                   │
                  └─────────┬─────────┘
                            │
                      ICE Candidates
                            │
                       STUN / TURN
                            │
                            ▼
                     WebRTC Connected
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
             File Channel          Chat Channel
                │                       │
                ▼                       ▼
          File Chunks                Messages
                │
                ▼
           Reassemble
                │
                ▼
          SHA-256 Verify
                │
                ▼
         Transfer Complete
```

---

# 🎯 MVP Definition

The first MVP should **not** contain every feature.

Build this first:

```text
MVP
│
├── React Web App
├── Node.js Backend
├── Socket.IO
├── WebRTC
├── Anonymous session (login-free path)
├── Web → Web transfer (≤ 500 MB, no login)
├── Wire protocol (control + binary framing)
├── File chunking + streamed disk write
├── Progress indicator
├── Share code
├── JWT auth (only reached when a share exceeds 500 MB)
└── Basic transfer history (authenticated users only)
```

Once this works reliably:

```text
MVP
 ↓
QR Code
 ↓
Chat
 ↓
Android
 ↓
STUN
 ↓
TURN
 ↓
Security hardening
 ↓
Production deployment
```

---

# ⭐ Final Architecture Summary

```text
                    P2P FILE SHARING
                           │
          ┌────────────────┴────────────────┐
          │                                 │
        WEB                              ANDROID
      React/TS                         React Native
          │                                 │
          └──────────────┬──────────────────┘
                         │
                    REST + WSS
                         │
                         ▼
                  ┌─────────────┐
                  │   Node.js   │
                  │             │
                  │ Auth        │
                  │ API         │
                  │ Signaling   │
                  └──────┬──────┘
                         │
                  ┌──────┴──────┐
                  ▼             ▼
              PostgreSQL      Redis
                         │
                         ▼
                  WebRTC Layer
                         │
                  ┌──────┴──────┐
                  ▼             ▼
                 STUN          TURN
                  │             │
                  └──────┬──────┘
                         │
                         ▼
                    P2P CHANNEL
                         │
                ┌────────┴────────┐
                ▼                 ▼
             FILES              CHAT
```

---

# 🤝 Open Source Contribution

Contributions are welcome.

Potential contribution areas:

```text
WebRTC optimization
Android support
iOS support
Desktop support
Security improvements
File transfer reliability
TURN optimization
UI/UX
Accessibility
Testing
Documentation
Monitoring
```

## Contribution workflow

```bash
git clone <repository>
cd p2p-file-share

git checkout -b feature/my-feature

git add .
git commit -m "feat: add my feature"

git push origin feature/my-feature
```

Then create a Pull Request.

---

# 🐛 Reporting Issues

When reporting an issue, include:

```text
Operating system
Browser / Android version
Application version
Network type
File size
File type
Steps to reproduce
Error message
Relevant logs
```

For WebRTC problems, also include whether the issue occurs on:

```text
Same network
Different Wi-Fi
Mobile hotspot
VPN
Corporate network
```

---

# 📜 License

Choose an appropriate open-source license before publishing the repository.

For example:

```text
MIT License
```

or another license that matches the project's intended use.

---

# 🚀 Project Vision

The long-term goal is to create a simple, cross-platform file-sharing experience where users don't need to understand networking.

The user experience should remain:

```text
Select
   ↓
Share
   ↓
Scan
   ↓
Connect
   ↓
Transfer
   ↓
Done
```

while the underlying system handles:

```text
Authentication
      ↓
Signaling
      ↓
SDP
      ↓
ICE
      ↓
STUN/TURN
      ↓
WebRTC
      ↓
Chunking
      ↓
Backpressure
      ↓
Integrity Verification
      ↓
Transfer Completion
```

**The user sees a simple file-sharing application.  
The system underneath is a complete real-time P2P networking platform.**