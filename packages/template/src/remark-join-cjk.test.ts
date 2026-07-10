import { describe, expect, it } from 'vitest'
import { joinCjkSoftBreaks } from './remark-join-cjk'

describe('joinCjkSoftBreaks', () => {
  it('drops a soft break between two Han characters', () => {
    expect(joinCjkSoftBreaks('精确判断\n代码变更')).toBe('精确判断代码变更')
  })

  it('joins across CJK punctuation on either side', () => {
    expect(joinCjkSoftBreaks('逐行的照抄。\n它的差异化')).toBe('逐行的照抄。它的差异化')
    expect(joinCjkSoftBreaks('那种讲解——\n并且在代码')).toBe('那种讲解——并且在代码')
  })

  it('keeps the space between two Latin words', () => {
    expect(joinCjkSoftBreaks('hello\nworld')).toBe('hello\nworld')
  })

  it('does not join a Latin word to a following Han character', () => {
    expect(joinCjkSoftBreaks('sha256\n重新计算')).toBe('sha256\n重新计算')
  })

  it('collapses surrounding spaces and multiple newlines between Han', () => {
    expect(joinCjkSoftBreaks('判断 \n\n 代码')).toBe('判断代码')
  })

  it('leaves a lone Han paragraph untouched', () => {
    expect(joinCjkSoftBreaks('只有一行中文')).toBe('只有一行中文')
  })
})
