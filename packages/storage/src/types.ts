export interface CopyProgress {
  bytesCopied: number;
  totalBytes: number;
}

export interface StorageService {
  copyIntoStorage(
    sourcePath: string,
    vodId: string,
    extension: string,
    onProgress?: (progress: CopyProgress) => void
  ): Promise<string>;
  getThumbnailPath(vodId: string): string;
  deleteVod(vodId: string, extension: string): Promise<void>;
  prepareRenderOutput(clipId: string, renderId: string): Promise<string>;
  deleteRenderOutput(outputPath: string): Promise<void>;
}
