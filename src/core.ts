import { createHash } from "node:crypto";
import type { Ir } from "./ir.js";

export function hashContent(data: Buffer | string): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export function collectSourceFiles(ir: Ir): string[] {
  const files = new Set<string>();
  for (const node of Object.values(ir.nodes)) {
    for (const source of node.sources) {
      files.add(source.file);
    }
  }
  return [...files];
}

export interface FileChange {
  file: string;
  stored: string;
  current: string | null;
}

export function diffHashes(ir: Ir, current: ReadonlyMap<string, string>): FileChange[] {
  const stored = new Map<string, string>();
  for (const node of Object.values(ir.nodes)) {
    for (const source of node.sources) {
      stored.set(source.file, source.hash);
    }
  }
  const changes: FileChange[] = [];
  for (const [file, storedHash] of stored) {
    const currentHash = current.get(file) ?? null;
    if (currentHash !== storedHash) {
      changes.push({ file, stored: storedHash, current: currentHash });
    }
  }
  return changes;
}

export interface StaleNode {
  id: string;
  files: string[];
}

export function staleNodes(ir: Ir, changedFiles: Iterable<string>): StaleNode[] {
  const changed = new Set(changedFiles);
  const stale: StaleNode[] = [];
  for (const node of Object.values(ir.nodes)) {
    const hit = node.sources.map((source) => source.file).filter((file) => changed.has(file));
    if (hit.length > 0) {
      stale.push({ id: node.id, files: hit });
    }
  }
  return stale;
}

export function applyHashes(ir: Ir, current: ReadonlyMap<string, string>): Ir {
  const nodes = Object.create(null) as Ir["nodes"];
  for (const [id, node] of Object.entries(ir.nodes)) {
    nodes[id] = {
      ...node,
      children: [...node.children],
      sources: node.sources.map((source) => {
        const currentHash = current.get(source.file);
        return { ...source, hash: currentHash ?? source.hash };
      }),
    };
  }
  return { ...ir, nodes };
}
