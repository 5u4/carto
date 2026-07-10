import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readManifest, statusReport, ManifestError, type Manifest } from '@carto/core'

export const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Report each node\'s freshness' },
  async run() {
    const root = process.cwd()
    let manifest: Manifest
    try {
      manifest = await readManifest(join(root, 'carto.json'))
    } catch (error) {
      console.error(`error: ${error instanceof ManifestError ? error.message : String(error)}`)
      process.exit(1)
    }
    const report = await statusReport(manifest, root)
    for (const node of report) {
      console.log(`${node.state.padEnd(9)} ${node.id}`)
      if (node.state !== 'fresh') {
        for (const source of node.sources) {
          if (source.state !== 'fresh') {
            const anchor = source.commit ? ` (was ${source.commit.slice(0, 7)})` : ''
            console.log(`  ${source.state.padEnd(7)} ${source.file}${anchor}`)
          }
        }
      }
    }
    const anyNotFresh = report.some((node) => node.state !== 'fresh')
    process.exit(anyNotFresh ? 1 : 0)
  }
})
