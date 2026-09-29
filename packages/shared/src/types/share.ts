export interface FileMetadataInput {
  name: string;
  size: number;
  mimeType: string;
}

export interface CreateShareRequest {
  files: FileMetadataInput[];
}

export interface CreateShareResponse {
  shareId: string;
  shareCode: string;
  expiresAt: string;
  requiresAuth: boolean;
}

export interface ShareFile {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
}

export type ShareStatus = "pending" | "active" | "completed" | "expired" | "revoked";

export interface ShareDetails {
  shareId: string;
  shareCode: string;
  status: ShareStatus;
  files: ShareFile[];
  expiresAt: string;
}

export interface JoinShareResponse {
  shareId: string;
  status: ShareStatus;
}
