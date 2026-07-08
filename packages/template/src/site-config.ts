import { childrenOf, slugOf, urlPath, type Manifest, type Node } from '@carto/core'

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

function entryFor(manifest: Manifest, node: Node): SidebarEntry {
  const self: SidebarEntry = { label: slugOf(node), link: urlPath(manifest, node.id, manifest.defaultLocale) }
  const kids = childrenOf(manifest.nodes, node.id)
  if (kids.length === 0) return self
  return { label: slugOf(node), items: [self, ...kids.map((kid) => entryFor(manifest, kid))] }
}
