import type { NodeStatus } from '@carto/core'

export function injectStalenessBanner(mdx: string, status: NodeStatus | undefined): string {
  if (!status || (status.state !== 'stale' && status.state !== 'missing')) return mdx
  const match = mdx.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (!match) return mdx
  const [, open, body, close] = match
  const banner = `banner:\n  content: "${stalenessMessage(status).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return `${open}${body}\n${banner}${close}${mdx.slice(match[0].length)}`
}

function stalenessMessage(status: NodeStatus): string {
  const code = (file: string): string => `<code>${file}</code>`
  const stale = status.sources.filter((s) => s.state === 'stale').map((s) => code(s.file))
  const missing = status.sources.filter((s) => s.state === 'missing').map((s) => code(s.file))
  const parts: string[] = []
  if (stale.length > 0) parts.push(`changed since this page was written: ${stale.join(', ')}`)
  if (missing.length > 0) parts.push(`no longer exist: ${missing.join(', ')}`)
  return `⚠️ <strong>This page may describe outdated code.</strong> Source files ${parts.join('; ')}. Regenerate with <code>carto refresh</code>.`
}
