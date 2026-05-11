import { BODY_LENS_COLOR } from './palette'
import type { FixtureBodyProps } from './types'

export function LaserBody({ active, headRef, lensRef }: FixtureBodyProps) {
  return (
    <group ref={headRef}>
      <mesh>
        <boxGeometry args={[0.18, 0.1, 0.16]} />
        <meshStandardMaterial color={active ? '#3a3f48' : '#23262c'} />
      </mesh>
      <mesh ref={lensRef} position={[0, -0.05 - 0.001, 0]}>
        <sphereGeometry args={[0.025, 12, 8]} />
        <meshBasicMaterial color={BODY_LENS_COLOR} />
      </mesh>
    </group>
  )
}
