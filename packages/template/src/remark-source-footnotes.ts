import { resolve } from 'node:path'
import type { Graph } from '@carto/core'
import { targetPath } from './materialize.js'

interface MdNode {
  type: string
  value?: string
  identifier?: string
  label?: string
  children?: MdNode[]
}

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

interface FileLike {
  path?: string
  history?: string[]
}

export interface SourceFootnotePage {
  locale: string
  sources: string[]
}

export type SourceFootnotePages = Map<string, SourceFootnotePage>

interface SourceFootnoteOptions {
  pages: SourceFootnotePages
}

interface Citation {
  address: string
  path: string
  lineQualified: boolean
}

const generatedIdentifierPrefix = 'carto-source-'
const skippedParents = new Set(['code', 'definition', 'footnoteDefinition', 'link', 'linkReference'])

export function sourceFootnotePages(graph: Graph, contentDir: string): SourceFootnotePages {
  const pages: SourceFootnotePages = new Map()
  const siteLocales = graph.root.manifest.locales
  const siteDefaultLocale = graph.root.manifest.defaultLocale
  for (const docSet of graph.byHash.values()) {
    for (const node of docSet.manifest.nodes) {
      for (const locale of siteLocales) {
        pages.set(resolve(targetPath(contentDir, docSet, node, locale, siteDefaultLocale)), {
          locale,
          sources: node.sources.map((source) => source.file)
        })
      }
    }
  }
  return pages
}

export default function remarkSourceFootnotes(options: SourceFootnoteOptions): (tree: MdNode, file: FileLike) => void {
  return (tree, file) => {
    const page = findPage(options.pages, file)
    const trackedSources = new Set(page?.sources ?? [])
    const displayNames = shortestUniqueSourceNames(trackedSources)
    const identifiers = collectFootnoteIdentifiers(tree)
    const citations = new Map<string, string>()
    const definitions: MdNode[] = []
    let nextIdentifier = 1

    const identifierFor = (address: string): string => {
      const existing = citations.get(address)
      if (existing) return existing
      let identifier = `${generatedIdentifierPrefix}${nextIdentifier++}`
      while (identifiers.has(identifier)) identifier = `${generatedIdentifierPrefix}${nextIdentifier++}`
      identifiers.add(identifier)
      citations.set(address, identifier)
      definitions.push({
        type: 'footnoteDefinition',
        identifier,
        label: identifier,
        children: [{ type: 'paragraph', children: [{ type: 'inlineCode', value: address }] }]
      })
      return identifier
    }

    transformChildren(tree, trackedSources, displayNames, identifierFor)
    if (definitions.length > 0) tree.children?.push(...definitions)
  }
}

export function rehypeSourceFootnoteLabels(options: SourceFootnoteOptions): (tree: HastNode, file: FileLike) => void {
  return (tree, file) => {
    const page = findPage(options.pages, file)
    const labels = sourceLabels(page?.locale)
    walkHast(tree, (node) => {
      if (node.tagName !== 'section' || !hasProperty(node, 'dataFootnotes')) return
      const itemIds = collectListItemIds(node)
      const hasSources = itemIds.some((id) => id.includes(`fn-${generatedIdentifierPrefix}`))
      if (!hasSources) return
      const hasNotes = itemIds.some((id) => !id.includes(`fn-${generatedIdentifierPrefix}`))
      const heading = node.children?.find((child) => child.tagName === 'h2')
      if (!heading) return
      heading.children = [{ type: 'text', value: hasNotes ? labels.combined : labels.sources }]
      const className = heading.properties?.className
      if (Array.isArray(className)) {
        const visibleClasses = className.filter((name) => name !== 'sr-only')
        if (visibleClasses.length > 0) heading.properties = { ...heading.properties, className: visibleClasses }
        else if (heading.properties) delete heading.properties.className
      }
    })
  }
}

function transformChildren(
  node: MdNode,
  trackedSources: Set<string>,
  displayNames: Map<string, string>,
  identifierFor: (address: string) => string
): void {
  if (!node.children || skippedParents.has(node.type) || node.type.startsWith('mdxJsx')) return
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index]
    if (child.type !== 'inlineCode' || typeof child.value !== 'string') {
      transformChildren(child, trackedSources, displayNames, identifierFor)
      continue
    }
    const citation = parseCitation(child.value, trackedSources)
    if (!citation) continue
    const identifier = identifierFor(citation.address)
    const reference: MdNode = { type: 'footnoteReference', identifier, label: identifier }
    if (citation.lineQualified) {
      node.children.splice(index, 1, reference)
      continue
    }
    node.children.splice(index, 1, { type: 'inlineCode', value: displayNames.get(citation.path) ?? citation.path }, reference)
    index++
  }
  compactCitationGroups(node.children)
  trimReferenceWhitespace(node.children)
  separateAdjacentReferences(node.children)
}

function parseCitation(value: string, trackedSources: Set<string>): Citation | undefined {
  if (trackedSources.has(value)) return { address: value, path: value, lineQualified: false }
  const match = /^([^:\s`]+):([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value)
  if (!match) return undefined
  const [, path, startValue, endValue] = match
  if (!isSourcePath(path)) return undefined
  const start = Number(startValue)
  const end = endValue === undefined ? start : Number(endValue)
  if (end < start) return undefined
  return { address: value, path, lineQualified: true }
}

function isSourcePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('./') || path.includes('\\') || path.includes('://')) return false
  if (path.split('/').includes('..')) return false
  return path.includes('/') || path.includes('.')
}

function shortestUniqueSourceNames(sources: Set<string>): Map<string, string> {
  const paths = [...sources]
  const result = new Map<string, string>()
  for (const path of paths) {
    const segments = path.split('/')
    let display = path
    for (let length = 1; length <= segments.length; length++) {
      const suffix = segments.slice(-length).join('/')
      if (paths.filter((candidate) => candidate === suffix || candidate.endsWith(`/${suffix}`)).length === 1) {
        display = suffix
        break
      }
    }
    result.set(path, display)
  }
  return result
}

function collectFootnoteIdentifiers(tree: MdNode): Set<string> {
  const identifiers = new Set<string>()
  walkMd(tree, (node) => {
    if ((node.type === 'footnoteDefinition' || node.type === 'footnoteReference') && node.identifier) identifiers.add(node.identifier)
  })
  return identifiers
}

function compactCitationGroups(children: MdNode[]): void {
  for (let index = 0; index < children.length; index++) {
    const opener = children[index]
    if (opener.type !== 'text' || typeof opener.value !== 'string' || !/[（(]\s*$/.test(opener.value)) continue
    const references: MdNode[] = []
    let cursor = index + 1
    while (isGeneratedReference(children[cursor])) {
      references.push(children[cursor])
      cursor++
      const separator = children[cursor]
      if (separator?.type === 'text' && typeof separator.value === 'string' && /^\s*[,，、]\s*$/.test(separator.value)) {
        cursor++
        continue
      }
      break
    }
    const closer = children[cursor]
    if (references.length === 0 || closer?.type !== 'text' || typeof closer.value !== 'string' || !/^\s*[）)]/.test(closer.value)) continue
    const prefix = opener.value.replace(/\s*[（(]\s*$/, '')
    const suffix = closer.value.replace(/^\s*[）)]/, '')
    const replacement: MdNode[] = []
    if (prefix.length > 0) replacement.push({ ...opener, value: prefix })
    replacement.push(...references)
    if (suffix.length > 0) replacement.push({ ...closer, value: suffix })
    children.splice(index, cursor - index + 1, ...replacement)
    index += replacement.length - 1
  }
}

function trimReferenceWhitespace(children: MdNode[]): void {
  for (let index = 1; index < children.length; index++) {
    if (!isGeneratedReference(children[index])) continue
    const previous = children[index - 1]
    if (previous.type !== 'text' || typeof previous.value !== 'string') continue
    previous.value = previous.value.replace(/\s+$/, '')
    if (previous.value.length === 0) {
      children.splice(index - 1, 1)
      index--
    }
  }
}

function separateAdjacentReferences(children: MdNode[]): void {
  for (let index = 1; index < children.length; index++) {
    if (!isGeneratedReference(children[index - 1]) || !isGeneratedReference(children[index])) continue
    children.splice(index, 0, { type: 'text', value: ',\u202f' })
    index++
  }
}

function isGeneratedReference(node: MdNode | undefined): boolean {
  return node?.type === 'footnoteReference' && node.identifier?.startsWith(generatedIdentifierPrefix) === true
}

function findPage(pages: SourceFootnotePages, file: FileLike): SourceFootnotePage | undefined {
  const path = file.path ?? file.history?.at(-1)
  return path ? pages.get(resolve(path)) : undefined
}

function sourceLabels(locale: string | undefined): { sources: string; combined: string } {
  if (locale?.toLowerCase().startsWith('zh')) return { sources: '来源', combined: '注释与来源' }
  return { sources: 'Sources', combined: 'Notes and sources' }
}

function walkMd(node: MdNode, visit: (node: MdNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walkMd(child, visit)
}

function walkHast(node: HastNode, visit: (node: HastNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walkHast(child, visit)
}

function hasProperty(node: HastNode, property: string): boolean {
  return node.properties !== undefined && Object.hasOwn(node.properties, property)
}

function collectListItemIds(node: HastNode): string[] {
  const ids: string[] = []
  walkHast(node, (child) => {
    if (child.tagName === 'li' && typeof child.properties?.id === 'string') ids.push(child.properties.id)
  })
  return ids
}
