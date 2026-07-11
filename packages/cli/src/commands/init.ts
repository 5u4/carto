import { defineCommand } from 'citty'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serializeManifest, parseManifest, ManifestError, type Manifest } from '@carto/core'

export const initCommand = defineCommand({
  meta: { name: 'init', description: 'Scaffold carto.json and docs/ in the current directory' },
  args: {
    locales: { type: 'string', description: 'Comma-separated locales', default: 'en' },
    defaultLocale: { type: 'string', description: 'Default locale', default: 'en' }
  },
  async run({ args }) {
    const root = process.cwd()
    const manifestPath = join(root, 'carto.json')
    if (await exists(manifestPath)) {
      console.error('carto.json already exists; refusing to overwrite')
      process.exit(1)
    }
    const locales = args.locales.split(',').map((l) => l.trim()).filter(Boolean)
    const manifest: Manifest = {
      version: 1,
      locales,
      defaultLocale: args.defaultLocale,
      updated_at: new Date().toISOString(),
      nodes: []
    }
    try {
      parseManifest(manifest)
    } catch (error) {
      console.error(`error: ${error instanceof ManifestError ? error.message : String(error)}`)
      process.exit(1)
    }
    await mkdir(join(root, 'docs'), { recursive: true })
    await writeFile(manifestPath, serializeManifest(manifest), 'utf8')
    const configPath = join(root, 'carto.config.mjs')
    const wroteConfig = !(await exists(configPath))
    if (wroteConfig) await writeFile(configPath, configStub(), 'utf8')
    const configNote = wroteConfig ? ' and carto.config.mjs' : ''
    console.log(`initialized carto.json (locales: ${locales.join(', ')}), docs/${configNote}`)
  }
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function configStub(): string {
  const star = '*'
  const open = `/${star}${star}`
  const close = `${star}/`
  const jsdoc = `${open} @type {{ starlight?: import('@astrojs/starlight/types').StarlightUserConfig }} ${close}`
  return [
    jsdoc,
    'export default {',
    '  starlight: {}',
    '}',
    ''
  ].join('\n')
}
