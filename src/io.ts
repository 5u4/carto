import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { IrSchema, type Ir } from "./ir.js";
import { collectSources, hashContent, sourceKey } from "./core.js";

export async function readIr(irPath: string): Promise<Ir> {
  const raw = await readFile(irPath, "utf8");
  return IrSchema.parse(JSON.parse(raw));
}

export async function writeIr(irPath: string, ir: Ir): Promise<void> {
  await writeFile(irPath, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
}

const HASH_CONCURRENCY = 16;

export async function currentHashes(ir: Ir, contentDir: string): Promise<Map<string, string>> {
  const sources = collectSources(ir);
  const hashes = new Map<string, string>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < sources.length) {
      const source = sources[next++];
      if (source === undefined) {
        return;
      }
      const anchorAbs = resolve(contentDir, ir.vault.anchors[source.anchor]!);
      const fileAbs = resolve(anchorAbs, source.file);
      try {
        hashes.set(sourceKey(source.anchor, source.file), hashContent(await readFile(fileAbs)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }
    }
  };
  const pool = Array.from({ length: Math.min(HASH_CONCURRENCY, sources.length) }, worker);
  await Promise.all(pool);
  return hashes;
}
