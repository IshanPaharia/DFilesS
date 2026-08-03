#!/usr/bin/env node
import { Command } from "commander";
import { readEnv } from "@dfs/shared";
import { downloadFile, killNode, printStatus, seedDemo, uploadFile, verifyFile, watchHealing } from "./client.js";

const program = new Command();
const metadataUrl = () => readEnv("METADATA_URL", "http://localhost:4000");
const ctx = () => ({
  metadataUrl: metadataUrl(),
  log: (message: string) => console.log(message)
});

program.name("dfs").description("Distributed file store CLI").version("0.1.0");

program
  .command("upload")
  .argument("<path>", "file to upload")
  .action(async (path: string) => {
    await uploadFile(ctx(), path);
  });

program
  .command("download")
  .argument("<fileId>", "file id to download")
  .requiredOption("--out <path>", "output path")
  .action(async (fileId: string, options: { out: string }) => {
    await downloadFile(ctx(), fileId, options.out);
  });

program.command("status").action(async () => {
  await printStatus(ctx());
});

program
  .command("verify")
  .argument("<fileId>", "file id to verify")
  .action(async (fileId: string) => {
    const ok = await verifyFile(ctx(), fileId);
    process.exitCode = ok ? 0 : 1;
  });

const demo = program.command("demo").description("demo helpers");

demo.command("seed").action(async () => {
  await seedDemo(ctx());
});

demo
  .command("kill-node")
  .argument("<nodeId>", "Docker container name, for example storage-node-3")
  .action(async (nodeId: string) => {
    await killNode(nodeId);
    console.log(`Killed ${nodeId}`);
  });

demo.command("heal-watch").action(async () => {
  await watchHealing(ctx());
});

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
