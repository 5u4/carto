import { defineCommand } from 'citty'
import { buildSite } from '@carto/template'

export const buildCommand = defineCommand({
  meta: { name: 'build', description: 'Build the static site for the current doc root' },
  async run() {
    try {
      await buildSite(process.cwd())
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }
})
