import { describe, expect, it } from "vitest";
import { assertWriteQuorum } from "./quorum.js";

describe("assertWriteQuorum", () => {
  it("accepts two successful replicas", () => {
    expect(assertWriteQuorum(["a", "b"], 2)).toEqual(["a", "b"]);
  });

  it("rejects fewer than quorum", () => {
    expect(() => assertWriteQuorum(["a"], 2)).toThrow("write quorum not met");
  });
});
