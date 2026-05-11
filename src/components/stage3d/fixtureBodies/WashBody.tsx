import { BODY_LENS_COLOR, housingColor, yokeColor } from './palette'
import type { FixtureBodyProps } from './types'

const HOUSING_LEN = 0.1

export function WashBody({ active, headRef, lensRef }: FixtureBodyProps) {
  return (
    <>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.2, 0.03, 0.03]} />
        <meshStandardMaterial color={yokeColor(active)} />
      </mesh>
      <group ref={headRef}>
        <mesh position={[0, -HOUSING_LEN / 2, 0]}>
          <cylinderGeometry args={[0.1, 0.095, HOUSING_LEN, 20]} />
          <meshStandardMaterial color={housingColor(active)} />
        </mesh>
        <mesh ref={lensRef} position={[0, -HOUSING_LEN, 0]}>
          <sphereGeometry args={[0.09, 16, 10]} />
          <meshBasicMaterial color={BODY_LENS_COLOR} />
        </mesh>
      </group>
    </>
  )
}
