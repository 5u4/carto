import { defineCommand } from 'citty'
import { previewSite } from '@carto/template'

export const previewCommand = defineCommand({
  meta: { name: 'preview', description: 'Serve the existing static site for the current doc root' },
  args: {
    host: { type: 'string', description: 'Host address to bind', default: '127.0.0.1' },
    port: { type: 'string', description: 'Port to bind', default: '4321' }
  },
  async run({ args }) {
    try {
      await previewSite(process.cwd(), { host: args.host, port: Number(args.port) })
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }
})
