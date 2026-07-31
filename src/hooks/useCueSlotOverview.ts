import { usePersistentToggle } from './usePersistentState'

export function useCueSlotOverview() {
  const { isVisible, toggle, hide } = usePersistentToggle('cue-slot-overview-visible')
  return { isVisible, toggle, hide }
}
