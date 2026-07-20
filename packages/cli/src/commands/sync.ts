import { defineCommand } from 'citty'
import { readManifest, syncManifest, writeNode, codeRootDir, ManifestError, type Node } from '@carto/core'
import { headCommit } from '../git.js'

export const syncCommand = defineCommand({
  meta: { name: 'sync', description: 'Recompute and write source hashes' },
  args: {
    ids: { type: 'positional', required: false, description: 'Node ids to bless (default: only unsynced sources)' }
  },
  async run({ rawArgs }) {
    const root = process.cwd()
    const targets = rawArgs.filter((arg) => !arg.startsWith('-'))
    try {
      const manifest = await readManifest(root)
      const codeRoot = codeRootDir(manifest, root)
      const { manifest: synced, changed } = await syncManifest(manifest, {
        rootDir: codeRoot,
        commit: headCommit(codeRoot),
        targets: targets.length > 0 ? targets : undefined
      })
      const byId = new Map<string, Node>(synced.nodes.map((node) => [node.id, node]))
      for (const id of changed) {
        const node = byId.get(id)
        if (node !== undefined) await writeNode(root, node)
      }
      console.log(`synced ${changed.length} node(s)`)
    } catch (error) {
      console.error(error instanceof ManifestError ? error.message : String(error))
      process.exit(1)
    }
  }
})
