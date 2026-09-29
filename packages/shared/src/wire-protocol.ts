export type ControlMessage =
  | { type: "file-start"; fileId: string; name: string; size: number; totalChunks: number }
  | { type: "file-accept"; fileId: string }
  | { type: "file-reject"; fileId: string; reason?: string }
  | { type: "file-complete"; fileId: string; sha256: string }
  | { type: "file-error"; fileId: string; reason: string };

export const CHUNK_SIZE = 64 * 1024;

/**
 * Binary chunk frame: [fileIdLength:1][fileId bytes][chunkIndex:4 BE][chunk data].
 * Keeping chunks on their own binary DataChannel (separate from the JSON
 * control channel) means this header only needs to demux concurrent files,
 * not distinguish control vs. data messages.
 */
export function frameChunk(fileId: string, chunkIndex: number, chunkData: ArrayBuffer): ArrayBuffer {
  const fileIdBytes = new TextEncoder().encode(fileId);
  if (fileIdBytes.length > 255) {
    throw new Error("fileId too long to frame (max 255 bytes)");
  }

  const header = new Uint8Array(1 + fileIdBytes.length + 4);
  header[0] = fileIdBytes.length;
  header.set(fileIdBytes, 1);
  new DataView(header.buffer).setUint32(1 + fileIdBytes.length, chunkIndex, false);

  const frame = new Uint8Array(header.length + chunkData.byteLength);
  frame.set(header, 0);
  frame.set(new Uint8Array(chunkData), header.length);
  return frame.buffer;
}

export interface ParsedChunkFrame {
  fileId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

export function parseChunkFrame(buffer: ArrayBuffer): ParsedChunkFrame {
  const view = new DataView(buffer);
  const fileIdLength = view.getUint8(0);
  const fileIdBytes = new Uint8Array(buffer, 1, fileIdLength);
  const fileId = new TextDecoder().decode(fileIdBytes);
  const chunkIndex = view.getUint32(1 + fileIdLength, false);
  const dataStart = 1 + fileIdLength + 4;
  return { fileId, chunkIndex, data: buffer.slice(dataStart) };
}
