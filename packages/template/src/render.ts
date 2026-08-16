import { spawn, type ChildProcess } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, readdir, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { materialize } from './materialize.js'

export interface PreviewOptions {
  host?: string
  port?: number
}

const templateRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const astroConfig = join(templateRoot, 'astro.config.mjs')
const astroCli = join(dirname(createRequire(import.meta.url).resolve('astro/package.json')), 'bin', 'astro.mjs')

export async function buildSite(docRoot: string): Promise<void> {
  const root = resolve(docRoot)
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'carto-render-')))
  const sourceRoot = join(workspace, 'src')
  const contentDir = join(sourceRoot, 'content', 'docs')
  const outputDir = join(workspace, 'output')
  try {
    await mkdir(join(workspace, '.astro', 'cache'), { recursive: true })
    await linkDependencies(workspace, root)
    await mkdir(contentDir, { recursive: true })
    await writeContentConfig(sourceRoot)
    await writeAstroConfig(workspace)
    await materialize(root, contentDir)
    await runAstro(
      ['build', '--root', workspace, '--config', 'astro.config.mjs', '--outDir', outputDir],
      { CARTO_ROOT: root, CARTO_WORKSPACE: workspace }
    )
    await publish(outputDir, join(root, 'dist-site'))
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

export async function previewSite(docRoot: string, options: PreviewOptions = {}): Promise<void> {
  const root = resolve(docRoot)
  const outputDir = join(root, 'dist-site')
  try {
    if (!(await stat(outputDir)).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`No built site found at ${outputDir}; run carto build first`)
  }
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 4321
  if (host.length === 0) throw new Error('Preview host cannot be empty')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid preview port: ${port}`)
  const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'carto-preview-')))
  try {
    const sourceRoot = join(workspace, 'src')
    await mkdir(join(sourceRoot, 'content', 'docs'), { recursive: true })
    await linkDependencies(workspace, root)
    await mkdir(join(workspace, '.astro', 'cache'), { recursive: true })
    await writeContentConfig(sourceRoot)
    await writeAstroConfig(workspace)
    console.log(`Previewing http://${urlHost}:${port}/`)
    await runAstro(
      [
        'preview',
        '--root',
        workspace,
        '--config',
        'astro.config.mjs',
        '--outDir',
        outputDir,
        '--host',
        host,
        '--port',
        String(port)
      ],
      { CARTO_ROOT: root, CARTO_WORKSPACE: workspace },
      true
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

async function linkDependencies(workspace: string, docRoot: string): Promise<void> {
  const destination = join(workspace, 'node_modules')
  const templateDependencies = join(templateRoot, 'node_modules')
  const starlight = await realpath(join(templateDependencies, '@astrojs', 'starlight'))
  await mkdir(destination, { recursive: true })
  await linkPackageDirectory(templateDependencies, destination, starlight)
  await linkPackageDirectory(dirname(dirname(starlight)), destination, starlight)
  const userDependencies = join(docRoot, 'node_modules')
  if (await exists(userDependencies)) await linkPackageDirectory(userDependencies, destination, starlight)
}

async function linkPackageDirectory(source: string, destination: string, copiedPackage: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
    const sourcePath = join(source, entry.name)
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      const scopeDestination = join(destination, entry.name)
      await mkdir(scopeDestination, { recursive: true })
      for (const packageEntry of await readdir(sourcePath, { withFileTypes: true })) {
        if (packageEntry.name.startsWith('.') || (!packageEntry.isDirectory() && !packageEntry.isSymbolicLink())) continue
        await linkPackage(join(sourcePath, packageEntry.name), join(scopeDestination, packageEntry.name), copiedPackage)
      }
      continue
    }
    await linkPackage(sourcePath, join(destination, entry.name), copiedPackage)
  }
}

async function linkPackage(source: string, destination: string, copiedPackage: string): Promise<void> {
  if (await exists(destination)) return
  const resolvedPackage = await realpath(source)
  if (!(await stat(resolvedPackage)).isDirectory()) return
  if (resolvedPackage === copiedPackage) {
    await cp(resolvedPackage, destination, { recursive: true, dereference: true })
  } else {
    await symlink(resolvedPackage, destination, 'dir')
  }
}


async function writeAstroConfig(workspace: string): Promise<void> {
  await writeFile(
    join(workspace, 'astro.config.mjs'),
    `export { default } from ${JSON.stringify(pathToFileURL(astroConfig).href)}\n`,
    'utf8'
  )
}

async function writeContentConfig(sourceRoot: string): Promise<void> {
  const contentConfig = pathToFileURL(join(templateRoot, 'dist', 'content.config.js')).href
  await writeFile(join(sourceRoot, 'content.config.ts'), `export { collections } from ${JSON.stringify(contentConfig)}\n`, 'utf8')
}

async function publish(source: string, destination: string): Promise<void> {
  const token = randomUUID()
  const parent = dirname(destination)
  const staging = join(parent, `.carto-dist-site-${token}`)
  const backup = join(parent, `.carto-dist-site-backup-${token}`)
  let previousMoved = false
  let published = false
  try {
    await cp(source, staging, { recursive: true })
    if (await exists(destination)) {
      await rename(destination, backup)
      previousMoved = true
    }
    try {
      await rename(staging, destination)
      published = true
    } catch (error) {
      if (previousMoved) {
        await rename(backup, destination)
        previousMoved = false
      }
      throw error
    }
    if (previousMoved) {
      await rm(backup, { recursive: true, force: true })
      previousMoved = false
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
    if (published || !previousMoved) await rm(backup, { recursive: true, force: true })
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function runAstro(args: string[], env: Record<string, string>, terminationIsSuccess = false): Promise<void> {
  const nodePath = [join(templateRoot, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter)
  const child = spawn(process.execPath, [astroCli, ...args], {
    cwd: env.CARTO_WORKSPACE ?? templateRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env, NODE_PATH: nodePath }
  })
  let terminationRequested = false
  const handlers = (['SIGINT', 'SIGTERM'] as const).map((signal) => ({
    signal,
    forward: () => {
      terminationRequested = true
      child.kill(signal)
    }
  }))
  for (const handler of handlers) process.on(handler.signal, handler.forward)
  try {
    const result = await childResult(child)
    if (result.code === 0 || (terminationIsSuccess && terminationRequested)) return
    const outcome = result.signal === null ? `exit code ${result.code ?? 1}` : `signal ${result.signal}`
    throw new Error(`Astro ${args[0]} failed with ${outcome}`)
  } finally {
    for (const handler of handlers) process.off(handler.signal, handler.forward)
  }
}

function childResult(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveResult, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveResult({ code, signal }))
  })
}
