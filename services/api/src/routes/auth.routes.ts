import { FastifyInstance } from "fastify";
import { z } from "zod";
import { activateKey, LicenseError } from "../services/licenseService";

const activateKeySchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  hwid: z.string().min(1),
});

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
}
