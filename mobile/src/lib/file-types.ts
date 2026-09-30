/** Structural type both the browser's native File and expo-file-system's
 * File class satisfy, letting App.tsx stay platform-agnostic. */
export interface PickedFile {
  name: string;
  size: number | null;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}
