export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export interface TransferRate {
  percent: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export function computeTransferRate(bytesDone: number, totalBytes: number, startedAt: number): TransferRate {
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const speedBytesPerSecond = elapsedSeconds > 0 ? bytesDone / elapsedSeconds : 0;
  const remainingBytes = totalBytes - bytesDone;
  const etaSeconds = speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : Infinity;
  const percent = totalBytes > 0 ? (bytesDone / totalBytes) * 100 : 0;
  return { percent, speedBytesPerSecond, etaSeconds };
}
