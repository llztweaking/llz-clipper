import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { LocalStorageService } from "@llz-clipper/storage";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerStreamerRoutes } from "./routes/streamers.routes";
import { registerVodRoutes } from "./routes/vods.routes";
import { registerClipRoutes } from "./routes/clips.routes";
import { registerEditPlanRoutes } from "./routes/editPlans.routes";
import { registerJobRoutes } from "./routes/jobs.routes";
import { registerSystemRoutes } from "./routes/system.routes";
import { authenticate } from "./middleware/authenticate";
import { requireAdmin } from "./middleware/requireAdmin";

// The only client is the LLZ CLIPPER desktop app's own Tauri webview — it is
// never loaded as a public web page, so there is no browser-based CSRF
// surface to defend against here. We reflect the request's Origin (the
// desktop app's dev server and its bundled `tauri.localhost` origin, plus
// localhost for tooling/tests) so the webview can talk to the local API in
// both `tauri dev` and the packaged build without maintaining an allowlist.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  const storageService = new LocalStorageService();
  const videoProcessor = new FFmpegProcessor();

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      await authScope.register(rateLimit, { max: 20, timeWindow: "1 minute" });
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  app.register(
    async (adminScope) => {
      await adminScope.register(rateLimit, { max: 30, timeWindow: "1 minute" });
      adminScope.addHook("preHandler", authenticate);
      adminScope.addHook("preHandler", requireAdmin);
      registerAdminRoutes(adminScope);
    },
    { prefix: "/admin" }
  );

  app.register(
    async (streamerScope) => {
      streamerScope.addHook("preHandler", authenticate);
      registerStreamerRoutes(streamerScope);
    },
    { prefix: "/streamers" }
  );

  app.register(
    async (vodScope) => {
      vodScope.addHook("preHandler", authenticate);
      registerVodRoutes(vodScope, storageService);
    },
    { prefix: "/vods" }
  );

  app.register(
    async (clipScope) => {
      clipScope.addHook("preHandler", authenticate);
      registerClipRoutes(clipScope);
      registerEditPlanRoutes(clipScope);
    },
    { prefix: "/" }
  );

  app.register(
    async (jobScope) => {
      jobScope.addHook("preHandler", authenticate);
      registerJobRoutes(jobScope);
    },
    { prefix: "/jobs" }
  );

  app.register(
    async (systemScope) => {
      systemScope.addHook("preHandler", authenticate);
      registerSystemRoutes(systemScope, videoProcessor);
    },
    { prefix: "/system" }
  );

  return app;
}
