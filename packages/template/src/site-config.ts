import { childrenOf, nodesById, slugOf, urlPath, type Graph, type DocSet, type Manifest, type Node } from '@carto/core'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function buildLocales(manifest: Manifest): Record<string, { label: string; lang: string }> {
  const locales: Record<string, { label: string; lang: string }> = {}
  for (const locale of manifest.locales) {
    const key = locale === manifest.defaultLocale ? 'root' : locale
    locales[key] = { label: locale, lang: locale }
  }
  return locales
}

export interface SidebarEntry {
  label: string
  link?: string
  items?: SidebarEntry[]
  translations?: Record<string, string>
}

export function buildSidebar(
  manifest: Manifest,
  titles: Map<string, string> = new Map(),
  prefix = '',
  siteDefault = manifest.defaultLocale,
  keyPrefix = ''
): SidebarEntry[] {
  return childrenOf(manifest.nodes, null).map((node) => entryFor(manifest, node, titles, prefix, siteDefault, keyPrefix))
}

export function buildGraphSidebar(graph: Graph, titles: Map<string, string> = new Map()): SidebarEntry[] {
  const root = graph.root
  const entries = buildSidebar(root.manifest, titles, root.prefix, root.manifest.defaultLocale, `${root.hash}:`)
  const children = [...graph.byHash.values()].filter((ds) => ds !== root).sort((a, b) => a.prefix.localeCompare(b.prefix))
  for (const ds of children) {
    const items = buildSidebar(ds.manifest, titles, ds.prefix, root.manifest.defaultLocale, `${ds.hash}:`)
    entries.push({ label: docSetLabel(ds, titles), items })
  }
  return entries
}

function docSetLabel(ds: DocSet, titles: Map<string, string>): string {
  const homeId = resolveHomeId(ds.manifest)
  const prefixName = ds.prefix.startsWith('/') ? ds.prefix.slice(1) : ds.prefix
  if (!homeId) return prefixName
  return titles.get(`${ds.hash}:${homeId}:${ds.manifest.defaultLocale}`) ?? prefixName
}

export function buildRedirects(manifest: Manifest, prefix = '', siteDefault = manifest.defaultLocale): Record<string, string> {
  const homeId = resolveHomeId(manifest)
  if (!homeId) return {}
  const redirects: Record<string, string> = {}
  for (const locale of manifest.locales) {
    const from = locale === siteDefault ? '/' : `/${locale}/`
    redirects[from] = urlPath(manifest, homeId, locale, prefix, siteDefault)
  }
  return redirects
}

export function buildGraphRedirects(graph: Graph): Record<string, string> {
  return buildRedirects(graph.root.manifest, graph.root.prefix, graph.root.manifest.defaultLocale)
}

function resolveHomeId(manifest: Manifest): string | undefined {
  if (manifest.home && nodesById(manifest.nodes).has(manifest.home)) return manifest.home
  return childrenOf(manifest.nodes, null)[0]?.id
}

function labelFor(manifest: Manifest, node: Node, titles: Map<string, string>, keyPrefix: string): Pick<SidebarEntry, 'label' | 'translations'> {
  const label = titles.get(`${keyPrefix}${node.id}:${manifest.defaultLocale}`) ?? slugOf(node)
  let translations: Record<string, string> | undefined
  for (const locale of manifest.locales) {
    if (locale === manifest.defaultLocale) continue
    const translated = titles.get(`${keyPrefix}${node.id}:${locale}`)
    if (translated) (translations ??= {})[locale] = translated
  }
  return translations ? { label, translations } : { label }
}

function entryFor(manifest: Manifest, node: Node, titles: Map<string, string>, prefix: string, siteDefault: string, keyPrefix: string): SidebarEntry {
  const heading = labelFor(manifest, node, titles, keyPrefix)
  const self: SidebarEntry = { ...heading, link: urlPath(manifest, node.id, siteDefault, prefix, siteDefault) }
  const kids = childrenOf(manifest.nodes, node.id)
  if (kids.length === 0) return self
  return { ...heading, items: [self, ...kids.map((kid) => entryFor(manifest, kid, titles, prefix, siteDefault, keyPrefix))] }
}

export async function collectTitles(root: string, manifest: Manifest, keyPrefix = ''): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  await collectInto(titles, root, manifest, keyPrefix)
  return titles
}

export async function collectGraphTitles(graph: Graph): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  for (const ds of graph.byHash.values()) {
    await collectInto(titles, ds.docRoot, ds.manifest, `${ds.hash}:`)
  }
  return titles
}

async function collectInto(titles: Map<string, string>, root: string, manifest: Manifest, keyPrefix: string): Promise<void> {
  for (const node of manifest.nodes) {
    for (const locale of manifest.locales) {
      const raw = await readFile(join(root, 'docs', node.id, `${locale}.mdx`), 'utf8')
      const title = extractTitle(raw)
      if (title) titles.set(`${keyPrefix}${node.id}:${locale}`, title)
    }
  }
}

function extractTitle(mdx: string): string | undefined {
  const match = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  const frontmatter = match[1] ?? ''
  const titleLine = frontmatter.split(/\r?\n/).find((line) => /^title:/.test(line))
  if (!titleLine) return undefined
  return stripQuotes(titleLine.slice(titleLine.indexOf(':') + 1).trim())
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

export interface StarlightOptions {
  [key: string]: unknown
}

export interface UserConfig {
  starlight?: StarlightOptions
}

export interface OwnedStarlight {
  locales: Record<string, { label: string; lang: string }>
  sidebar: SidebarEntry[]
}

const userConfigNames = ['carto.config.mjs', 'carto.config.js']

export async function loadUserConfig(root: string): Promise<UserConfig> {
  for (const name of userConfigNames) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    let loaded: { default?: unknown }
    try {
      loaded = await import(/* @vite-ignore */ pathToFileURL(path).href)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`carto: failed to load ${name}: ${message}`)
    }
    return validateUserConfig(loaded.default, name)
  }
  return {}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateUserConfig(value: unknown, name: string): UserConfig {
  if (!isPlainObject(value)) {
    throw new Error(`carto: ${name} must default-export an object`)
  }
  if (value.starlight != null && !isPlainObject(value.starlight)) {
    throw new Error(`carto: ${name} "starlight" must be an object`)
  }
  return value as UserConfig
}

export function mergeStarlight(user: StarlightOptions, owned: OwnedStarlight): StarlightOptions {
  return {
    title: 'Carto',
    ...user,
    locales: owned.locales,
    sidebar: owned.sidebar
  }
}
