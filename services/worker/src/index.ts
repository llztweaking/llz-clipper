import "dotenv/config";
import { recoverStuckJobs } from "./recovery";
import { processNextJob } from "./jobProcessor";

const POLL_INTERVAL_MS = 3000;
let stopped = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollLoop(): Promise<void> {
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

async function main(): Promise<void> {
  const recovered = await recoverStuckJobs();
  if (recovered > 0) {
    console.log(`${recovered} job(s) interrompido(s) marcado(s) como FAILED ao iniciar.`);
  }
  console.log("LLZ CLIPPER worker rodando, aguardando jobs...");
  await pollLoop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
