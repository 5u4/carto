import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { IrSchema, type Ir } from "./ir.js";
import { collectSourceFiles, hashContent } from "./core.js";

export async function readIr(irPath: string): Promise<Ir> {
  const raw = await readFile(irPath, "utf8");
  return IrSchema.parse(JSON.parse(raw));
}

export async function writeIr(irPath: string, ir: Ir): Promise<void> {
  await writeFile(irPath, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
}

const HASH_CONCURRENCY = 16;

export async function currentHashes(ir: Ir, root: string): Promise<Map<string, string>> {
  const files = collectSourceFiles(ir);
  const hashes = new Map<string, string>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const file = files[next++];
      if (file === undefined) {
        return;
      }
      try {
        hashes.set(file, hashContent(await readFile(resolve(root, file))));
      } catch {
        continue;
      }
    }
  };
  const pool = Array.from({ length: Math.min(HASH_CONCURRENCY, files.length) }, worker);
  await Promise.all(pool);
  return hashes;
}
