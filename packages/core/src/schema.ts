import { z } from 'zod'

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function isRelativeFile(value: string): boolean {
  if (value.startsWith('/') || value.startsWith('\\')) return false
  if (value.length >= 2 && value[1] === ':') return false
  const segments = value.split('/').flatMap((part) => part.split('\\'))
  return !segments.includes('..')
}

export const sourceSchema = z.object({
  file: z.string().min(1).refine(isRelativeFile, 'file must be a relative path without ".." segments'),
  hash: z.string().min(1).optional(),
  commit: z.string().min(1).optional()
})

export const nodeSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  slug: z.string().regex(ID_PATTERN).optional(),
  parent: z.string().regex(ID_PATTERN).optional(),
  sources: z.array(sourceSchema).default([])
})

export const manifestSchema = z
  .object({
    version: z.literal(1),
    locales: z.array(z.string().min(1)).min(1),
    defaultLocale: z.string().min(1),
    updated_at: z.string().min(1),
    home: z.string().regex(ID_PATTERN).optional(),
    nodes: z.array(nodeSchema)
  })
  .superRefine((manifest, ctx) => {
    const seenLocales = new Set<string>()
    for (const locale of manifest.locales) {
      if (seenLocales.has(locale)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locales'], message: `duplicate locale ${locale}` })
      }
      seenLocales.add(locale)
    }
    if (!manifest.locales.includes(manifest.defaultLocale)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultLocale'], message: 'defaultLocale must be a member of locales' })
    }
    const seenIds = new Set<string>()
    manifest.nodes.forEach((node, index) => {
      if (seenIds.has(node.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'id'], message: `duplicate node id ${node.id}` })
      }
      seenIds.add(node.id)
    })
  })

export type Source = z.infer<typeof sourceSchema>
export type Node = z.infer<typeof nodeSchema>
export type Manifest = z.infer<typeof manifestSchema>
