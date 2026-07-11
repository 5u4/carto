import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { urlPath, type Manifest, type Node } from '@carto/core'
import { buildLocales, buildRedirects, buildSidebar, loadUserConfig, mergeStarlight } from './site-config'

function node(partial: Partial<Node> & { id: string }): Node {
  return { sources: [], ...partial }
}

function manifest(): Manifest {
  return {
    version: 1,
    locales: ['en', 'zh'],
    defaultLocale: 'en',
    updated_at: '2026-07-08T00:00:00Z',
    nodes: [
      node({ id: 'overview' }),
      node({ id: 'api', slug: 'backend' }),
      node({ id: 'payments', slug: 'billing', parent: 'api' })
    ]
  }
}

describe('buildLocales', () => {
  it('maps the defaultLocale to the root key', () => {
    const locales = buildLocales(manifest())
    expect(locales.root).toEqual({ label: 'en', lang: 'en' })
  })

  it('maps non-default locales to their own key', () => {
    const locales = buildLocales(manifest())
    expect(locales.zh).toEqual({ label: 'zh', lang: 'zh' })
  })

  it('has exactly one entry per configured locale', () => {
    const locales = buildLocales(manifest())
    expect(Object.keys(locales).sort()).toEqual(['root', 'zh'])
  })
})

describe('buildSidebar', () => {
  it('has exactly the root nodes at the top level, in array order', () => {
    const sidebar = buildSidebar(manifest())
    expect(sidebar.map((entry) => entry.label)).toEqual(['overview', 'backend'])
  })

  it('nests children under their parent as items', () => {
    const [, api] = buildSidebar(manifest())
    const items = api?.items ?? []
    expect(items.map((entry) => entry.label)).toEqual(['backend', 'billing'])
  })

  it('gives every leaf a link equal to urlPath for the defaultLocale', () => {
    const m = manifest()
    const [overview, api] = buildSidebar(m)
    const apiSelf = api?.items?.[0]
    const payments = api?.items?.[1]
    expect(overview?.link).toBe(urlPath(m, 'overview', 'en'))
    expect(apiSelf?.link).toBe(urlPath(m, 'api', 'en'))
    expect(payments?.link).toBe(urlPath(m, 'payments', 'en'))
    expect(payments?.link).toBe('/backend/billing/')
  })

  it('leaves a childless node without an items array', () => {
    const m: Manifest = {
      version: 1,
      locales: ['en'],
      defaultLocale: 'en',
      updated_at: '2026-07-08T00:00:00Z',
      nodes: [node({ id: 'solo' })]
    }
    const sidebar = buildSidebar(m)
    expect(sidebar).toEqual([{ label: 'solo', link: urlPath(m, 'solo', 'en') }])
  })
})

describe('buildRedirects', () => {
  it('redirects the default-locale root to the first root node', () => {
    const m = manifest()
    expect(buildRedirects(m)['/']).toBe(urlPath(m, 'overview', 'en'))
  })

  it('redirects each non-default locale root to the first root node in that locale', () => {
    const m = manifest()
    expect(buildRedirects(m)['/zh/']).toBe(urlPath(m, 'overview', 'zh'))
  })

  it('picks the first root node by array order when several roots exist', () => {
    const base = manifest()
    const m: Manifest = { ...base, nodes: [base.nodes[1]!, base.nodes[0]!, base.nodes[2]!] }
    expect(buildRedirects(m)['/']).toBe(urlPath(m, 'api', 'en'))
    expect(buildRedirects(m)['/']).toBe('/backend/')
  })

  it('honors an explicit home field pointing at any node, root or not', () => {
    const m = { ...manifest(), home: 'payments' }
    expect(buildRedirects(m)['/']).toBe(urlPath(m, 'payments', 'en'))
    expect(buildRedirects(m)['/']).toBe('/backend/billing/')
  })

  it('falls back to the first root node when home points at an unknown id', () => {
    const m = { ...manifest(), home: 'ghost' }
    expect(buildRedirects(m)['/']).toBe('/overview/')
  })

  it('returns no redirects when there are no root nodes', () => {
    const m: Manifest = {
      version: 1,
      locales: ['en'],
      defaultLocale: 'en',
      updated_at: '2026-07-08T00:00:00Z',
      nodes: []
    }
    expect(buildRedirects(m)).toEqual({})
  })
})

describe('mergeStarlight', () => {
  const owned = { locales: { root: { label: 'en', lang: 'en' } }, sidebar: [{ label: 'overview', link: '/' }] }

  it('defaults the title when the user omits it', () => {
    expect(mergeStarlight({}, owned).title).toBe('Carto')
  })

  it('lets the user override the title', () => {
    expect(mergeStarlight({ title: 'My Docs' }, owned).title).toBe('My Docs')
  })

  it('passes user options through untouched', () => {
    const merged = mergeStarlight({ customCss: ['./a.css'], plugins: ['p'] }, owned)
    expect(merged.customCss).toEqual(['./a.css'])
    expect(merged.plugins).toEqual(['p'])
  })

  it('forces owned locales and sidebar to win over user values', () => {
    const merged = mergeStarlight({ locales: { root: { label: 'x', lang: 'x' } }, sidebar: [] }, owned)
    expect(merged.locales).toBe(owned.locales)
    expect(merged.sidebar).toBe(owned.sidebar)
  })
})

describe('loadUserConfig', () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty object when no config file exists', async () => {
    dir = await mkdtemp(join(tmpdir(), 'carto-cfg-'))
    expect(await loadUserConfig(dir)).toEqual({})
  })

  it('loads the default export from carto.config.mjs', async () => {
    dir = await mkdtemp(join(tmpdir(), 'carto-cfg-'))
    await writeFile(join(dir, 'carto.config.mjs'), "export default { starlight: { title: 'Loaded' } }", 'utf8')
    expect(await loadUserConfig(dir)).toEqual({ starlight: { title: 'Loaded' } })
  })

  it('throws a carto-prefixed error when the config file fails to import', async () => {
    dir = await mkdtemp(join(tmpdir(), 'carto-cfg-'))
    await writeFile(join(dir, 'carto.config.mjs'), 'throw new Error("boom")', 'utf8')
    await expect(loadUserConfig(dir)).rejects.toThrow(/carto: failed to load carto\.config\.mjs: boom/)
  })

  it('throws when the default export is not an object', async () => {
    dir = await mkdtemp(join(tmpdir(), 'carto-cfg-'))
    await writeFile(join(dir, 'carto.config.mjs'), 'export default 42', 'utf8')
    await expect(loadUserConfig(dir)).rejects.toThrow(/must default-export an object/)
  })

  it('throws when starlight is not an object', async () => {
    dir = await mkdtemp(join(tmpdir(), 'carto-cfg-'))
    await writeFile(join(dir, 'carto.config.mjs'), "export default { starlight: 'nope' }", 'utf8')
    await expect(loadUserConfig(dir)).rejects.toThrow(/"starlight" must be an object/)
  })

  it('throws when the file exists but has no default export', async () => {
    dir = await mkdtemp(join(tmpdir(), 'carto-cfg-'))
    await writeFile(join(dir, 'carto.config.mjs'), 'export const notDefault = {}', 'utf8')
    await expect(loadUserConfig(dir)).rejects.toThrow(/must default-export an object/)
  })
})
