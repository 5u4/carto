import { defineCommand, runMain } from "citty";
import { applyHashes, diffHashes, staleNodes } from "./core.js";
import { currentHashes, readIr, writeIr } from "./io.js";

const sharedArgs = {
  ir: {
    type: "string",
    description: "Path to ir.json",
    default: "content/ir.json",
  },
  root: {
    type: "string",
    description: "Repository root that source paths resolve against",
    default: ".",
  },
} as const;

const hash = defineCommand({
  meta: { name: "hash", description: "Recompute source-file hashes into ir.json" },
  args: sharedArgs,
  async run({ args }) {
    const ir = await readIr(args.ir);
    const current = await currentHashes(ir, args.root);
    await writeIr(args.ir, applyHashes(ir, current));
    process.stdout.write(`hashed ${current.size} source file(s)\n`);
  },
});

const diff = defineCommand({
  meta: { name: "diff", description: "List source files changed since last hash" },
  args: sharedArgs,
  async run({ args }) {
    const ir = await readIr(args.ir);
    const changes = diffHashes(ir, await currentHashes(ir, args.root));
    if (changes.length === 0) {
      process.stdout.write("no changes\n");
      return;
    }
    for (const change of changes) {
      process.stdout.write(`${change.current === null ? "missing" : "changed"}\t${change.file}\n`);
    }
  },
});

const stale = defineCommand({
  meta: { name: "stale", description: "Map changed files to affected node ids (report only)" },
  args: sharedArgs,
  async run({ args }) {
    const ir = await readIr(args.ir);
    const changed = diffHashes(ir, await currentHashes(ir, args.root)).map((change) => change.file);
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

const main = defineCommand({
  meta: { name: "carto", description: "Deterministic structure-hashing and staleness reporting" },
  subCommands: { hash, diff, stale },
});

void runMain(main);
