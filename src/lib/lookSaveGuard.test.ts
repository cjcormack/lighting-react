import { describe, expect, it } from 'vitest'
import { assertLookLoaded } from './lookSaveGuard'

describe('assertLookLoaded', () => {
  it('passes a loaded look through', () => {
    expect(() => assertLookLoaded({ id: 7 })).not.toThrow()
  })

  it('refuses a save while the detail is still in flight', () => {
    // The editor seeds from the detail, so before it lands an existing Look renders as an empty
    // create draft — and a PUT carrying `rows: []` is read as "clear them", out from under every
    // cue resolving through the Look.
    expect(() => assertLookLoaded(null)).toThrow(/hasn't finished loading yet/)
  })

  it('says so differently when the fetch failed', () => {
    // "Try again in a moment" describes something that will never happen once the fetch has
    // errored, and an operator retrying on that advice learns nothing.
    expect(() => assertLookLoaded(null, { failed: true })).toThrow(/couldn't be loaded/)
    expect(() => assertLookLoaded(null, { failed: true })).not.toThrow(/in a moment/)
  })

  it('treats undefined the same as null', () => {
    // RTK Query hands back `undefined` before the first result, not `null`.
    expect(() => assertLookLoaded(undefined)).toThrow()
  })
})
