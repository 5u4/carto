import type { NodeStatus } from '@carto/core'

export function injectStalenessBanner(mdx: string, status: NodeStatus | undefined): string {
  if (!status || (status.state !== 'stale' && status.state !== 'missing')) return mdx
  const match = mdx.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (!match) return mdx
  const [, open, body, close] = match
  if (/^banner:/m.test(body)) return mdx
  const nl = open.includes('\r\n') ? '\r\n' : '\n'
  const content = stalenessMessage(status).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const banner = `banner:${nl}  content: "${content}"`
  return `${open}${body}${nl}${banner}${close}${mdx.slice(match[0].length)}`
}

function stalenessMessage(status: NodeStatus): string {
  const code = (file: string): string => `<code>${escapeHtml(file)}</code>`
  const stale = status.sources.filter((s) => s.state === 'stale').map((s) => code(s.file))
  const missing = status.sources.filter((s) => s.state === 'missing').map((s) => code(s.file))
  const parts: string[] = []
  if (stale.length > 0) parts.push(`changed since this page was written: ${stale.join(', ')}`)
  if (missing.length > 0) parts.push(`no longer exist: ${missing.join(', ')}`)
  return `⚠️ <strong>This page may describe outdated code.</strong> Source files ${parts.join('; ')}. Regenerate this page to bring it up to date.`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
