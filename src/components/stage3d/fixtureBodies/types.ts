import type { Group, Mesh } from 'three'

export interface FixtureBodyProps {
  active: boolean
  headRef: React.RefObject<Group | null>
  lensRef: React.RefObject<Mesh | null>
}
