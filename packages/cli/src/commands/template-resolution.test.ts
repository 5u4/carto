import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const testFilePath = fileURLToPath(import.meta.url)

function resolveTemplateManifest(): string {
  const script = `console.log(require('node:module').createRequire(${JSON.stringify(testFilePath)}).resolve('@carto/template/package.json'))`
  const env = { ...process.env }
  delete env.NODE_PATH
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', env }).trim().split('\\').join('/')
}

describe('template resolution', () => {
  it('resolves @carto/template/package.json from the CLI module context', () => {
    expect(() => resolveTemplateManifest()).not.toThrow()
  })

  it('resolves to the template package manifest on disk', () => {
    expect(resolveTemplateManifest()).toMatch(/packages\/template\/package\.json$/)
  })
})
