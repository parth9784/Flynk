import { File, Paths } from "expo-file-system";
import { CHUNK_SIZE, Sha256Stream, frameChunk, type ControlMessage } from "@p2p/shared";
import type { MinimalDataChannel } from "../services/webrtc-types";
import type { PickedFile } from "./file-types";

const BUFFER_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MB

function waitForBufferedAmountLow(channel: MinimalDataChannel): Promise<void> {
  return new Promise((resolve) => {
    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
    channel.addEventListener("bufferedamountlow", () => resolve());
  });
}

export interface SendFileCallbacks {
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  onComplete?: (sha256: string) => void;
  onRejected?: (reason?: string) => void;
}

export async function sendFile(
  file: PickedFile,
  controlChannel: MinimalDataChannel,
  fileChannel: MinimalDataChannel,
  waitForAccept: (fileId: string) => Promise<{ accepted: boolean; reason?: string }>,
  callbacks: SendFileCallbacks = {},
): Promise<void> {
  const fileId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const totalSize = file.size ?? 0;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  const startMessage: ControlMessage = {
    type: "file-start",
    fileId,
    name: file.name,
    size: totalSize,
    totalChunks,
  };
  controlChannel.send(JSON.stringify(startMessage));

  const { accepted, reason } = await waitForAccept(fileId);
  if (!accepted) {
    callbacks.onRejected?.(reason);
    return;
  }

  const hasher = new Sha256Stream();
  let sentBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunkBuffer = await file.slice(start, end).arrayBuffer();

    hasher.update(new Uint8Array(chunkBuffer));

    if (fileChannel.bufferedAmount > BUFFER_LOW_THRESHOLD) {
      await waitForBufferedAmountLow(fileChannel);
    }
    fileChannel.send(frameChunk(fileId, chunkIndex, chunkBuffer));

    sentBytes = end;
    callbacks.onProgress?.(sentBytes, totalSize);
  }

  const sha256 = hasher.digestHex();
  const completeMessage: ControlMessage = { type: "file-complete", fileId, sha256 };
  controlChannel.send(JSON.stringify(completeMessage));
  callbacks.onComplete?.(sha256);
}

// -- Receiving ------------------------------------------------------------

export interface IncomingFile {
  fileId: string;
  name: string;
  size: number;
  totalChunks: number;
}

interface ActiveReceive {
  meta: IncomingFile;
  destination: File;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  hasher: Sha256Stream;
  receivedChunks: number;
  receivedBytes: number;
}

export class FileReceiver {
  private active = new Map<string, ActiveReceive>();

  /** Saves into the app's document directory — there is no OS save-location
   * picker equivalent to the web File System Access API on this platform. */
  async begin(meta: IncomingFile): Promise<void> {
    const destination = new File(Paths.document, meta.name);
    const writer = destination.writableStream().getWriter();
    this.active.set(meta.fileId, { meta, destination, writer, hasher: new Sha256Stream(), receivedChunks: 0, receivedBytes: 0 });
  }

  hasAllChunks(fileId: string): boolean {
    const entry = this.active.get(fileId);
    return entry !== undefined && entry.receivedChunks >= entry.meta.totalChunks;
  }

  async writeChunk(
    fileId: string,
    data: ArrayBuffer,
  ): Promise<{ receivedChunks: number; totalChunks: number; receivedBytes: number; totalBytes: number } | null> {
    const entry = this.active.get(fileId);
    if (!entry) return null;

    const bytes = new Uint8Array(data);
    entry.hasher.update(bytes);
    await entry.writer.write(bytes);

    entry.receivedChunks += 1;
    entry.receivedBytes += bytes.length;
    return {
      receivedChunks: entry.receivedChunks,
      totalChunks: entry.meta.totalChunks,
      receivedBytes: entry.receivedBytes,
      totalBytes: entry.meta.size,
    };
  }

  async finish(fileId: string): Promise<{ sha256: string; savedInfo: string } | null> {
    const entry = this.active.get(fileId);
    if (!entry) return null;
    this.active.delete(fileId);

    await entry.writer.close();
    return { sha256: entry.hasher.digestHex(), savedInfo: `saved to ${entry.destination.uri}` };
  }
}
