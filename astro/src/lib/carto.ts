import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IrSchema } from "../../../src/ir";

export type { Ir, Node } from "../../../src/ir";
import type { Ir, Node } from "../../../src/ir";

export const contentDir = resolve(process.env.CARTO_CONTENT_DIR ?? "example-content");

export function loadIr(): Ir {
  const raw = readFileSync(resolve(contentDir, "ir.json"), "utf8");
  return IrSchema.parse(JSON.parse(raw));
}

export const staleIds = new Set(
  (process.env.CARTO_STALE_IDS ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);

export interface TreeItem {
  node: Node;
  depth: number;
}

export function tree(ir: Ir): TreeItem[] {
  const items: TreeItem[] = [];
  const visited = new Set<string>();
  const walk = (node: Node, depth: number): void => {
    if (visited.has(node.id)) {
      return;
    }
    visited.add(node.id);
    items.push({ node, depth });
    for (const childId of node.children) {
      const child = ir.nodes[childId];
      if (child !== undefined) {
        walk(child, depth + 1);
      }
    }
  };
  for (const node of Object.values(ir.nodes)) {
    if (node.parent === null) {
      walk(node, 0);
    }
  }
  return items;
}
