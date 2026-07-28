import { describe, expect, it } from 'vitest'
import { formatFadeDuration, parseFadeDuration } from './cueUtils'

describe('parseFadeDuration', () => {
  it('reads an explicit unit', () => {
    expect(parseFadeDuration('500ms')).toBe(500)
    expect(parseFadeDuration('2s')).toBe(2000)
    expect(parseFadeDuration('1.5s')).toBe(1500)
    expect(parseFadeDuration('1.5m')).toBe(90_000)
  })

  it('reads a bare number as seconds', () => {
    expect(parseFadeDuration('3')).toBe(3000)
    expect(parseFadeDuration('0.25')).toBe(250)
  })

  it('tolerates whitespace, case and long unit spellings', () => {
    expect(parseFadeDuration('  2 S ')).toBe(2000)
    expect(parseFadeDuration('750 MS')).toBe(750)
    expect(parseFadeDuration('4 sec')).toBe(4000)
    expect(parseFadeDuration('2 min')).toBe(120_000)
  })

  it('treats empty, zero and "snap" as no fade', () => {
    expect(parseFadeDuration('')).toBeNull()
    expect(parseFadeDuration('   ')).toBeNull()
    expect(parseFadeDuration('0')).toBeNull()
    expect(parseFadeDuration('0ms')).toBeNull()
    expect(parseFadeDuration('snap')).toBeNull()
    expect(parseFadeDuration('SNAP')).toBeNull()
  })

  it('rejects text it cannot read', () => {
    expect(parseFadeDuration('fast')).toBeUndefined()
    expect(parseFadeDuration('2 beats')).toBeUndefined()
    expect(parseFadeDuration('-2s')).toBeUndefined()
    expect(parseFadeDuration('2s 500ms')).toBeUndefined()
    expect(parseFadeDuration('.')).toBeUndefined()
  })

  it('round-trips what the table displays', () => {
    for (const ms of [250, 500, 2000, 2500, 90_000]) {
      expect(parseFadeDuration(formatFadeDuration(ms))).toBe(ms)
    }
    expect(formatFadeDuration(null)).toBe('')
    expect(formatFadeDuration(0)).toBe('')
  })
})
