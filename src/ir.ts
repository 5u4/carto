import { z } from "zod";

const RelativeFile = z
  .string()
  .min(1)
  .refine((file) => !file.startsWith("/") && !file.startsWith("\\") && !/^[A-Za-z]:/.test(file), {
    message: "source file must be a relative path",
  })
  .refine((file) => !file.split(/[\\/]/).includes(".."), {
    message: "source file must not contain a '..' path segment",
  });

export const SourceSchema = z.object({
  anchor: z.string().min(1),
  file: RelativeFile,
  hash: z.string().min(1),
});

export const NodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parent: z.string().min(1).nullable(),
  children: z.array(z.string().min(1)),
  sources: z.array(SourceSchema),
});

export const VaultSchema = z.object({
  name: z.string().min(1),
  anchors: z.record(z.string().min(1), z.string().min(1)),
  generatedAt: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1),
  defaultLocale: z.string().min(1),
});

export const IrSchema = z
  .object({
    version: z.literal("1"),
    vault: VaultSchema,
    nodes: z.record(z.string(), NodeSchema),
  })
  .superRefine((ir, ctx) => {
    if (!ir.vault.locales.includes(ir.vault.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        message: `defaultLocale "${ir.vault.defaultLocale}" is not listed in vault.locales`,
        path: ["vault", "defaultLocale"],
      });
    }
    const hashByKey = new Map<string, string>();
    for (const [key, node] of Object.entries(ir.nodes)) {
      if (node.id !== key) {
        ctx.addIssue({
          code: "custom",
          message: `node key "${key}" does not match node.id "${node.id}"`,
          path: ["nodes", key, "id"],
        });
      }
      if (node.parent !== null && !Object.hasOwn(ir.nodes, node.parent)) {
        ctx.addIssue({
          code: "custom",
          message: `node "${key}" references unknown parent "${node.parent}"`,
          path: ["nodes", key, "parent"],
        });
      }
      for (const child of node.children) {
        if (!Object.hasOwn(ir.nodes, child)) {
          ctx.addIssue({
            code: "custom",
            message: `node "${key}" references unknown child "${child}"`,
            path: ["nodes", key, "children"],
          });
        }
      }
      node.sources.forEach((source, index) => {
        if (!Object.hasOwn(ir.vault.anchors, source.anchor)) {
          ctx.addIssue({
            code: "custom",
            message: `node "${key}" cites unknown anchor "${source.anchor}"`,
            path: ["nodes", key, "sources", index, "anchor"],
          });
        }
        const sourceKey = `${source.anchor}\u0000${source.file}`;
        const seen = hashByKey.get(sourceKey);
        if (seen === undefined) {
          hashByKey.set(sourceKey, source.hash);
        } else if (seen !== source.hash) {
          ctx.addIssue({
            code: "custom",
            message: `source "${source.anchor}:${source.file}" has conflicting hashes across nodes ("${seen}" vs "${source.hash}")`,
            path: ["nodes", key, "sources", index, "hash"],
          });
        }
      });
    }
  });

export type Source = z.infer<typeof SourceSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Vault = z.infer<typeof VaultSchema>;
export type Ir = z.infer<typeof IrSchema>;
