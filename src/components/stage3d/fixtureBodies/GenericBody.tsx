import { BODY_LENS_COLOR } from './palette'
import type { FixtureBodyProps } from './types'

// Cylinder yoke + sphere lens — used as the dispatch fallback for unknown
// or unset kinds.
export function GenericBody({ active, headRef, lensRef }: FixtureBodyProps) {
  return (
    <>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.1, 16]} />
        <meshStandardMaterial color={active ? '#9aa5b4' : '#6a7280'} />
      </mesh>
      <group ref={headRef}>
        <mesh ref={lensRef}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial color={BODY_LENS_COLOR} />
        </mesh>
      </group>
    </>
  )
}
