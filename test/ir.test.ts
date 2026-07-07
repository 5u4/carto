import { describe, expect, it } from "vitest";
import { IrSchema } from "../src/ir.js";
import type { Ir } from "../src/ir.js";

function validIr(): Ir {
  return {
    version: "1",
    project: {
      name: "carto",
      root: "/repo",
      generatedAt: "2026-07-07T00:00:00Z",
      commit: "abc123",
      locales: ["en", "fr"],
      defaultLocale: "en",
    },
    nodes: {
      root: {
        id: "root",
        name: "Root",
        parent: null,
        children: ["child"],
        sources: [{ file: "src/index.ts", hash: "sha256:aaa" }],
      },
      child: {
        id: "child",
        name: "Child",
        parent: "root",
        children: [],
        sources: [{ file: "src/child.ts", hash: "sha256:bbb" }],
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

  it("rejects a defaultLocale absent from project.locales", () => {
    const ir = validIr();
    const invalid = { ...ir, project: { ...ir.project, defaultLocale: "de" } };
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

  it("rejects an empty project.locales list", () => {
    const ir = validIr();
    const invalid = { ...ir, project: { ...ir.project, locales: [] } };
    expect(() => IrSchema.parse(invalid)).toThrow();
  });
});
