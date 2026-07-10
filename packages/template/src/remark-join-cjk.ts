interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
}

const cjkRanges = [
  '2e80-2eff',
  '2f00-2fdf',
  '3040-309f',
  '30a0-30ff',
  '3100-312f',
  '3200-32ff',
  '3400-4dbf',
  '4e00-9fff',
  'f900-faff',
  '3000-303f',
  'ff00-ffee'
]

const cjkClass = cjkRanges.map((r) => r.split('-').map((c) => `\\u${c}`).join('-')).join('') + '\\u2014\\u2026'

const softBreak = new RegExp(`([${cjkClass}])\\s*\\n+\\s*(?=[${cjkClass}])`, 'g')

export function joinCjkSoftBreaks(value: string): string {
  return value.replace(softBreak, '$1')
}

function walk(node: MdNode): void {
  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = joinCjkSoftBreaks(node.value)
    return
  }
  if (node.children) {
    for (const child of node.children) walk(child)
  }
}

export default function remarkJoinCjkLines(): (tree: MdNode) => void {
  return (tree) => walk(tree)
}
