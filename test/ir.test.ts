import { describe, expect, it } from "vitest";
import { IrSchema } from "../src/ir.js";
import type { Ir } from "../src/ir.js";

function validIr(): Ir {
  return {
    version: "1",
    vault: {
      name: "carto",
      anchors: { self: "/repo", lib: "/lib" },
      generatedAt: "2026-07-07T00:00:00Z",
      locales: ["en", "fr"],
      defaultLocale: "en",
    },
    nodes: {
      root: {
        id: "root",
        name: "Root",
        parent: null,
        children: ["child"],
        sources: [{ anchor: "self", file: "src/index.ts", hash: "sha256:aaa" }],
      },
      child: {
        id: "child",
        name: "Child",
        parent: "root",
        children: [],
        sources: [{ anchor: "self", file: "src/child.ts", hash: "sha256:bbb" }],
      },
    },
  };
}

describe("IrSchema", () => {
  it("accepts a valid ir fixture", () => {
    const ir = validIr();
    expect(() => IrSchema.parse(ir)).not.toThrow();
    expect(IrSchema.parse(ir)).toEqual(ir);
  });

  it("rejects a version other than the literal \"1\"", () => {
    const ir = validIr();
    const invalid = { ...ir, version: "2" };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a defaultLocale absent from vault.locales", () => {
    const ir = validIr();
    const invalid = { ...ir, vault: { ...ir.vault, defaultLocale: "de" } };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a node whose record key does not match node.id", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        mismatched: ir.nodes["child"],
      },
    };
    delete (invalid.nodes as Record<string, unknown>)["child"];
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a node whose parent references a missing node", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        child: { ...ir.nodes["child"], parent: "ghost" },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a node whose children reference a missing node", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        root: { ...ir.nodes["root"], children: ["ghost"] },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects an empty vault.locales list", () => {
    const ir = validIr();
    const invalid = { ...ir, vault: { ...ir.vault, locales: [] } };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a parent that only exists on the object prototype", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        child: { ...ir.nodes["child"], parent: "constructor" },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a source citing an anchor absent from vault.anchors", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        root: {
          ...ir.nodes["root"],
          sources: [{ anchor: "ghost", file: "src/index.ts", hash: "sha256:aaa" }],
        },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects the same source carrying conflicting hashes across nodes", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        child: {
          ...ir.nodes["child"],
          sources: [{ anchor: "self", file: "src/index.ts", hash: "sha256:different" }],
        },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("accepts the same source repeated with identical hashes", () => {
    const ir = validIr();
    const shared = {
      ...ir,
      nodes: {
        ...ir.nodes,
        child: {
          ...ir.nodes["child"],
          sources: [{ anchor: "self", file: "src/index.ts", hash: "sha256:aaa" }],
        },
      },
    };
    expect(() => IrSchema.parse(shared)).not.toThrow();
  });

  it("rejects an absolute source file path", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        root: { ...ir.nodes["root"], sources: [{ anchor: "self", file: "/etc/passwd", hash: "sha256:x" }] },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a source file with a '..' traversal segment", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        root: { ...ir.nodes["root"], sources: [{ anchor: "self", file: "../../secret.ts", hash: "sha256:x" }] },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });

  it("rejects a Windows UNC absolute source file path", () => {
    const ir = validIr();
    const invalid = {
      ...ir,
      nodes: {
        ...ir.nodes,
        root: { ...ir.nodes["root"], sources: [{ anchor: "self", file: "\\\\server\\share\\file.ts", hash: "sha256:x" }] },
      },
    };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });
});
