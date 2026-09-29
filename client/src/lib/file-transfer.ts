import { CHUNK_SIZE, frameChunk, type ControlMessage } from "@p2p/shared";
import { Sha256Stream } from "./sha256-stream";

const BUFFER_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MB

function waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
    channel.addEventListener("bufferedamountlow", () => resolve(), { once: true });
  });
}

export interface SendFileCallbacks {
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  onComplete?: (sha256: string) => void;
  onRejected?: (reason?: string) => void;
}

export async function sendFile(
  file: File,
  controlChannel: RTCDataChannel,
  fileChannel: RTCDataChannel,
  waitForAccept: (fileId: string) => Promise<{ accepted: boolean; reason?: string }>,
  callbacks: SendFileCallbacks = {},
): Promise<void> {
  const fileId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  const startMessage: ControlMessage = {
    type: "file-start",
    fileId,
    name: file.name,
    size: file.size,
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
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBuffer = await file.slice(start, end).arrayBuffer();

    hasher.update(new Uint8Array(chunkBuffer));

    if (fileChannel.bufferedAmount > BUFFER_LOW_THRESHOLD) {
      await waitForBufferedAmountLow(fileChannel);
    }
    fileChannel.send(frameChunk(fileId, chunkIndex, chunkBuffer));

    sentBytes = end;
    callbacks.onProgress?.(sentBytes, file.size);
  }

  const sha256 = hasher.digestHex();
  const completeMessage: ControlMessage = { type: "file-complete", fileId, sha256 };
  controlChannel.send(JSON.stringify(completeMessage));
  callbacks.onComplete?.(sha256);
}

// -- Receiving ----------------------------------------------------------------

interface FileSystemWritable {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

type FileWriter =
  | { kind: "fsa"; writable: FileSystemWritable }
  | { kind: "memory"; chunks: Uint8Array[] };

export interface IncomingFile {
  fileId: string;
  name: string;
  size: number;
  totalChunks: number;
}

interface ActiveReceive {
  meta: IncomingFile;
  writer: FileWriter;
  hasher: Sha256Stream;
  receivedChunks: number;
  receivedBytes: number;
}

export type SupportsFileSystemAccess = typeof window & {
  showSaveFilePicker: (options?: { suggestedName?: string }) => Promise<{
    createWritable(): Promise<FileSystemWritable>;
  }>;
};

export function hasFileSystemAccess(): boolean {
  return "showSaveFilePicker" in window;
}

/** Must be called from within a user-gesture handler (e.g. an onClick). */
export async function createFileWriter(suggestedName: string): Promise<FileWriter> {
  if (hasFileSystemAccess()) {
    const handle = await (window as SupportsFileSystemAccess).showSaveFilePicker({ suggestedName });
    const writable = await handle.createWritable();
    return { kind: "fsa", writable };
  }
  return { kind: "memory", chunks: [] };
}

export class FileReceiver {
  private active = new Map<string, ActiveReceive>();

  begin(meta: IncomingFile, writer: FileWriter): void {
    this.active.set(meta.fileId, { meta, writer, hasher: new Sha256Stream(), receivedChunks: 0, receivedBytes: 0 });
  }

  async writeChunk(
    fileId: string,
    data: ArrayBuffer,
  ): Promise<{ receivedChunks: number; totalChunks: number; receivedBytes: number; totalBytes: number } | null> {
    const entry = this.active.get(fileId);
    if (!entry) return null;

    const bytes = new Uint8Array(data);
    entry.hasher.update(bytes);

    if (entry.writer.kind === "fsa") {
      await entry.writer.writable.write(bytes);
    } else {
      entry.writer.chunks.push(bytes);
    }

    entry.receivedChunks += 1;
    entry.receivedBytes += bytes.length;
    return {
      receivedChunks: entry.receivedChunks,
      totalChunks: entry.meta.totalChunks,
      receivedBytes: entry.receivedBytes,
      totalBytes: entry.meta.size,
    };
  }

  /**
   * The "file-complete" control message travels on a separate DataChannel
   * from the binary chunks and can arrive before the last chunks do (WebRTC
   * gives no ordering guarantee across channels). Callers must check this
   * before finalizing.
   */
  hasAllChunks(fileId: string): boolean {
    const entry = this.active.get(fileId);
    return entry !== undefined && entry.receivedChunks >= entry.meta.totalChunks;
  }

  /** Finalizes the write, returning the computed hash and, for the in-memory
   * fallback, a Blob the caller can offer as a download. */
  async finish(fileId: string): Promise<{ sha256: string; blob?: Blob; meta: IncomingFile } | null> {
    const entry = this.active.get(fileId);
    if (!entry) return null;
    this.active.delete(fileId);

    const sha256 = entry.hasher.digestHex();

    if (entry.writer.kind === "fsa") {
      await entry.writer.writable.close();
      return { sha256, meta: entry.meta };
    }

    const blob = new Blob(entry.writer.chunks as BlobPart[]);
    return { sha256, blob, meta: entry.meta };
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
