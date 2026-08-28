import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { recoverStuckJobs } from "../src/recovery";

beforeEach(async () => {
  await resetDatabase();
});

async function createVod() {
  const user = await prisma.user.create({ data: { email: `r-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x" } });
  const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
  return prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
}

describe("recoverStuckJobs", () => {
  it("marks non-terminal jobs (e.g. UPLOADING) as FAILED with a clear message", async () => {
    const vod = await createVod();
    const stuckJob = await prisma.job.create({ data: { vodId: vod.id, status: "UPLOADING", progress: 40 } });

    const count = await recoverStuckJobs();
    expect(count).toBe(1);

    const updated = await prisma.job.findUnique({ where: { id: stuckJob.id } });
    expect(updated?.status).toBe("FAILED");
    expect(updated?.error).toContain("Interrompido");
    expect(updated?.finishedAt).not.toBeNull();
  });

  it("leaves QUEUED, COMPLETED, and FAILED jobs untouched", async () => {
    const vod = await createVod();
    const queued = await prisma.job.create({ data: { vodId: vod.id, status: "QUEUED" } });
    const completed = await prisma.job.create({ data: { vodId: vod.id, status: "COMPLETED" } });
    const failed = await prisma.job.create({ data: { vodId: vod.id, status: "FAILED", error: "original error" } });

    const count = await recoverStuckJobs();
    expect(count).toBe(0);

    expect((await prisma.job.findUnique({ where: { id: queued.id } }))?.status).toBe("QUEUED");
    expect((await prisma.job.findUnique({ where: { id: completed.id } }))?.status).toBe("COMPLETED");
    const failedAfter = await prisma.job.findUnique({ where: { id: failed.id } });
    expect(failedAfter?.status).toBe("FAILED");
    expect(failedAfter?.error).toBe("original error");
  });
});
