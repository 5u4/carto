import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { contentDir } from "./lib/carto";

const nodes = defineCollection({
  loader: glob({ pattern: "*.mdx", base: `${contentDir}/nodes` }),
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    locale: z.string().min(1),
    contentHash: z.string().min(1),
  }),
});

export const collections = { nodes };
