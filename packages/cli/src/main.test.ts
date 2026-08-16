import { renderUsage, runCommand } from 'citty'
import { describe, expect, it, vi } from 'vitest'
import { mainCommand } from './main.js'

vi.mock('@carto/template', () => ({ buildSite: vi.fn(), previewSite: vi.fn() }))

describe('carto command registry', () => {
  it('exposes preview and no dev command', async () => {
    const usage = await renderUsage(mainCommand)

    expect(usage).toContain('preview')
    expect(usage).not.toMatch(/\bdev\b/)
    await expect(runCommand(mainCommand, { rawArgs: ['dev'] })).rejects.toThrow('Unknown command')
  })
})
