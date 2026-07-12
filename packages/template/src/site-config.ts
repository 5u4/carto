import { childrenOf, nodesById, slugOf, urlPath, type Manifest, type Node } from '@carto/core'
import { existsSync } from 'node:fs'
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
}

export function buildSidebar(manifest: Manifest): SidebarEntry[] {
  return childrenOf(manifest.nodes, null).map((node) => entryFor(manifest, node))
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

function entryFor(manifest: Manifest, node: Node): SidebarEntry {
  const self: SidebarEntry = { label: slugOf(node), link: urlPath(manifest, node.id, manifest.defaultLocale) }
  const kids = childrenOf(manifest.nodes, node.id)
  if (kids.length === 0) return self
  return { label: slugOf(node), items: [self, ...kids.map((kid) => entryFor(manifest, kid))] }
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
  const userCss = Array.isArray(user.customCss) ? user.customCss : []
  return {
    title: 'Carto',
    ...user,
    customCss: [...userCss, './src/carto.css'],
    locales: owned.locales,
    sidebar: owned.sidebar
  }
}
