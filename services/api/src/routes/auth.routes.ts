import { FastifyInstance } from "fastify";
import { z } from "zod";
import { activateKey, LicenseError, getUserLicenseSummary } from "../services/licenseService";
import { login, refresh, logout, AuthError } from "../services/authService";
import { authenticate } from "../middleware/authenticate";

const activateKeySchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  hwid: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshOrLogoutSchema = z.object({ refreshToken: z.string().min(1) });

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/activate-key", async (request, reply) => {
    const parsed = activateKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const { user, tokens } = await activateKey(parsed.data);
      return reply.code(201).send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      if (err instanceof LicenseError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const result = await login(parsed.data.email, parsed.data.password);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/refresh", async (request, reply) => {
    const parsed = refreshOrLogoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    try {
      const result = await refresh(parsed.data.refreshToken);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/logout", async (request, reply) => {
    const parsed = refreshOrLogoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }
    await logout(parsed.data.refreshToken);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const license = await getUserLicenseSummary(request.authUser!.id);
    return reply.code(200).send({ user: request.authUser, license });
  });
}
