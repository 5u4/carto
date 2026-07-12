import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mermaid from 'astro-mermaid'
import { join } from 'node:path'
import { readManifest } from '@carto/core'
import { buildLocales, buildRedirects, buildSidebar, collectTitles, loadUserConfig, mergeStarlight } from './dist/site-config.js'
import remarkJoinCjkLines from './dist/remark-join-cjk.js'

const root = process.env.CARTO_ROOT ?? process.cwd()
const manifest = await readManifest(join(root, 'carto.json'))
const user = await loadUserConfig(root)
const titles = await collectTitles(root, manifest)

export default defineConfig({
  outDir: join(root, 'dist-site'),
  redirects: buildRedirects(manifest),
  markdown: {
    remarkPlugins: [remarkJoinCjkLines]
  },
  integrations: [
    mermaid({ autoTheme: true, enableLog: false }),
    starlight(
      mergeStarlight(user.starlight ?? {}, {
        locales: buildLocales(manifest),
        sidebar: buildSidebar(manifest, titles)
      })
    )
  ]
})
