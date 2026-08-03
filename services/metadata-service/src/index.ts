import { MetadataDb } from "./db.js";
import { startHeartbeatLoop, startRepairLoop } from "./loops.js";
import { createMetadataServer, loadMetadataConfig } from "./server.js";

const config = loadMetadataConfig();
const db = new MetadataDb(config.databaseUrl);
await db.init();

const server = createMetadataServer(db);
await server.listen({ port: config.port, host: config.host });

const heartbeatTimer = startHeartbeatLoop(db);
const repairTimer = startRepairLoop(db);

async function shutdown() {
  clearInterval(heartbeatTimer);
  clearInterval(repairTimer);
  await server.close();
  await db.close();
}

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
