import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export function hashContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

export async function hashFile(path: string): Promise<string> {
  return hashContent(await readFile(path))
}
