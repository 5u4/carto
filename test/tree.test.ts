import { describe, expect, it } from "vitest";
import { tree } from "../astro/src/lib/carto.js";
import type { Ir, Node } from "../src/ir.js";

function makeIr(nodes: Record<string, Node>): Ir {
  return {
    version: "1",
    vault: {
      name: "carto",
      anchors: { self: "/repo" },
      generatedAt: "2026-07-07T00:00:00Z",
      locales: ["en"],
      defaultLocale: "en",
    },
    nodes,
  };
}

function leaf(id: string, parent: string | null, children: string[] = []): Node {
  return { id, name: id.toUpperCase(), parent, children, sources: [] };
}

describe("tree", () => {
  it("visits each root and its descendants before moving to the next root, in preorder", () => {
    const ir = makeIr({
      r1: leaf("r1", null, ["r1a", "r1b"]),
      r1a: leaf("r1a", "r1"),
      r1b: leaf("r1b", "r1"),
      r2: leaf("r2", null, ["r2a"]),
      r2a: leaf("r2a", "r2"),
    });

    const ids = tree(ir).map((item) => item.node.id);

    expect(ids).toEqual(["r1", "r1a", "r1b", "r2", "r2a"]);
  });

  it("annotates depth 0 for a root, 1 for its child, and 2 for its grandchild", () => {
    const ir = makeIr({
      root: leaf("root", null, ["child"]),
      child: leaf("child", "root", ["grandchild"]),
      grandchild: leaf("grandchild", "child"),
    });

    const depths = tree(ir).map((item) => item.depth);

    expect(depths).toEqual([0, 1, 2]);
  });

  it("visits children in the array order given by node.children, not sorted by id", () => {
    const ir = makeIr({
      root: leaf("root", null, ["z", "a"]),
      z: leaf("z", "root"),
      a: leaf("a", "root"),
    });

    const ids = tree(ir).map((item) => item.node.id);

    expect(ids).toEqual(["root", "z", "a"]);
  });

  it("skips a child id that is not present in ir.nodes instead of throwing", () => {
    const ir = makeIr({
      root: leaf("root", null, ["present", "ghost"]),
      present: leaf("present", "root"),
    });

    expect(() => tree(ir)).not.toThrow();
    const ids = tree(ir).map((item) => item.node.id);

    expect(ids).toEqual(["root", "present"]);
  });

  it("includes every root (parent === null) in Object.values insertion order", () => {
    const ir = makeIr({
      second: leaf("second", null),
      first: leaf("first", null),
    });

    const ids = tree(ir).map((item) => item.node.id);

    expect(ids).toEqual(["second", "first"]);
  });

  it("does not recurse indefinitely when nodes form a cycle", () => {
    const ir = makeIr({
      a: leaf("a", null, ["b"]),
      b: leaf("b", "a", ["a"]),
    });

    const ids = tree(ir).map((item) => item.node.id);

    expect(ids).toEqual(["a", "b"]);
  });

  it("visits a node shared as a child of two parents only once", () => {
    const ir = makeIr({
      p1: leaf("p1", null, ["shared"]),
      p2: leaf("p2", null, ["shared"]),
      shared: leaf("shared", "p1"),
    });

    const ids = tree(ir).map((item) => item.node.id);

    expect(ids).toEqual(["p1", "shared", "p2"]);
  });
});
