import { z } from 'zod'

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function isRelativePath(value: string): boolean {
  if (value.startsWith('/') || value.startsWith('\\')) return false
  if (value.length >= 2 && value[1] === ':') return false
  return true
}

function isRelativeFile(value: string): boolean {
  if (!isRelativePath(value)) return false
  const segments = value.split('/').flatMap((part) => part.split('\\'))
  return !segments.includes('..')
}

export const sourceSchema = z
  .object({
    file: z.string().min(1).refine(isRelativeFile, 'file must be a relative path without ".." segments'),
    hash: z.string().min(1).optional(),
    commit: z.string().min(1).optional()
  })
  .refine((source) => source.commit === undefined || source.hash !== undefined, {
    path: ['commit'],
    message: 'commit requires hash'
  })

export const federatedFileSchema = z.object({
  alias: z.string().regex(ID_PATTERN),
  type: z.literal('file'),
  path: z.string().min(1).refine(isRelativePath, 'path must be a relative path (no absolute or drive-rooted paths)')
})

export const federatedGitSchema = z.object({
  alias: z.string().regex(ID_PATTERN),
  type: z.literal('git'),
  url: z.string().min(1),
  ref: z.string().min(1),
  subdir: z.string().min(1).optional()
})

export const federatedSchema = z.discriminatedUnion('type', [federatedFileSchema, federatedGitSchema])

export const nodeFileSchema = z.object({
  parent: z.string().regex(ID_PATTERN).optional(),
  sources: z.array(sourceSchema).default([])
})

export const configSchema = z
  .object({
    version: z.literal(1),
    locales: z.array(z.string().min(1)).min(1),
    defaultLocale: z.string().min(1),
    codeRoot: z.string().min(1).optional(),
    home: z.string().regex(ID_PATTERN).optional(),
    federated: z.array(federatedSchema).default([])
  })
  .superRefine((config, ctx) => {
    const seenLocales = new Set<string>()
    for (const locale of config.locales) {
      if (seenLocales.has(locale)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locales'], message: `duplicate locale ${locale}` })
      }
      seenLocales.add(locale)
    }
    if (!config.locales.includes(config.defaultLocale)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultLocale'], message: 'defaultLocale must be a member of locales' })
    }
    const seenAliases = new Set<string>()
    config.federated.forEach((entry, index) => {
      if (entry.alias === 'self') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['federated', index, 'alias'], message: 'alias "self" is reserved' })
      }
      if (seenAliases.has(entry.alias)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['federated', index, 'alias'], message: `duplicate federated alias ${entry.alias}` })
      }
      seenAliases.add(entry.alias)
    })
  })

export type Source = z.infer<typeof sourceSchema>
export type FederatedFile = z.infer<typeof federatedFileSchema>
export type FederatedGit = z.infer<typeof federatedGitSchema>
export type Federated = z.infer<typeof federatedSchema>
export type NodeFile = z.infer<typeof nodeFileSchema>
export type Config = z.infer<typeof configSchema>
export type Node = NodeFile & { id: string }
export type Manifest = Config & { nodes: Node[] }
