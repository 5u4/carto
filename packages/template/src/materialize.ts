import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { childrenOf, codeRootDir, readManifest, resolveCartoLink, rootChain, slugOf, statusReport, type Manifest, type Node, type NodeStatus } from '@carto/core'
import { injectStalenessBanner } from './staleness-banner.js'
import { collectTitles } from './site-config.js'

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = join(here, '..', 'src', 'content', 'docs')

async function main(): Promise<void> {
  const root = process.env.CARTO_ROOT ?? process.cwd()
  const manifest = await readManifest(join(root, 'carto.json'))
  await rm(contentDir, { recursive: true, force: true })
  await mkdir(contentDir, { recursive: true })
  if (childrenOf(manifest.nodes, null).length === 0) {
    await writeEmptyState(root)
    return
  }
  const titles = await collectTitles(root, manifest)
  const freshness = new Map((await statusReport(manifest, codeRootDir(manifest, root))).map((s): [string, NodeStatus] => [s.id, s]))
  for (const node of manifest.nodes) {
    for (const locale of manifest.locales) {
      const source = join(root, 'docs', node.id, `${locale}.mdx`)
      const raw = await readFile(source, 'utf8')
      const rewritten = rewriteLinks(raw, manifest, locale, titles)
      const withBanner = injectStalenessBanner(rewritten, freshness.get(node.id))
      const target = targetPath(manifest, node, locale)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, withBanner, 'utf8')
    }
  }
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
    'This carto site has no pages. To add your first one, run:',
    '',
    '```',
    'carto document <dir-or-files>',
    '```',
    '',
    'Then run `carto dev` again.',
    ''
  ]
  await writeFile(join(contentDir, 'index.mdx'), lines.join('\n'), 'utf8')
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

await main()
