import { describe, expect, it } from "vitest";
import { sha256, verifySha256 } from "./checksum.js";

describe("checksum helpers", () => {
  it("computes stable sha256 checksums", () => {
    const checksum = sha256(Buffer.from("dfs"));
    expect(checksum).toBe("328c5022ccc950d0bc9ce3e3f752cc0b9363ab949d46c63ddc4c95ff2d2f2609");
    expect(verifySha256(Buffer.from("dfs"), checksum)).toBe(true);
    expect(verifySha256(Buffer.from("bad"), checksum)).toBe(false);
  });
});
