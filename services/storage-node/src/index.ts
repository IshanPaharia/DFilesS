import { readIntEnv } from "@dfs/shared";
import { createStorageServer, loadStorageConfig, registerWithMetadata } from "./server.js";

const config = loadStorageConfig();
const port = readIntEnv("PORT", 7001);
const host = process.env.HOST ?? "0.0.0.0";
const { server, store } = createStorageServer(config);
let registrationTimer: NodeJS.Timeout | undefined;
let registered = false;

await store.init();
await server.listen({ port, host });

async function tryRegisterWithMetadata() {
  if (registered) {
    return;
  }

  try {
    await registerWithMetadata(config);
    registered = true;
    if (registrationTimer) {
      clearInterval(registrationTimer);
    }
    server.log.info({ nodeId: config.nodeId }, "registered with metadata service");
  } catch (error) {
    server.log.warn({ error }, "metadata registration failed; retrying");
  }
}

await tryRegisterWithMetadata();
registrationTimer = setInterval(() => {
  tryRegisterWithMetadata().catch((error) => server.log.warn({ error }, "metadata registration retry failed"));
}, 5_000);

async function shutdown() {
  if (registrationTimer) {
    clearInterval(registrationTimer);
  }
  await server.close();
}

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});