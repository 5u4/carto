import { defineCommand } from 'citty'
import { initCommand } from './commands/init.js'
import { statusCommand } from './commands/status.js'
import { syncCommand } from './commands/sync.js'
import { coverageCommand } from './commands/coverage.js'
import { validateCommand } from './commands/validate.js'
import { previewCommand } from './commands/preview.js'
import { buildCommand } from './commands/build.js'

export const mainCommand = defineCommand({
  meta: { name: 'carto', description: 'Generate and maintain carto documentation' },
  subCommands: {
    init: initCommand,
    status: statusCommand,
    sync: syncCommand,
    coverage: coverageCommand,
    validate: validateCommand,
    preview: previewCommand,
    build: buildCommand
  }
})
