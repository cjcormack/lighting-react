import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { lightingApi } from '../api/lightingApi'
import {
  createOverlayChannelSource,
  createProgrammerChannelSource,
  outputChannelSource,
  type ChannelSource,
  type DerivedChannelSource,
} from '../api/channelSource'
import { descriptorsByTarget, type DescriptorsByTarget } from '../lib/programmerChannels'
import { useFixtureLookup } from './useFixtureLookup'
import { useVisSource, type VisSource } from './useVisSource'

/**
 * Which [ChannelSource] the value hooks in this subtree read from.
 *
 * Defaults to the wire, so every surface that doesn't opt in — the fixtures sheet, the busking
 * pads, `FixtureDetailView` — keeps showing real output with no change. Only the stage canvases
 * mount a provider. Same shape as `EditorContext`, which already switches these hooks between live
 * and preset-draft values.
 */
const ChannelSourceContext = createContext<ChannelSource>(outputChannelSource)

export function useChannelSource(): ChannelSource {
  return useContext(ChannelSourceContext)
}

/**
 * Point a subtree at an explicit source.
 *
 * [StageChannelSourceProvider] is what the app mounts; this is the plain version, for tests and
 * for any future surface that already knows which source it wants.
 */
export function ChannelSourceProvider({
  source,
  children,
}: {
  source: ChannelSource
  children: ReactNode
}) {
  return <ChannelSourceContext.Provider value={source}>{children}</ChannelSourceContext.Provider>
}

const EMPTY_DESCRIPTORS: DescriptorsByTarget = new Map()

/**
 * The programmer-backed source, alive only while something needs it.
 *
 * Created in an effect rather than a `useMemo`: the app runs under `StrictMode`, which
 * double-invokes render, and a source built during a discarded render would leak its programmer
 * subscription with nothing left holding a reference to dispose it.
 */
function useProgrammerSource(enabled: boolean): DerivedChannelSource | null {
  const { fixtures } = useFixtureLookup()
  const descriptors = useMemo(
    () => (fixtures ? descriptorsByTarget(fixtures) : EMPTY_DESCRIPTORS),
    [fixtures],
  )
  // Read through a ref so the source itself never needs rebuilding when the patch changes —
  // re-creating it would drop and re-add every channel subscription in the stage.
  const descriptorsRef = useRef(descriptors)
  descriptorsRef.current = descriptors

  const [source, setSource] = useState<DerivedChannelSource | null>(null)

  useEffect(() => {
    if (!enabled) return
    const created = createProgrammerChannelSource(
      lightingApi.programmer,
      () => descriptorsRef.current,
    )
    setSource(created)
    return () => {
      created.dispose()
      setSource(null)
    }
  }, [enabled])

  // The fixture list usually arrives *after* the stage mounts, so the first build resolves
  // nothing. Recompute once it lands, and on any later patch change.
  useEffect(() => {
    source?.refresh()
  }, [source, descriptors])

  return source
}

/**
 * Resolve a [VisSource] to the channel source that renders it.
 *
 * Falls back to output while the programmer source is still being built, which costs one frame
 * after a selector flip and nothing at all in steady state.
 */
export function useResolvedChannelSource(visSource: VisSource): ChannelSource {
  const programmer = useProgrammerSource(visSource !== 'output')
  return useMemo(() => {
    if (!programmer) return outputChannelSource
    switch (visSource) {
      case 'output':
        return outputChannelSource
      case 'outputProgrammer':
        return createOverlayChannelSource(outputChannelSource, programmer)
      case 'programmer':
        return programmer
    }
  }, [visSource, programmer])
}

/**
 * Point a stage canvas at whichever layer the operator selected.
 *
 * Wrap **only the canvas**. The Stage route's docked `StageFixtureControlPanel` is a live editor
 * and has to keep reading real output, so this must not go around a subtree that contains it.
 */
export function StageChannelSourceProvider({ children }: { children: ReactNode }) {
  const visSource = useVisSource()
  const source = useResolvedChannelSource(visSource)
  return <ChannelSourceProvider source={source}>{children}</ChannelSourceProvider>
}
