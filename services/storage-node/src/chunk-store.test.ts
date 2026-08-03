import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "@dfs/shared";
import { ChunkStore } from "./chunk-store.js";

describe("ChunkStore", () => {
  it("stores and reads checksum-verified chunks", async () => {
    const store = new ChunkStore(await mkdtemp(join(tmpdir(), "dfs-store-")));
    await store.init();

    const bytes = Buffer.from("hello");
    await store.put("chunk-1", bytes, sha256(bytes));

    await expect(store.get("chunk-1")).resolves.toEqual(bytes);
  });

  it("rejects corrupt uploads", async () => {
    const store = new ChunkStore(await mkdtemp(join(tmpdir(), "dfs-store-")));
    await store.init();

    await expect(store.put("chunk-1", Buffer.from("bad"), sha256(Buffer.from("good")))).rejects.toThrow(
      "checksum mismatch"
    );
  });
});
