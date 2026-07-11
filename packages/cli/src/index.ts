#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { initCommand } from './commands/init.js'
import { statusCommand } from './commands/status.js'
import { syncCommand } from './commands/sync.js'
import { coverageCommand } from './commands/coverage.js'
import { validateCommand } from './commands/validate.js'
import { devCommand } from './commands/dev.js'
import { buildCommand } from './commands/build.js'

const main = defineCommand({
  meta: { name: 'carto', description: 'Generate and maintain carto documentation' },
  subCommands: {
    init: initCommand,
    status: statusCommand,
    sync: syncCommand,
    coverage: coverageCommand,
    validate: validateCommand,
    dev: devCommand,
    build: buildCommand
  }
})

runMain(main)
