import { createHash } from "node:crypto";

export function sha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifySha256(bytes: Buffer | Uint8Array, expectedChecksum: string): boolean {
  return sha256(bytes) === expectedChecksum;
}
