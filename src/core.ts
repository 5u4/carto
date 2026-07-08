import { createHash } from "node:crypto";
import type { Ir } from "./ir.js";

export function hashContent(data: Buffer | string): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export function sourceKey(anchor: string, file: string): string {
  return `${anchor}\u0000${file}`;
}

export interface SourceRef {
  anchor: string;
  file: string;
}

export function collectSources(ir: Ir): SourceRef[] {
  const seen = new Set<string>();
  const refs: SourceRef[] = [];
  for (const node of Object.values(ir.nodes)) {
    for (const source of node.sources) {
      const key = sourceKey(source.anchor, source.file);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push({ anchor: source.anchor, file: source.file });
    }
  }
  return refs;
}

export interface FileChange {
  anchor: string;
  file: string;
  stored: string;
  current: string | null;
}

export function diffHashes(ir: Ir, current: ReadonlyMap<string, string>): FileChange[] {
  const stored = new Map<string, { anchor: string; file: string; hash: string }>();
  for (const node of Object.values(ir.nodes)) {
    for (const source of node.sources) {
      stored.set(sourceKey(source.anchor, source.file), {
        anchor: source.anchor,
        file: source.file,
        hash: source.hash,
      });
    }
  }
  const changes: FileChange[] = [];
  for (const [key, source] of stored) {
    const currentHash = current.get(key) ?? null;
    if (currentHash !== source.hash) {
      changes.push({
        anchor: source.anchor,
        file: source.file,
        stored: source.hash,
        current: currentHash,
      });
    }
  }
  return changes;
}

export interface StaleNode {
  id: string;
  files: string[];
}

export function staleNodes(ir: Ir, changed: Iterable<{ anchor: string; file: string }>): StaleNode[] {
  const changedKeys = new Set<string>();
  for (const ref of changed) {
    changedKeys.add(sourceKey(ref.anchor, ref.file));
  }
  const stale: StaleNode[] = [];
  for (const node of Object.values(ir.nodes)) {
    const hit = node.sources
      .filter((source) => changedKeys.has(sourceKey(source.anchor, source.file)))
      .map((source) => `${source.anchor}:${source.file}`);
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
        const currentHash = current.get(sourceKey(source.anchor, source.file));
        return { ...source, hash: currentHash ?? source.hash };
      }),
    };
  }
  return { ...ir, nodes };
}
