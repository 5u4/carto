import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readManifest, syncManifest, writeManifest, ManifestError } from '@carto/core'

export const syncCommand = defineCommand({
  meta: { name: 'sync', description: 'Recompute and write every source hash' },
  async run() {
    const root = process.cwd()
    const path = join(root, 'carto.json')
    try {
      const manifest = await readManifest(path)
      const synced = await syncManifest(manifest, { rootDir: root })
      await writeManifest(path, synced)
      console.log(`synced ${synced.nodes.length} node(s)`)
    } catch (error) {
      console.error(error instanceof ManifestError ? error.message : String(error))
      process.exit(1)
    }
  }
})
