import { prisma } from "@llz-clipper/database";
import type { StorageService } from "@llz-clipper/storage";
import path from "node:path";

export function serializeVod<T extends { sizeBytes: bigint | null }>(
  vod: T
): Omit<T, "sizeBytes"> & { sizeBytes: string | null } {
  return {
    ...vod,
    sizeBytes: vod.sizeBytes !== null ? vod.sizeBytes.toString() : null,
  };
}

export async function deleteVodAndFiles(storageService: StorageService, vodId: string): Promise<void> {
  const vod = await prisma.vOD.findUnique({ where: { id: vodId } });
  if (vod?.storagePath) {
    await storageService.deleteVod(vodId, path.extname(vod.storagePath));
  }
  await prisma.job.deleteMany({ where: { vodId } });
  await prisma.vOD.delete({ where: { id: vodId } });
}
