import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readManifest, resolveCartoLink, rootChain, slugOf, type Manifest, type Node } from '@carto/core'

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = join(here, '..', 'src', 'content', 'docs')

async function main(): Promise<void> {
  const root = process.env.CARTO_ROOT ?? process.cwd()
  const manifest = await readManifest(join(root, 'carto.json'))
  await rm(contentDir, { recursive: true, force: true })
  await mkdir(contentDir, { recursive: true })
  const titles = await collectTitles(root, manifest)
  for (const node of manifest.nodes) {
    for (const locale of manifest.locales) {
      const source = join(root, 'docs', node.id, `${locale}.mdx`)
      const raw = await readFile(source, 'utf8')
      const rewritten = rewriteLinks(raw, manifest, locale, titles)
      const target = targetPath(manifest, node, locale)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, rewritten, 'utf8')
    }
  }
}

function targetPath(manifest: Manifest, node: Node, locale: string): string {
  const chain = rootChain(manifest.nodes, node.id).map((n) => slugOf(n)).join('/')
  const prefix = locale === manifest.defaultLocale ? '' : `${locale}/`
  return join(contentDir, `${prefix}${chain}.mdx`)
}

function rewriteLinks(mdx: string, manifest: Manifest, locale: string, titles: Map<string, string>): string {
  return mdx.replace(/(\[)([^\]]*)(\]\()(carto:[^)\s]+)(\))/g, (whole, open, label, mid, target, close) => {
    const result = resolveCartoLink(target, { manifest, locale })
    if (!result.ok) return whole
    const text = label.length > 0 ? label : (titles.get(`${result.id}:${locale}`) ?? result.id)
    return `${open}${text}${mid}${result.url}${close}`
  })
}

async function collectTitles(root: string, manifest: Manifest): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  for (const node of manifest.nodes) {
    for (const locale of manifest.locales) {
      const source = join(root, 'docs', node.id, `${locale}.mdx`)
      const raw = await readFile(source, 'utf8')
      const title = extractTitle(raw)
      if (title) titles.set(`${node.id}:${locale}`, title)
    }
  }
  return titles
}

function extractTitle(mdx: string): string | undefined {
  const match = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  const frontmatter = match[1] ?? ''
  const titleLine = frontmatter.split(/\r?\n/).find((line) => /^title:/.test(line))
  if (!titleLine) return undefined
  const value = titleLine.slice(titleLine.indexOf(':') + 1).trim()
  return stripQuotes(value)
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

await main()
