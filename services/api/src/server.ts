import path from "node:path";
import { config } from "dotenv";

// `npm run dev -w @llz-clipper/api` runs this script with cwd set to
// services/api, not the repo root, so the default cwd-relative `.env`
// lookup silently misses the root `.env` — resolve it explicitly instead.
config({ path: path.resolve(__dirname, "../../../.env") });

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
