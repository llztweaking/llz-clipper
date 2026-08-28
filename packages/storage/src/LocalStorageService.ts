import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import type { CopyProgress, StorageService } from "./types";

export class LocalStorageService implements StorageService {
  private root: string;

  constructor(root: string = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage")) {
    this.root = root;
  }

  private get vodsDir(): string {
    return path.join(this.root, "vods");
  }

  private get thumbnailsDir(): string {
    return path.join(this.root, "thumbnails");
  }

  private getVodPath(vodId: string, extension: string): string {
    return path.join(this.vodsDir, `${vodId}${extension}`);
  }

  getThumbnailPath(vodId: string): string {
    return path.join(this.thumbnailsDir, `${vodId}.jpg`);
  }

  async copyIntoStorage(
    sourcePath: string,
    vodId: string,
    extension: string,
    onProgress?: (progress: CopyProgress) => void
  ): Promise<string> {
    await mkdir(this.vodsDir, { recursive: true });
    await mkdir(this.thumbnailsDir, { recursive: true });

    const destPath = this.getVodPath(vodId, extension);
    const { size: totalBytes } = await stat(sourcePath);

    await new Promise<void>((resolve, reject) => {
      let bytesCopied = 0;
      const readStream = createReadStream(sourcePath);
      const writeStream = createWriteStream(destPath);

      readStream.on("data", (chunk: Buffer) => {
        bytesCopied += chunk.length;
        onProgress?.({ bytesCopied, totalBytes });
      });

      readStream.on("error", reject);
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);

      readStream.pipe(writeStream);
    });

    return destPath;
  }

  async deleteVod(vodId: string, extension: string): Promise<void> {
    const vodPath = this.getVodPath(vodId, extension);
    const thumbPath = this.getThumbnailPath(vodId);
    await unlink(vodPath).catch(() => {});
    await unlink(thumbPath).catch(() => {});
  }
}
