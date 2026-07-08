import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffHashes, staleNodes } from "./core.js";
import { currentHashes, readIr } from "./io.js";

const require = createRequire(import.meta.url);

export interface BuildOptions {
  irPath: string;
  contentDir: string;
  root: string;
  outDir: string;
}

export async function build(options: BuildOptions): Promise<void> {
  const ir = await readIr(options.irPath);
  const changed = diffHashes(ir, await currentHashes(ir, options.root)).map((change) => change.file);
  const staleIds = staleNodes(ir, changed).map((node) => node.id);

  const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "astro");
  const astroBin = resolve(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");

  const child = spawn(process.execPath, [astroBin, "build", "--root", templateDir], {
    stdio: "inherit",
    env: {
      ...process.env,
      CARTO_CONTENT_DIR: resolve(options.contentDir),
      CARTO_OUT_DIR: resolve(options.outDir),
      CARTO_STALE_IDS: staleIds.join("\n"),
    },
  });

  const { promise, resolve: settle, reject } = Promise.withResolvers<void>();
  child.on("error", reject);
  child.on("close", (code, signal) => {
    if (code === 0) {
      settle();
    } else if (signal !== null) {
      reject(new Error(`astro build terminated by signal ${signal}`));
    } else {
      reject(new Error(`astro build exited with code ${code ?? "null"}`));
    }
  });
  return promise;
}
