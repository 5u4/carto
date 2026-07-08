import { defineCommand, runMain } from "citty";
import { applyHashes, diffHashes, staleNodes } from "./core.js";
import { currentHashes, readIr, writeIr } from "./io.js";
import { build } from "./build.js";
import { resolve } from "node:path";

const sharedArgs = {
  content: {
    type: "string",
    description: "Content directory holding ir.json and nodes/",
    default: "content",
  },
} as const;

const hash = defineCommand({
  meta: { name: "hash", description: "Recompute source-file hashes into ir.json" },
  args: sharedArgs,
  async run({ args }) {
    const irPath = resolve(args.content, "ir.json");
    const ir = await readIr(irPath);
    const current = await currentHashes(ir, args.content);
    await writeIr(irPath, applyHashes(ir, current));
    process.stdout.write(`hashed ${current.size} source file(s)\n`);
  },
});

const diff = defineCommand({
  meta: { name: "diff", description: "List source files changed since last hash" },
  args: sharedArgs,
  async run({ args }) {
    const irPath = resolve(args.content, "ir.json");
    const ir = await readIr(irPath);
    const current = await currentHashes(ir, args.content);
    const changes = diffHashes(ir, current);
    if (changes.length === 0) {
      process.stdout.write("no changes\n");
      return;
    }
    for (const change of changes) {
      process.stdout.write(
        `${change.current === null ? "missing" : "changed"}\t${change.anchor}:${change.file}\n`,
      );
    }
  },
});

const stale = defineCommand({
  meta: { name: "stale", description: "Map changed files to affected node ids (report only)" },
  args: sharedArgs,
  async run({ args }) {
    const irPath = resolve(args.content, "ir.json");
    const ir = await readIr(irPath);
    const current = await currentHashes(ir, args.content);
    const changed = diffHashes(ir, current).map((change) => ({
      anchor: change.anchor,
      file: change.file,
    }));
    const nodes = staleNodes(ir, changed);
    if (nodes.length === 0) {
      process.stdout.write("no stale nodes\n");
      return;
    }
    for (const node of nodes) {
      process.stdout.write(`${node.id}\t${node.files.join(", ")}\n`);
    }
  },
});

const buildCommand = defineCommand({
  meta: { name: "build", description: "Compile content/ into a static HTML site" },
  args: {
    ...sharedArgs,
    out: {
      type: "string",
      description: "Output directory for the generated site",
      default: "dist-site",
    },
  },
  async run({ args }) {
    await build({
      irPath: resolve(args.content, "ir.json"),
      contentDir: args.content,
      outDir: args.out,
    });
  },
});

const main = defineCommand({
  meta: { name: "carto", description: "Deterministic structure-hashing and staleness reporting" },
  subCommands: { hash, diff, stale, build: buildCommand },
});

void runMain(main);
