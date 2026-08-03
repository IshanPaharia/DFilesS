import { describe, expect, it } from "vitest";
import { getChunkCount } from "./chunking.js";

describe("getChunkCount", () => {
  it("represents an empty file as one zero-byte chunk", () => {
    expect(getChunkCount(0, 4)).toBe(1);
  });

  it("rounds partial chunks up", () => {
    expect(getChunkCount(1, 4)).toBe(1);
    expect(getChunkCount(4, 4)).toBe(1);
    expect(getChunkCount(5, 4)).toBe(2);
  });
});
