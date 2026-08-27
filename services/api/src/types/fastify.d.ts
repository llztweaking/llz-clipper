import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      email: string;
      role: "USER" | "ADMIN";
    };
  }
}
