import { describe, expect, it } from "vitest";
import { IrSchema } from "../src/ir.js";
import { applyHashes, collectSources, diffHashes, hashContent, sourceKey, staleNodes } from "../src/core.js";
import type { Ir } from "../src/ir.js";

function makeIr(): Ir {
  return {
    version: "1",
    vault: {
      name: "carto",
      anchors: { self: "/repo" },
      generatedAt: "2026-07-07T00:00:00Z",
      locales: ["en"],
      defaultLocale: "en",
    },
    nodes: {
      a: {
        id: "a",
        name: "A",
        parent: null,
        children: ["b"],
        sources: [
          { anchor: "self", file: "src/shared.ts", hash: "sha256:shared-hash" },
          { anchor: "self", file: "src/a.ts", hash: "sha256:a-hash" },
        ],
      },
      b: {
        id: "b",
        name: "B",
        parent: "a",
        children: [],
        sources: [
          { anchor: "self", file: "src/shared.ts", hash: "sha256:shared-hash" },
          { anchor: "self", file: "src/b.ts", hash: "sha256:b-hash" },
        ],
      },
      c: {
        id: "c",
        name: "C",
        parent: null,
        children: [],
        sources: [{ anchor: "self", file: "src/c.ts", hash: "sha256:c-hash" }],
      },
    },
  };
}

function twoAnchorIr(): Ir {
  return {
    version: "1",
    vault: {
      name: "carto",
      anchors: { self: "/repo", lib: "/lib" },
      generatedAt: "2026-07-07T00:00:00Z",
      locales: ["en"],
      defaultLocale: "en",
    },
    nodes: {
      a: {
        id: "a",
        name: "A",
        parent: null,
        children: [],
        sources: [
          { anchor: "self", file: "src/shared.ts", hash: "sha256:self-hash" },
          { anchor: "lib", file: "src/shared.ts", hash: "sha256:lib-hash" },
        ],
      },
    },
  };
}

describe("hashContent", () => {
  it("returns a sha256: prefixed digest", () => {
    expect(hashContent("hello")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashContent("some content")).toBe(hashContent("some content"));
  });

  it("matches the known sha256 vector for an empty string", () => {
    expect(hashContent("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the known sha256 vector for an empty buffer", () => {
    expect(hashContent(Buffer.from(""))).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produces different digests for different input", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});

describe("collectSources", () => {
  it("returns the unique source refs across all nodes in first-seen order", () => {
    expect(collectSources(makeIr())).toEqual([
      { anchor: "self", file: "src/shared.ts" },
      { anchor: "self", file: "src/a.ts" },
      { anchor: "self", file: "src/b.ts" },
      { anchor: "self", file: "src/c.ts" },
    ]);
  });

  it("dedupes a source referenced by more than one node", () => {
    const shared = collectSources(makeIr()).filter(
      (ref) => ref.anchor === "self" && ref.file === "src/shared.ts",
    );
    expect(shared).toHaveLength(1);
  });
});

describe("diffHashes", () => {
  it("reports a changed source whose current hash differs from the stored hash", () => {
    const current = new Map<string, string>([
      [sourceKey("self", "src/shared.ts"), "sha256:shared-hash"],
      [sourceKey("self", "src/a.ts"), "sha256:a-hash-CHANGED"],
      [sourceKey("self", "src/b.ts"), "sha256:b-hash"],
      [sourceKey("self", "src/c.ts"), "sha256:c-hash"],
    ]);
    const changes = diffHashes(makeIr(), current);
    expect(changes).toEqual([
      { anchor: "self", file: "src/a.ts", stored: "sha256:a-hash", current: "sha256:a-hash-CHANGED" },
    ]);
  });

  it("reports current: null for a source missing from the current map", () => {
    const current = new Map<string, string>([
      [sourceKey("self", "src/shared.ts"), "sha256:shared-hash"],
      [sourceKey("self", "src/b.ts"), "sha256:b-hash"],
      [sourceKey("self", "src/c.ts"), "sha256:c-hash"],
    ]);
    const changes = diffHashes(makeIr(), current);
    expect(changes).toEqual([
      { anchor: "self", file: "src/a.ts", stored: "sha256:a-hash", current: null },
    ]);
  });

  it("omits sources whose current hash matches the stored hash", () => {
    const current = new Map<string, string>([
      [sourceKey("self", "src/shared.ts"), "sha256:shared-hash"],
      [sourceKey("self", "src/a.ts"), "sha256:a-hash"],
      [sourceKey("self", "src/b.ts"), "sha256:b-hash"],
      [sourceKey("self", "src/c.ts"), "sha256:c-hash"],
    ]);
    expect(diffHashes(makeIr(), current)).toEqual([]);
  });
});

describe("staleNodes", () => {
  it("reports a node whose single source changed", () => {
    const stale = staleNodes(makeIr(), [{ anchor: "self", file: "src/c.ts" }]);
    expect(stale).toEqual([{ id: "c", files: ["self:src/c.ts"] }]);
  });

  it("reports every matching source for a node with multiple hits", () => {
    const stale = staleNodes(makeIr(), [
      { anchor: "self", file: "src/shared.ts" },
      { anchor: "self", file: "src/a.ts" },
    ]);
    expect(stale.find((node) => node.id === "a")).toEqual({
      id: "a",
      files: ["self:src/shared.ts", "self:src/a.ts"],
    });
  });

  it("marks every node sharing a changed source as stale", () => {
    const stale = staleNodes(makeIr(), [{ anchor: "self", file: "src/shared.ts" }]);
    expect(stale.map((node) => node.id).sort()).toEqual(["a", "b"]);
  });

  it("omits nodes with no changed sources", () => {
    const stale = staleNodes(makeIr(), [{ anchor: "self", file: "src/c.ts" }]);
    expect(stale.find((node) => node.id === "a")).toBeUndefined();
    expect(stale.find((node) => node.id === "b")).toBeUndefined();
  });
});

describe("applyHashes", () => {
  it("replaces the hash of a source present in the current map", () => {
    const ir = makeIr();
    const current = new Map<string, string>([[sourceKey("self", "src/a.ts"), "sha256:new-a-hash"]]);
    const updated = applyHashes(ir, current);
    const source = updated.nodes["a"]?.sources.find((entry) => entry.file === "src/a.ts");
    expect(source?.hash).toBe("sha256:new-a-hash");
  });

  it("keeps the old hash for a source absent from the current map", () => {
    const ir = makeIr();
    const current = new Map<string, string>([[sourceKey("self", "src/a.ts"), "sha256:new-a-hash"]]);
    const updated = applyHashes(ir, current);
    const source = updated.nodes["c"]?.sources.find((entry) => entry.file === "src/c.ts");
    expect(source?.hash).toBe("sha256:c-hash");
  });

  it("does not mutate the input ir", () => {
    const ir = makeIr();
    const snapshot = structuredClone(ir);
    const current = new Map<string, string>([[sourceKey("self", "src/a.ts"), "sha256:new-a-hash"]]);
    const updated = applyHashes(ir, current);
    expect(ir).toEqual(snapshot);
    expect(updated).not.toBe(ir);
    expect(updated.nodes).not.toBe(ir.nodes);
  });

  it("does not alias children arrays or source objects from the input ir", () => {
    const ir = makeIr();
    const current = new Map<string, string>();
    const updated = applyHashes(ir, current);
    expect(updated.nodes["a"]?.children).not.toBe(ir.nodes["a"]?.children);
    expect(updated.nodes["a"]?.sources[0]).not.toBe(ir.nodes["a"]?.sources[0]);
    const mutatedChildren = updated.nodes["a"]?.children;
    mutatedChildren?.push("ghost");
    expect(ir.nodes["a"]?.children).toEqual(["b"]);
  });

  it("does not pollute Object.prototype for a __proto__ node id", () => {
    const ir = makeIr();
    const hostile = JSON.parse(
      '{"__proto__":{"id":"__proto__","name":"X","parent":null,"children":[],"sources":[]}}',
    ) as Ir["nodes"];
    const polluted: Ir = { ...ir, nodes: hostile };
    applyHashes(polluted, new Map());
    expect(({} as Record<string, unknown>)["id"]).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("name");
  });
});

describe("the same file under two anchors", () => {
  it("is accepted without a conflicting-hash error", () => {
    expect(() => IrSchema.parse(twoAnchorIr())).not.toThrow();
  });

  it("is collected as two distinct source refs", () => {
    expect(collectSources(twoAnchorIr())).toEqual([
      { anchor: "self", file: "src/shared.ts" },
      { anchor: "lib", file: "src/shared.ts" },
    ]);
  });

  it("diffs each anchor's hash independently for the shared file string", () => {
    const current = new Map<string, string>([
      [sourceKey("self", "src/shared.ts"), "sha256:self-CHANGED"],
      [sourceKey("lib", "src/shared.ts"), "sha256:lib-hash"],
    ]);
    expect(diffHashes(twoAnchorIr(), current)).toEqual([
      { anchor: "self", file: "src/shared.ts", stored: "sha256:self-hash", current: "sha256:self-CHANGED" },
    ]);
  });

  it("applies a distinct hash to each anchor's source", () => {
    const current = new Map<string, string>([
      [sourceKey("self", "src/shared.ts"), "sha256:new-self"],
      [sourceKey("lib", "src/shared.ts"), "sha256:new-lib"],
    ]);
    const updated = applyHashes(twoAnchorIr(), current);
    const sources = updated.nodes["a"]?.sources ?? [];
    expect(sources.find((entry) => entry.anchor === "self")?.hash).toBe("sha256:new-self");
    expect(sources.find((entry) => entry.anchor === "lib")?.hash).toBe("sha256:new-lib");
  });
});
