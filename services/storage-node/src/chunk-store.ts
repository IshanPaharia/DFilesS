import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifySha256 } from "@dfs/shared";

const VALID_CHUNK_ID = /^[a-zA-Z0-9._:-]+$/;

export class ChunkStore {
  constructor(private readonly rootDir: string) {}

  async init(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async put(chunkId: string, bytes: Buffer, expectedChecksum: string): Promise<void> {
    this.assertValidChunkId(chunkId);
    if (!verifySha256(bytes, expectedChecksum)) {
      throw new Error("checksum mismatch");
    }
    await writeFile(this.pathFor(chunkId), bytes);
  }

  async get(chunkId: string): Promise<Buffer> {
    this.assertValidChunkId(chunkId);
    return readFile(this.pathFor(chunkId));
  }

  async delete(chunkId: string): Promise<void> {
    this.assertValidChunkId(chunkId);
    await rm(this.pathFor(chunkId), { force: true });
  }

  async metrics(): Promise<{ chunks: number; bytesStored: number }> {
    await this.init();
    const files = await readdir(this.rootDir);
    let bytesStored = 0;

    for (const file of files) {
      const info = await stat(join(this.rootDir, file));
      if (info.isFile()) {
        bytesStored += info.size;
      }
    }

    return {
      chunks: files.length,
      bytesStored
    };
  }

  private pathFor(chunkId: string): string {
    return join(this.rootDir, chunkId);
  }

  private assertValidChunkId(chunkId: string): void {
    if (!VALID_CHUNK_ID.test(chunkId)) {
      throw new Error("invalid chunk id");
    }
  }
}
