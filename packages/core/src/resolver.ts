import type { Manifest } from './schema.js'
import { ID_PATTERN } from './schema.js'
import type { DocSet } from './graph.js'
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
  | { kind: 'unknown-alias'; alias: string }
  | { kind: 'unknown-id'; id: string }
  | { kind: 'unknown-federated-id'; alias: string; id: string }

export interface FederationContext {
  byHash: Map<string, DocSet>
  aliasToHash: Map<string, string>
  siteDefaultLocale: string
}

export interface ResolveContext {
  manifest: Manifest
  locale: string
  prefix?: string
  federation?: FederationContext
}

export type ResolveResult =
  | { ok: true; url: string; id: string }
  | { ok: false; error: ResolveError }

export function resolveCartoLink(target: string, ctx: ResolveContext): ResolveResult {
  const parsed = parseCartoLink(target)
  if (!parsed) return { ok: false, error: { kind: 'not-a-carto-link' } }
  if (parsed.kind === 'federation') return resolveFederation(parsed, ctx)
  if (!ID_PATTERN.test(parsed.id)) return { ok: false, error: { kind: 'malformed', target } }
  const node = nodesById(ctx.manifest.nodes).get(parsed.id)
  if (!node) return { ok: false, error: { kind: 'unknown-id', id: parsed.id } }
  const siteDefault = ctx.federation?.siteDefaultLocale ?? ctx.manifest.defaultLocale
  const base = urlPath(ctx.manifest, parsed.id, ctx.locale, ctx.prefix ?? '', siteDefault)
  return { ok: true, url: parsed.anchor ? `${base}#${parsed.anchor}` : base, id: parsed.id }
}

function resolveFederation(
  parsed: { alias: string; id: string; anchor?: string },
  ctx: ResolveContext
): ResolveResult {
  if (!ctx.federation) return { ok: false, error: { kind: 'federation-unsupported', alias: parsed.alias } }
  if (!ID_PATTERN.test(parsed.alias) || !ID_PATTERN.test(parsed.id)) {
    return { ok: false, error: { kind: 'malformed', target: `carto:${parsed.alias}/${parsed.id}` } }
  }
  const hash = ctx.federation.aliasToHash.get(parsed.alias)
  if (hash === undefined) return { ok: false, error: { kind: 'unknown-alias', alias: parsed.alias } }
  const docSet = ctx.federation.byHash.get(hash)
  if (!docSet) return { ok: false, error: { kind: 'unknown-alias', alias: parsed.alias } }
  const node = nodesById(docSet.manifest.nodes).get(parsed.id)
  if (!node) return { ok: false, error: { kind: 'unknown-federated-id', alias: parsed.alias, id: parsed.id } }
  const base = urlPath(docSet.manifest, parsed.id, ctx.locale, docSet.prefix, ctx.federation.siteDefaultLocale)
  return { ok: true, url: parsed.anchor ? `${base}#${parsed.anchor}` : base, id: parsed.id }
}
