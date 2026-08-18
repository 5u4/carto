import { join } from 'node:path'

export function docsDir(docRoot: string): string {
  return join(docRoot, '.carto', 'docs')
}

export function nodeDir(docRoot: string, id: string): string {
  return join(docsDir(docRoot), id)
}

export function nodeFile(docRoot: string, id: string): string {
  return join(nodeDir(docRoot, id), 'node.json')
}

export function localeFile(docRoot: string, id: string, locale: string): string {
  return join(nodeDir(docRoot, id), `${locale}.mdx`)
}
