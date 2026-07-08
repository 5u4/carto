import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentHashes } from "../src/io.js";
import { hashContent, sourceKey } from "../src/core.js";
import type { Ir } from "../src/ir.js";

function irWithSources(files: string[]): Ir {
  return {
    version: "1",
    vault: {
      name: "carto",
      anchors: { self: "." },
      generatedAt: "2026-07-07T00:00:00Z",
      locales: ["en"],
      defaultLocale: "en",
    },
    nodes: {
      root: {
        id: "root",
        name: "Root",
        parent: null,
        children: [],
        sources: files.map((file) => ({ anchor: "self", file, hash: "sha256:placeholder" })),
      },
    },
  };
}

describe("currentHashes", () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = await mkdtemp(join(tmpdir(), "carto-io-"));
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it("keys hashes of existing files by sourceKey and skips missing ones", async () => {
    await writeFile(join(contentDir, "present.ts"), "hello");
    const hashes = await currentHashes(irWithSources(["present.ts", "absent.ts"]), contentDir);
    expect(hashes.get(sourceKey("self", "present.ts"))).toBe(hashContent("hello"));
    expect(hashes.has(sourceKey("self", "absent.ts"))).toBe(false);
  });

  it("surfaces a non-ENOENT read error instead of swallowing it", async () => {
    await mkdir(join(contentDir, "adir"));
    await expect(currentHashes(irWithSources(["adir"]), contentDir)).rejects.toMatchObject({
      code: "EISDIR",
    });
  });
});
