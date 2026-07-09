import { childrenOf, nodesById, slugOf, urlPath, type Manifest, type Node } from '@carto/core'

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
