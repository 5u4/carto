import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mermaid from 'astro-mermaid'
import { join } from 'node:path'
import { readManifest } from '@carto/core'
import { buildLocales, buildRedirects, buildSidebar } from './dist/site-config.js'
import remarkJoinCjkLines from './dist/remark-join-cjk.js'

const root = process.env.CARTO_ROOT ?? process.cwd()
const manifest = await readManifest(join(root, 'carto.json'))

export default defineConfig({
  outDir: join(root, 'dist-site'),
  redirects: buildRedirects(manifest),
  markdown: {
    remarkPlugins: [remarkJoinCjkLines]
  },
  integrations: [
    mermaid({ autoTheme: true }),
    starlight({
      title: 'Carto',
      locales: buildLocales(manifest),
      sidebar: buildSidebar(manifest)
    })
  ]
})
