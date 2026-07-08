import type { Manifest } from './schema.js'
import { ID_PATTERN } from './schema.js'
import { nodesById, urlPath } from './tree.js'

export type ParsedLink =
  | { kind: 'internal'; id: string; anchor?: string }
  | { kind: 'federation'; alias: string; id: string; anchor?: string }

export function parseCartoLink(target: string): ParsedLink | null {
  if (!target.startsWith('carto:')) return null
  const body = target.slice('carto:'.length)
  const [path, anchor] = splitAnchor(body)
  const slash = path.indexOf('/')
  if (slash >= 0) {
    return { kind: 'federation', alias: path.slice(0, slash), id: path.slice(slash + 1), anchor }
  }
  return { kind: 'internal', id: path, anchor }
}

function splitAnchor(body: string): [string, string | undefined] {
  const hash = body.indexOf('#')
  if (hash < 0) return [body, undefined]
  return [body.slice(0, hash), body.slice(hash + 1)]
}

export type ResolveError =
  | { kind: 'not-a-carto-link' }
  | { kind: 'malformed'; target: string }
  | { kind: 'federation-unsupported'; alias: string }
  | { kind: 'unknown-id'; id: string }

export interface ResolveContext {
  manifest: Manifest
  locale: string
}

export type ResolveResult =
  | { ok: true; url: string; id: string }
  | { ok: false; error: ResolveError }

export function resolveCartoLink(target: string, ctx: ResolveContext): ResolveResult {
  const parsed = parseCartoLink(target)
  if (!parsed) return { ok: false, error: { kind: 'not-a-carto-link' } }
  if (parsed.kind === 'federation') {
    return { ok: false, error: { kind: 'federation-unsupported', alias: parsed.alias } }
  }
  if (!ID_PATTERN.test(parsed.id)) return { ok: false, error: { kind: 'malformed', target } }
  const node = nodesById(ctx.manifest.nodes).get(parsed.id)
  if (!node) return { ok: false, error: { kind: 'unknown-id', id: parsed.id } }
  const base = urlPath(ctx.manifest, parsed.id, ctx.locale)
  return { ok: true, url: parsed.anchor ? `${base}#${parsed.anchor}` : base, id: parsed.id }
}
