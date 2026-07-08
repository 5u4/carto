import { describe, expect, it } from 'vitest'
import { version } from './index'

describe('@carto/core', () => {
  it('exposes the placeholder version', () => {
    expect(version).toBe('0.0.0')
  })
})
