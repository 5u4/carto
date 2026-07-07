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

export async function currentHashes(ir: Ir, root: string): Promise<Map<string, string>> {
  const files = collectSourceFiles(ir);
  const entries = await Promise.all(
    files.map(async (file) => {
      try {
        const data = await readFile(resolve(root, file));
        return [file, hashContent(data)] as const;
      } catch {
        return null;
      }
    }),
  );
  const hashes = new Map<string, string>();
  for (const entry of entries) {
    if (entry !== null) {
      hashes.set(entry[0], entry[1]);
    }
  }
  return hashes;
}
