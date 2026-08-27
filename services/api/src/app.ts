import Fastify, { FastifyInstance } from "fastify";
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
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  app.register(
    async (adminScope) => {
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
