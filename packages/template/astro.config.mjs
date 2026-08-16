import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mermaid from 'astro-mermaid'
import { join } from 'node:path'
import { loadGraph } from '@carto/core'
import { buildLocales, buildGraphRedirects, buildGraphSidebar, collectGraphTitles, loadUserConfig, mergeStarlight } from './dist/site-config.js'
import remarkJoinCjkLines from './dist/remark-join-cjk.js'

const docRoot = process.env.CARTO_ROOT ?? process.cwd()
const workspaceRoot = process.env.CARTO_WORKSPACE ?? process.cwd()
const graph = await loadGraph(docRoot)
const user = await loadUserConfig(docRoot)
const titles = await collectGraphTitles(graph)

export default defineConfig({
  srcDir: join(workspaceRoot, 'src'),
  cacheDir: join(workspaceRoot, '.astro', 'cache'),
  outDir: join(docRoot, 'dist-site'),
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
