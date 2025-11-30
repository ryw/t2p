export interface ProcessedFileInfo {
  path: string;
  processedAt: string; // ISO timestamp
  modifiedAt: string; // ISO timestamp of file modification
  postsGenerated: number;
}

export interface T2pState {
  processedFiles: Record<string, ProcessedFileInfo>;
}
