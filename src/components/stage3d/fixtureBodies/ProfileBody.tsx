import { BODY_LENS_COLOR, housingColor, yokeColor } from './palette'
import { bodyScale, type FixtureBodyProps } from './types'

const HOUSING_LEN = 0.36
const DESIGN_SIZE = 0.4

// Long ellipsoidal-spot housing (Source 4-style). The whole fixture is aimed
// by patch.baseYawDeg/basePitchDeg on the parent group, so the head subgroup
// here is an idle pass-through — useBeamDirector will still write its
// quaternion, but with no pan/tilt sliders that quaternion is identity.
export function ProfileBody({ active, headRef, lensRef, dims }: FixtureBodyProps) {
  return (
    <group scale={bodyScale(dims, DESIGN_SIZE)}>
      <mesh position={[0, 0, 0.12]}>
        <boxGeometry args={[0.18, 0.04, 0.04]} />
        <meshStandardMaterial color={yokeColor(active)} />
      </mesh>
      <group ref={headRef}>
        {/* Slight taper toward the lens end reads as ellipsoidal. */}
        <mesh position={[0, -HOUSING_LEN / 2, 0]}>
          <cylinderGeometry args={[0.045, 0.07, HOUSING_LEN, 16]} />
          <meshStandardMaterial color={housingColor(active)} />
        </mesh>
        <mesh ref={lensRef} position={[0, -HOUSING_LEN, 0]}>
          <sphereGeometry args={[0.045, 14, 10]} />
          <meshBasicMaterial color={BODY_LENS_COLOR} />
        </mesh>
      </group>
    </group>
  )
}
