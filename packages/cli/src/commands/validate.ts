import { defineCommand } from 'citty'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readManifest,
  checkTree,
  statusReport,
  resolveCartoLink,
  codeRootDir,
  loadGraph,
  ManifestError,
  type Manifest,
  type FederationContext,
  type TreeIssue,
  type ResolveError
} from '@carto/core'
import { extractCartoTargets } from '../links.js'

export const validateCommand = defineCommand({
  meta: { name: 'validate', description: 'Validate schema, tree, sync state, and links' },
  async run() {
    const root = process.cwd()
    let manifest: Manifest
    try {
      manifest = await readManifest(join(root, 'carto.json'))
    } catch (error) {
      fail(error instanceof ManifestError ? error.message : String(error))
      return
    }
    let federation: FederationContext | undefined
    try {
      const graph = await loadGraph(root)
      if (graph.federated) federation = { byHash: graph.byHash, aliasToHash: graph.root.aliasToHash, siteDefaultLocale: graph.root.manifest.defaultLocale }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
      return
    }
    const errors: string[] = []
    const warnings: string[] = []

    for (const issue of checkTree(manifest.nodes)) {
      const line = formatTreeIssue(issue)
      ;(issue.severity === 'error' ? errors : warnings).push(line)
    }

    if (manifest.home && !manifest.nodes.some((node) => node.id === manifest.home)) {
      errors.push(`home points to unknown node id "${manifest.home}"`)
    }

    const report = await statusReport(manifest, codeRootDir(manifest, root))
    for (const node of report) {
      if (node.state === 'unsynced') errors.push(`node ${node.id} is unsynced; run carto sync`)
      else if (node.state === 'stale') {
        const changed = node.sources.filter((s) => s.state === 'stale').map((s) => s.file).join(', ')
        errors.push(`node ${node.id} is stale; changed: ${changed}; run carto sync`)
      } else if (node.state === 'missing') {
        const missing = node.sources.filter((s) => s.state === 'missing').map((s) => s.file).join(', ')
        errors.push(`node ${node.id} has a missing source file: ${missing}`)
      }
    }

    for (const node of manifest.nodes) {
      for (const locale of manifest.locales) {
        const mdx = join(root, 'docs', node.id, `${locale}.mdx`)
        if (!(await exists(mdx))) {
          errors.push(`missing doc: docs/${node.id}/${locale}.mdx`)
          continue
        }
        const text = await readFile(mdx, 'utf8')
        for (const target of extractCartoTargets(text)) {
          const result = resolveCartoLink(target, { manifest, locale, federation })
          if (!result.ok) errors.push(`docs/${node.id}/${locale}.mdx: ${describeError(target, result.error)}`)
        }
      }
    }

    for (const warning of warnings) console.warn(`warning: ${warning}`)
    if (errors.length > 0) {
      for (const error of errors) console.error(`error: ${error}`)
      process.exit(1)
    }
    console.log('validate: ok')
  }
})

function fail(message: string): void {
  console.error(`error: ${message}`)
  process.exit(1)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function formatTreeIssue(issue: TreeIssue): string {
  switch (issue.kind) {
    case 'duplicate-sibling-slug':
      return `duplicate sibling slug "${issue.slug}" under parent ${issue.parent ?? '(root)'}: ${issue.ids.join(', ')}`
    case 'parent-cycle':
      return `parent cycle: ${issue.ids.join(' -> ')}`
    case 'dangling-parent':
      return `node ${issue.id} has dangling parent ${issue.parent}`
  }
}

function describeError(target: string, error: ResolveError): string {
  switch (error.kind) {
    case 'unknown-id':
      return `unknown carto: link ${target}`
    case 'federation-unsupported':
      return `federation link ${target} needs a federated entry for alias "${error.alias}"`
    case 'unknown-alias':
      return `unknown federation alias "${error.alias}" in ${target}`
    case 'unknown-federated-id':
      return `federation link ${target}: id "${error.id}" not found in doc-set "${error.alias}"`
    case 'malformed':
      return `malformed carto: link ${target}`
    case 'not-a-carto-link':
      return `not a carto: link ${target}`
  }
}
