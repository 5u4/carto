import { defineCommand } from 'citty'
import { join } from 'node:path'
import { readManifest, coverageReport, codeRootDir, ManifestError, type Manifest } from '@carto/core'

export const coverageCommand = defineCommand({
  meta: { name: 'coverage', description: 'Report files not covered by any node source' },
  args: {
    failOnUncovered: { type: 'boolean', description: 'Exit non-zero when any file is uncovered', default: false }
  },
  async run({ args }) {
    const root = process.cwd()
    let manifest: Manifest
    try {
      manifest = await readManifest(join(root, 'carto.json'))
    } catch (error) {
      console.error(`error: ${error instanceof ManifestError ? error.message : String(error)}`)
      process.exit(1)
    }
    const report = await coverageReport(manifest, codeRootDir(manifest, root), root)
    const percent = report.total === 0 ? '100.0' : ((report.covered / report.total) * 100).toFixed(1)
    console.log(`covered   ${report.covered} / ${report.total} files (${percent}%)`)
    if (report.uncovered.length === 0) {
      console.log(report.total === 0 ? '\nno documentable files found' : '\nall files covered')
    } else {
      console.log('\nuncovered:')
      for (const file of report.uncovered) console.log(`  ${file}`)
    }
    process.exit(args.failOnUncovered && report.uncovered.length > 0 ? 1 : 0)
  }
})
