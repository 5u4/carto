import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { join } from 'node:path'
import { readManifest } from '@carto/core'
import { buildLocales, buildSidebar } from './dist/site-config.js'

const root = process.env.CARTO_ROOT ?? process.cwd()
const manifest = await readManifest(join(root, 'carto.json'))

export default defineConfig({
  outDir: join(root, 'dist-site'),
  integrations: [
    starlight({
      title: 'Carto',
      locales: buildLocales(manifest),
      sidebar: buildSidebar(manifest)
    })
  ]
})
