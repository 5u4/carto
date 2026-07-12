import { childrenOf, nodesById, slugOf, urlPath, type Manifest, type Node } from '@carto/core'
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

export function buildSidebar(manifest: Manifest, titles: Map<string, string> = new Map()): SidebarEntry[] {
  return childrenOf(manifest.nodes, null).map((node) => entryFor(manifest, node, titles))
}

export function buildRedirects(manifest: Manifest): Record<string, string> {
  const homeId = resolveHomeId(manifest)
  if (!homeId) return {}
  const redirects: Record<string, string> = {}
  for (const locale of manifest.locales) {
    const from = locale === manifest.defaultLocale ? '/' : `/${locale}/`
    redirects[from] = urlPath(manifest, homeId, locale)
  }
  return redirects
}

function resolveHomeId(manifest: Manifest): string | undefined {
  if (manifest.home && nodesById(manifest.nodes).has(manifest.home)) return manifest.home
  return childrenOf(manifest.nodes, null)[0]?.id
}

function labelFor(manifest: Manifest, node: Node, titles: Map<string, string>): Pick<SidebarEntry, 'label' | 'translations'> {
  const label = titles.get(`${node.id}:${manifest.defaultLocale}`) ?? slugOf(node)
  const translations: Record<string, string> = {}
  for (const locale of manifest.locales) {
    if (locale === manifest.defaultLocale) continue
    const translated = titles.get(`${node.id}:${locale}`)
    if (translated) translations[locale] = translated
  }
  return Object.keys(translations).length > 0 ? { label, translations } : { label }
}

function entryFor(manifest: Manifest, node: Node, titles: Map<string, string>): SidebarEntry {
  const heading = labelFor(manifest, node, titles)
  const self: SidebarEntry = { ...heading, link: urlPath(manifest, node.id, manifest.defaultLocale) }
  const kids = childrenOf(manifest.nodes, node.id)
  if (kids.length === 0) return self
  return { ...heading, items: [self, ...kids.map((kid) => entryFor(manifest, kid, titles))] }
}

export async function collectTitles(root: string, manifest: Manifest): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  for (const node of manifest.nodes) {
    for (const locale of manifest.locales) {
      const raw = await readFile(join(root, 'docs', node.id, `${locale}.mdx`), 'utf8')
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
