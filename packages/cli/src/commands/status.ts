import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readManifest, statusReport } from '@carto/core'

export const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Report each node\'s freshness' },
  async run() {
    const root = process.cwd()
    const manifest = await readManifest(join(root, 'carto.json'))
    const report = await statusReport(manifest, root)
    for (const node of report) {
      console.log(`${node.state.padEnd(9)} ${node.id}`)
    }
    const anyNotFresh = report.some((node) => node.state !== 'fresh')
    process.exit(anyNotFresh ? 1 : 0)
  }
})
