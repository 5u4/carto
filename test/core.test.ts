import { describe, expect, it } from "vitest";
import { applyHashes, collectSourceFiles, diffHashes, hashContent, staleNodes } from "../src/core.js";
import type { Ir } from "../src/ir.js";

function makeIr(): Ir {
  return {
    version: "1",
    project: {
      name: "carto",
      root: "/repo",
      generatedAt: "2026-07-07T00:00:00Z",
      commit: "abc123",
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
          { file: "src/shared.ts", hash: "sha256:shared-hash" },
          { file: "src/a.ts", hash: "sha256:a-hash" },
        ],
      },
      b: {
        id: "b",
        name: "B",
        parent: "a",
        children: [],
        sources: [
          { file: "src/shared.ts", hash: "sha256:shared-hash" },
          { file: "src/b.ts", hash: "sha256:b-hash" },
        ],
      },
      c: {
        id: "c",
        name: "C",
        parent: null,
        children: [],
        sources: [{ file: "src/c.ts", hash: "sha256:c-hash" }],
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

describe("collectSourceFiles", () => {
  it("returns the unique set of source files across all nodes", () => {
    const files = collectSourceFiles(makeIr());
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts", "src/shared.ts"]);
  });

  it("dedupes a file referenced by more than one node", () => {
    const files = collectSourceFiles(makeIr());
    expect(files.filter((file) => file === "src/shared.ts")).toHaveLength(1);
  });
});

describe("diffHashes", () => {
  it("reports a changed file whose current hash differs from the stored hash", () => {
    const current = new Map<string, string>([
      ["src/shared.ts", "sha256:shared-hash"],
      ["src/a.ts", "sha256:a-hash-CHANGED"],
      ["src/b.ts", "sha256:b-hash"],
      ["src/c.ts", "sha256:c-hash"],
    ]);
    const changes = diffHashes(makeIr(), current);
    expect(changes).toEqual([{ file: "src/a.ts", stored: "sha256:a-hash", current: "sha256:a-hash-CHANGED" }]);
  });

  it("reports current: null for a file missing from the current map", () => {
    const current = new Map<string, string>([
      ["src/shared.ts", "sha256:shared-hash"],
      ["src/b.ts", "sha256:b-hash"],
      ["src/c.ts", "sha256:c-hash"],
    ]);
    const changes = diffHashes(makeIr(), current);
    expect(changes).toEqual([{ file: "src/a.ts", stored: "sha256:a-hash", current: null }]);
  });

  it("omits files whose current hash matches the stored hash", () => {
    const current = new Map<string, string>([
      ["src/shared.ts", "sha256:shared-hash"],
      ["src/a.ts", "sha256:a-hash"],
      ["src/b.ts", "sha256:b-hash"],
      ["src/c.ts", "sha256:c-hash"],
    ]);
    expect(diffHashes(makeIr(), current)).toEqual([]);
  });
});

describe("staleNodes", () => {
  it("reports a node whose single source file changed", () => {
    const stale = staleNodes(makeIr(), ["src/c.ts"]);
    expect(stale).toEqual([{ id: "c", files: ["src/c.ts"] }]);
  });

  it("reports every matching file for a node with multiple hits", () => {
    const stale = staleNodes(makeIr(), ["src/shared.ts", "src/a.ts"]);
    expect(stale.find((node) => node.id === "a")).toEqual({
      id: "a",
      files: ["src/shared.ts", "src/a.ts"],
    });
  });

  it("marks every node sharing a changed file as stale", () => {
    const stale = staleNodes(makeIr(), ["src/shared.ts"]);
    expect(stale.map((node) => node.id).sort()).toEqual(["a", "b"]);
  });

  it("omits nodes with no changed files", () => {
    const stale = staleNodes(makeIr(), ["src/c.ts"]);
    expect(stale.find((node) => node.id === "a")).toBeUndefined();
    expect(stale.find((node) => node.id === "b")).toBeUndefined();
  });
});

describe("applyHashes", () => {
  it("replaces the hash of a source present in the current map", () => {
    const ir = makeIr();
    const current = new Map<string, string>([["src/a.ts", "sha256:new-a-hash"]]);
    const updated = applyHashes(ir, current);
    const source = updated.nodes["a"]?.sources.find((entry) => entry.file === "src/a.ts");
    expect(source?.hash).toBe("sha256:new-a-hash");
  });

  it("keeps the old hash for a source absent from the current map", () => {
    const ir = makeIr();
    const current = new Map<string, string>([["src/a.ts", "sha256:new-a-hash"]]);
    const updated = applyHashes(ir, current);
    const source = updated.nodes["c"]?.sources.find((entry) => entry.file === "src/c.ts");
    expect(source?.hash).toBe("sha256:c-hash");
  });

  it("does not mutate the input ir", () => {
    const ir = makeIr();
    const snapshot = structuredClone(ir);
    const current = new Map<string, string>([["src/a.ts", "sha256:new-a-hash"]]);
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
});
