import { BODY_LENS_COLOR, housingColor } from './palette'
import type { FixtureBodyProps } from './types'

const STRIP_LEN = 0.6
const STRIP_DEPTH = 0.06
const STRIP_HEIGHT = 0.05

// Per-pixel lenses are deferred — a STRIP renders as a single fixture for now
// even when the underlying type is multi-element.
export function StripBody({ active, headRef, lensRef }: FixtureBodyProps) {
  return (
    <group ref={headRef}>
      <mesh>
        <boxGeometry args={[STRIP_LEN, STRIP_HEIGHT, STRIP_DEPTH]} />
        <meshStandardMaterial color={housingColor(active)} />
      </mesh>
      <mesh ref={lensRef} position={[0, -STRIP_HEIGHT / 2 - 0.001, 0]}>
        <boxGeometry args={[STRIP_LEN * 0.95, 0.01, STRIP_DEPTH * 0.85]} />
        <meshBasicMaterial color={BODY_LENS_COLOR} />
      </mesh>
    </group>
  )
}
