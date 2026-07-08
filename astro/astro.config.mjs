import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  outDir: process.env.CARTO_OUT_DIR ?? "../dist-site",
  integrations: [mdx()],
  markdown: {
    shikiConfig: { theme: "github-light" },
  },
});
