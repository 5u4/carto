import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import type { Manifest } from './schema.js'

export interface CoverageReport {
  total: number
  covered: number
  uncovered: string[]
}

const DEFAULT_IGNORES = ['.git', 'node_modules/', '/carto.json', '/docs/', '/dist-site/', '.gitignore', '.cartoignore']

const IGNORE_FILES = ['.gitignore', '.cartoignore']

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

async function buildIgnore(rootDir: string): Promise<Ignore> {
  const ig = ignore().add(DEFAULT_IGNORES)
  for (const name of IGNORE_FILES) {
    const content = await readOptional(join(rootDir, name))
    if (content !== undefined) ig.add(content)
  }
  return ig
}

async function walk(rootDir: string, ig: Ignore): Promise<string[]> {
  const files: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = toPosix(relative(rootDir, join(dir, entry.name)))
      if (ig.ignores(rel)) continue
      if (entry.isDirectory()) {
        await recurse(join(dir, entry.name))
      } else if (entry.isFile()) {
        files.push(rel)
      }
    }
  }
  await recurse(rootDir)
  return files
}

export async function coverageReport(manifest: Manifest, rootDir: string): Promise<CoverageReport> {
  const ig = await buildIgnore(rootDir)
  const files = await walk(rootDir, ig)
  const tracked = new Set(manifest.nodes.flatMap((node) => node.sources.map((source) => toPosix(relative(rootDir, join(rootDir, source.file))))))
  const uncovered = files.filter((file) => !tracked.has(file)).sort()
  return { total: files.length, covered: files.length - uncovered.length, uncovered }
}
