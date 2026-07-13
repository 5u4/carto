import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mermaid from 'astro-mermaid'
import { join } from 'node:path'
import { loadGraph } from '@carto/core'
import { buildLocales, buildGraphRedirects, buildGraphSidebar, collectGraphTitles, loadUserConfig, mergeStarlight } from './dist/site-config.js'
import remarkJoinCjkLines from './dist/remark-join-cjk.js'

const root = process.env.CARTO_ROOT ?? process.cwd()
const graph = await loadGraph(root)
const user = await loadUserConfig(root)
const titles = await collectGraphTitles(graph)

export default defineConfig({
  outDir: join(root, 'dist-site'),
  redirects: buildGraphRedirects(graph),
  markdown: {
    remarkPlugins: [remarkJoinCjkLines]
  },
  integrations: [
    mermaid({ autoTheme: true, enableLog: false }),
    starlight(
      mergeStarlight(user.starlight ?? {}, {
        locales: buildLocales(graph.root.manifest),
        sidebar: buildGraphSidebar(graph, titles)
      })
    )
  ]
})
