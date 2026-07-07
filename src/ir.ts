import { z } from "zod";

export const SourceSchema = z.object({
  file: z.string().min(1),
  hash: z.string().min(1),
});

export const NodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parent: z.string().min(1).nullable(),
  children: z.array(z.string().min(1)),
  sources: z.array(SourceSchema),
});

export const ProjectSchema = z.object({
  name: z.string().min(1),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  commit: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1),
  defaultLocale: z.string().min(1),
});

export const IrSchema = z
  .object({
    version: z.literal("1"),
    project: ProjectSchema,
    nodes: z.record(z.string(), NodeSchema),
  })
  .superRefine((ir, ctx) => {
    if (!ir.project.locales.includes(ir.project.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        message: `defaultLocale "${ir.project.defaultLocale}" is not listed in project.locales`,
        path: ["project", "defaultLocale"],
      });
    }
    const hashByFile = new Map<string, string>();
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
        const seen = hashByFile.get(source.file);
        if (seen === undefined) {
          hashByFile.set(source.file, source.hash);
        } else if (seen !== source.hash) {
          ctx.addIssue({
            code: "custom",
            message: `source "${source.file}" has conflicting hashes across nodes ("${seen}" vs "${source.hash}")`,
            path: ["nodes", key, "sources", index, "hash"],
          });
        }
      });
    }
  });

export type Source = z.infer<typeof SourceSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Ir = z.infer<typeof IrSchema>;
