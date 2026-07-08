import { defineCommand } from 'citty'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

function templateDir(): string | null {
  try {
    const require = createRequire(import.meta.url)
    return dirname(require.resolve('@carto/template/package.json'))
  } catch {
    return null
  }
}

export function runTemplateScript(command: 'dev' | 'build'): void {
  const dir = templateDir()
  if (!dir) {
    console.error('@carto/template is not available; run pnpm build first')
    process.exit(1)
  }
  const script = command === 'build' ? 'build:site' : 'dev'
  const child = spawn('pnpm', ['run', script], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, CARTO_ROOT: process.cwd() }
  })
  child.on('error', () => {
    console.error('error: failed to spawn pnpm; is pnpm installed and on your PATH?')
    process.exit(1)
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}
export const devCommand = defineCommand({
  meta: { name: 'dev', description: 'Preview the site for the current doc root' },
  run() {
    runTemplateScript('dev')
  }
})
