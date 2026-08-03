import { createReadStream } from "node:fs";
import { CHUNK_SIZE_BYTES } from "./constants.js";
import { sha256 } from "./checksum.js";

export interface FileChunk {
  chunkIndex: number;
  bytes: Buffer;
  checksum: string;
  size: number;
}

export function getChunkCount(fileSize: number, chunkSize = CHUNK_SIZE_BYTES): number {
  if (fileSize === 0) {
    return 1;
  }
  return Math.ceil(fileSize / chunkSize);
}

export async function* readFileChunks(path: string, chunkSize = CHUNK_SIZE_BYTES): AsyncGenerator<FileChunk> {
  let chunkIndex = 0;
  let buffered = Buffer.alloc(0);

  for await (const piece of createReadStream(path)) {
    buffered = Buffer.concat([buffered, piece as Buffer]);

    while (buffered.length >= chunkSize) {
      const bytes = buffered.subarray(0, chunkSize);
      buffered = buffered.subarray(chunkSize);
      yield {
        chunkIndex,
        bytes,
        checksum: sha256(bytes),
        size: bytes.length
      };
      chunkIndex += 1;
    }
  }

  if (buffered.length > 0 || chunkIndex === 0) {
    yield {
      chunkIndex,
      bytes: buffered,
      checksum: sha256(buffered),
      size: buffered.length
    };
  }
}
