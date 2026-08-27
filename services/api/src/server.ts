import "dotenv/config";
import { buildApp } from "./app";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`LLZ CLIPPER API rodando na porta ${port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
