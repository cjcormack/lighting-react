import type { FixtureTypeMode } from '@/api/fxPresetsApi'
import type { Fixture } from '@/store/fixtures'

const SYNTHETIC_FIXTURE_KEY = '__preset_editor__'

/**
 * Build a `Fixture`-shaped object from a `FixtureTypeMode` for use inside `PresetEditor`.
 *
 * The invented `ChannelRef`s never hit the DMX engine because all property reads + writes
 * inside the editor subtree are routed via `PresetDraftContext` (preset mode). They only
 * need to satisfy the structural shape that `FixtureContent` iterates over (and the
 * subscribe/get helpers in the read hooks fall through to channel snapshots in preset mode
 * but their result is never used — see [src/hooks/usePropertyValues.ts]).
 *
 * A single synthetic fixture is sufficient: preset assignments are single-head in Phase 3,
 * so we don't populate `elements` or `elementGroupProperties`. If that changes later
 * (plan flags per-head preset assignments as a follow-up), this helper is the one place
 * that needs to add element synthesis.
 */
export function buildSyntheticPresetFixture(mode: FixtureTypeMode): Fixture {
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
    compatiblePresetIds: [],
  }
}

/** Match this against `fixture.key` to detect a synthetic preset-editor fixture. */
export function isSyntheticPresetFixtureKey(key: string | undefined): boolean {
  return key === SYNTHETIC_FIXTURE_KEY
}
