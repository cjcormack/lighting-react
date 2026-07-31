import { usePersistentToggle } from './usePersistentState'

export function useFixtureOverview() {
  const { isVisible, toggle, hide } = usePersistentToggle('fixture-overview-visible')
  return { isVisible, toggle, hide }
}
