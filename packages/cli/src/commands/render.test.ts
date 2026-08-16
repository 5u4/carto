import { runCommand } from 'citty'
import { buildSite, previewSite } from '@carto/template'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCommand } from './build.js'
import { previewCommand } from './preview.js'

vi.mock('@carto/template', () => ({ buildSite: vi.fn(), previewSite: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('rendering commands', () => {
  it('builds the current doc root', async () => {
    await runCommand(buildCommand, { rawArgs: [] })

    expect(buildSite).toHaveBeenCalledWith(process.cwd())
  })

  it('previews with localhost defaults', async () => {
    await runCommand(previewCommand, { rawArgs: [] })

    expect(previewSite).toHaveBeenCalledWith(process.cwd(), { host: '127.0.0.1', port: 4321 })
  })

  it('forwards explicit preview host and port', async () => {
    await runCommand(previewCommand, { rawArgs: ['--host', '0.0.0.0', '--port', '49152'] })

    expect(previewSite).toHaveBeenCalledWith(process.cwd(), { host: '0.0.0.0', port: 49_152 })
  })

  it('reports rendering failures and exits non-zero', async () => {
    vi.mocked(previewSite).mockRejectedValueOnce(new Error('No built site found'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(runCommand(previewCommand, { rawArgs: [] })).rejects.toThrow('exit')
    expect(error).toHaveBeenCalledWith('error: No built site found')
    expect(exit).toHaveBeenCalledWith(1)
    error.mockRestore()
    exit.mockRestore()
  })
})
