import { FastifyInstance } from "fastify";
import type { VideoProcessor } from "@llz-clipper/ffmpeg";

export function registerSystemRoutes(app: FastifyInstance, videoProcessor: VideoProcessor): void {
  app.get("/ffmpeg-status", async (_request, reply) => {
    const status = await videoProcessor.getStatus();
    return reply.code(200).send(status);
  });
}
