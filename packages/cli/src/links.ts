export function extractCartoTargets(mdx: string): string[] {
  const targets: string[] = []
  const pattern = /\]\((carto:[^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(mdx)) !== null) {
    targets.push(match[1])
  }
  return targets
}
