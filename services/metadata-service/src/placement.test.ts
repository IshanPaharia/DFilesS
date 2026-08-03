import { describe, expect, it } from "vitest";
import { selectReplicaTargets } from "./placement.js";

const nodes = [
  { id: "node-c", address: "http://c" },
  { id: "node-a", address: "http://a" },
  { id: "node-b", address: "http://b" },
  { id: "node-d", address: "http://d" }
];

describe("selectReplicaTargets", () => {
  it("selects duplicate-free targets", () => {
    const targets = selectReplicaTargets(nodes, 0, 3);
    expect(targets.map((target) => target.nodeId)).toEqual(["node-a", "node-b", "node-c"]);
    expect(new Set(targets.map((target) => target.nodeId)).size).toBe(3);
  });

  it("rotates placement by chunk index", () => {
    expect(selectReplicaTargets(nodes, 1, 3).map((target) => target.nodeId)).toEqual(["node-b", "node-c", "node-d"]);
    expect(selectReplicaTargets(nodes, 3, 3).map((target) => target.nodeId)).toEqual(["node-d", "node-a", "node-b"]);
  });

  it("rejects under-sized clusters", () => {
    expect(() => selectReplicaTargets(nodes.slice(0, 2), 0, 3)).toThrow("need 3 healthy nodes");
  });
});
