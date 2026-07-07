import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentHashes } from "../src/io.js";
import { hashContent } from "../src/core.js";
import type { Ir } from "../src/ir.js";

function irWithSources(files: string[]): Ir {
  return {
    version: "1",
    project: {
      name: "carto",
      root: ".",
      generatedAt: "2026-07-07T00:00:00Z",
      commit: "abc123",
      locales: ["en"],
      defaultLocale: "en",
    },
    nodes: {
      root: {
        id: "root",
        name: "Root",
        parent: null,
        children: [],
        sources: files.map((file) => ({ file, hash: "sha256:placeholder" })),
      },
    },
  };
}

describe("currentHashes", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "carto-io-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("hashes existing files and skips missing ones", async () => {
    await writeFile(join(root, "present.ts"), "hello");
    const hashes = await currentHashes(irWithSources(["present.ts", "absent.ts"]), root);
    expect(hashes.get("present.ts")).toBe(hashContent("hello"));
    expect(hashes.has("absent.ts")).toBe(false);
  });

  it("surfaces a non-ENOENT read error instead of swallowing it", async () => {
    await mkdir(join(root, "adir"));
    await expect(currentHashes(irWithSources(["adir"]), root)).rejects.toMatchObject({
      code: "EISDIR",
    });
  });
});
