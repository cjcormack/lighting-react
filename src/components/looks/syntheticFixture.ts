import type { FixtureTypeMode } from '@/api/fixtureTypeHierarchy'
import type { Fixture } from '@/store/fixtures'

const SYNTHETIC_FIXTURE_KEY = '__look_editor__'

/**
 * Build a `Fixture`-shaped object from a `FixtureTypeMode` for use inside `LookEditor`.
 *
 * A synthetic fixture is the only way to author values for targets that do not exist yet, which is
 * what a Look's **deferred** rows are: they name no target and take one from the layer applying
 * them. That is why `editorFixtureType` earns its keep as an editor hint rather than a constraint.
 *
 * The invented `ChannelRef`s never hit the DMX engine because all property reads + writes inside
 * the editor subtree are routed via `LookDraftContext` (look mode). They only need to satisfy the
 * structural shape that `FixtureContent` iterates over (and the subscribe/get helpers in the read
 * hooks fall through to channel snapshots in look mode but their result is never used — see
 * [src/hooks/usePropertyValues.ts]).
 *
 * A single synthetic fixture is sufficient: a deferred Look row is single-head, so we don't
 * populate `elements` or `elementGroupProperties`. If that changes, this helper is the one place
 * that needs to add element synthesis.
 */
export function buildSyntheticLookFixture(mode: FixtureTypeMode): Fixture {
  return {
    key: SYNTHETIC_FIXTURE_KEY,
    name: mode.modeName ?? mode.typeKey,
    typeKey: mode.typeKey,
    universe: 0,
    firstChannel: 1,
    channelCount: mode.channelCount ?? 0,
    channels: [],
    properties: mode.properties,
    mode:
      mode.modeName && mode.channelCount != null
        ? { modeName: mode.modeName, channelCount: mode.channelCount }
        : undefined,
    capabilities: mode.capabilities,
    groups: [],
    compatibleLookIds: [],
  }
}

/** Match this against `fixture.key` to detect a synthetic Look-editor fixture. */
export function isSyntheticLookFixtureKey(key: string | undefined): boolean {
  return key === SYNTHETIC_FIXTURE_KEY
}
