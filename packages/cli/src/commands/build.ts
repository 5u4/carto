import { defineCommand } from 'citty'
import { runTemplateScript } from './dev.js'

export const buildCommand = defineCommand({
  meta: { name: 'build', description: 'Build the static site for the current doc root' },
  run() {
    runTemplateScript('build')
  }
})
