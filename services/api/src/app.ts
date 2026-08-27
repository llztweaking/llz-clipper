import Fastify, { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerStreamerRoutes } from "./routes/streamers.routes";
import { authenticate } from "./middleware/authenticate";
import { requireAdmin } from "./middleware/requireAdmin";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

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

  return app;
}
