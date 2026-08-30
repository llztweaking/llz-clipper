import path from "node:path";
import { config } from "dotenv";

// `npm run dev -w @llz-clipper/worker` runs this script with cwd set to
// services/worker, not the repo root, so the default cwd-relative `.env`
// lookup silently misses the root `.env` — resolve it explicitly instead.
config({ path: path.resolve(__dirname, "../../../.env") });

import { recoverStuckJobs, recoverStuckRenders } from "./recovery";
import { processNextJob } from "./jobProcessor";
import { processNextRender } from "./renderProcessor";

const POLL_INTERVAL_MS = 3000;
let stopped = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jobPollLoop(): Promise<void> {
  while (!stopped) {
    try {
      const processed = await processNextJob();
      if (!processed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("Erro no worker:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function renderPollLoop(): Promise<void> {
  while (!stopped) {
    try {
      const processed = await processNextRender();
      if (!processed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("Erro no worker de render:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function main(): Promise<void> {
  const recoveredJobs = await recoverStuckJobs();
  if (recoveredJobs > 0) {
    console.log(`${recoveredJobs} job(s) interrompido(s) marcado(s) como FAILED ao iniciar.`);
  }
  const recoveredRenders = await recoverStuckRenders();
  if (recoveredRenders > 0) {
    console.log(`${recoveredRenders} render(s) interrompido(s) marcado(s) como FAILED ao iniciar.`);
  }
  console.log("LLZ CLIPPER worker rodando, aguardando jobs...");
  await Promise.all([jobPollLoop(), renderPollLoop()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
