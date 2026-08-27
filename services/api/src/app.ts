import Fastify, { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./routes/auth.routes";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  return app;
}
