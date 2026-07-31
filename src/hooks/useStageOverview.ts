import { usePersistentToggle } from './usePersistentState'

export function useStageOverview() {
  const { isVisible, toggle, hide } = usePersistentToggle('stage-overview-visible')
  return { isVisible, toggle, hide }
}
