import { BODY_LENS_COLOR, housingColor, yokeColor } from './palette'
import { bodyScale, type FixtureBodyProps } from './types'

const ARM_HEIGHT = 0.18
const ARM_X = 0.085
const HEAD_PIVOT_Y = ARM_HEIGHT
const HOUSING_LEN = 0.16
// Largest design extent (base-to-head vertical) — sized to the real fixture.
const DESIGN_SIZE = 0.33

// headRef sits at the pivot point so useBeamDirector's quaternion rotates the
// head about its yoke axis. Head's rest pose points -Y (down), matching
// `headQuaternionFor`; the lens lives at the -Y end of the housing so it ends
// up on the beam-facing face after rotation. Sphere lens (not a disc) avoids
// edge-on flicker through bloom during orbit.
export function MovingHeadBody({ active, headRef, lensRef, dims }: FixtureBodyProps) {
  const yoke = yokeColor(active)
  const housing = housingColor(active)
  return (
    <group scale={bodyScale(dims, DESIGN_SIZE)}>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.1, 0.11, 0.06, 20]} />
        <meshStandardMaterial color={yoke} />
      </mesh>
      <mesh position={[ARM_X, ARM_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.03, ARM_HEIGHT, 0.06]} />
        <meshStandardMaterial color={yoke} />
      </mesh>
      <mesh position={[-ARM_X, ARM_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.03, ARM_HEIGHT, 0.06]} />
        <meshStandardMaterial color={yoke} />
      </mesh>
      <group ref={headRef} position={[0, HEAD_PIVOT_Y, 0]}>
        <mesh>
          <cylinderGeometry args={[0.075, 0.07, HOUSING_LEN, 18]} />
          <meshStandardMaterial color={housing} />
        </mesh>
        <mesh ref={lensRef} position={[0, -HOUSING_LEN / 2, 0]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshBasicMaterial color={BODY_LENS_COLOR} />
        </mesh>
      </group>
    </group>
  )
}
