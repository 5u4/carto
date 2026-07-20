import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  childrenOf,
  codeRootDir,
  loadGraph,
  parseCartoLink,
  resolveCartoLink,
  rootChain,
  statusReport,
  type DocSet,
  type FederationContext,
  type Graph,
  type Manifest,
  type Node,
  type NodeStatus
} from '@carto/core'
import { injectStalenessBanner } from './staleness-banner.js'
import { collectGraphTitles } from './site-config.js'

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = join(here, '..', 'src', 'content', 'docs')

async function main(): Promise<void> {
  const root = process.env.CARTO_ROOT ?? process.cwd()
  const graph = await loadGraph(root)
  await rm(contentDir, { recursive: true, force: true })
  await mkdir(contentDir, { recursive: true })
  if (childrenOf(graph.root.manifest.nodes, null).length === 0 && !graph.federated) {
    await writeEmptyState(root)
    return
  }
  const siteLocales = graph.root.manifest.locales
  const siteDefaultLocale = graph.root.manifest.defaultLocale
  const titles = await collectGraphTitles(graph)
  const freshness = await collectFreshness(graph)
  for (const docSet of graph.byHash.values()) {
    const federation: FederationContext = { byHash: graph.byHash, aliasToHash: docSet.aliasToHash, siteDefaultLocale }
    for (const node of docSet.manifest.nodes) {
      for (const locale of siteLocales) {
        const contentLocale = docSet.manifest.locales.includes(locale) ? locale : docSet.manifest.defaultLocale
        if (contentLocale !== locale) {
          console.warn(`warning: doc-set "${docSet.prefix || 'self'}" node ${node.id} has no ${locale} locale; falling back to ${contentLocale}`)
        }
        const source = join(docSet.docRoot, 'docs', node.id, `${contentLocale}.mdx`)
        const raw = await readFile(source, 'utf8')
        const rewritten = rewriteLinks(raw, docSet, locale, siteDefaultLocale, titles, federation)
        const withBanner = injectStalenessBanner(rewritten, freshness.get(`${docSet.hash}:${node.id}`))
        const target = targetPath(docSet, node, locale, siteDefaultLocale)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, withBanner, 'utf8')
      }
    }
  }
}

async function collectFreshness(graph: Graph): Promise<Map<string, NodeStatus>> {
  const freshness = new Map<string, NodeStatus>()
  for (const docSet of graph.byHash.values()) {
    const report = await statusReport(docSet.manifest, codeRootDir(docSet.manifest, docSet.docRoot))
    for (const status of report) freshness.set(`${docSet.hash}:${status.id}`, status)
  }
  return freshness
}


async function writeEmptyState(root: string): Promise<void> {
  const title = basename(root).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const lines = [
    '---',
    `title: "${title}"`,
    '---',
    '',
    '# Nothing here yet',
    '',
    'This carto site has no pages yet. carto documents a codebase through a',
    'coding agent: ask your agent to document your code with carto and tell it',
    'what to cover — the scope. For example:',
    '',
    '```',
    '/carto document the auth module',
    '```',
    '',
    'The agent reads the code, writes the pages, and runs the carto CLI for you.',
    'Once it has generated pages, run `carto dev` again.',
    ''
  ]
  await writeFile(join(contentDir, 'index.mdx'), lines.join('\n'), 'utf8')
}

function targetPath(docSet: DocSet, node: Node, locale: string, siteDefaultLocale: string): string {
  const chain = rootChain(docSet.manifest.nodes, node.id).map((n) => n.id).join('/')
  const localePrefix = locale === siteDefaultLocale ? '' : `${locale}/`
  const docPrefix = docSet.prefix ? `${docSet.prefix.slice(1)}/` : ''
  return join(contentDir, `${localePrefix}${docPrefix}${chain}.mdx`)
}

function rewriteLinks(
  mdx: string,
  docSet: DocSet,
  locale: string,
  siteDefaultLocale: string,
  titles: Map<string, string>,
  federation: FederationContext
): string {
  return mdx.replace(/(\[)([^\]]*)(\]\()(carto:[^)\s]+)(\))/g, (whole, open, label, mid, target, close) => {
    const result = resolveCartoLink(target, { manifest: docSet.manifest, locale, prefix: docSet.prefix, federation })
    if (!result.ok) return whole
    const text = label.length > 0 ? label : titleFor(target, docSet, result.id, locale, titles, federation)
    return `${open}${text}${mid}${result.url}${close}`
  })
}

function titleFor(
  target: string,
  docSet: DocSet,
  id: string,
  locale: string,
  titles: Map<string, string>,
  federation: FederationContext
): string {
  const parsed = parseCartoLink(target)
  const targetDocSet = parsed?.kind === 'federation' ? federation.byHash.get(federation.aliasToHash.get(parsed.alias) ?? '') : docSet
  if (!targetDocSet) return id
  return (
    titles.get(`${targetDocSet.hash}:${id}:${locale}`) ??
    titles.get(`${targetDocSet.hash}:${id}:${targetDocSet.manifest.defaultLocale}`) ??
    id
  )
}

await main()
