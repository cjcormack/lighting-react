import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import { NoToneMapping } from 'three'
import { usePatchListQuery } from '../../store/patches'
import { useRiggingListQuery } from '../../store/riggings'
import { useStageRegionListQuery } from '../../store/stageRegions'
import { useProjectQuery } from '../../store/projects'
import {
  useFixtureListQuery,
  useFixtureTypeListQuery,
  type Fixture,
  type FixtureTypeInfo,
} from '../../store/fixtures'
import { Bloom } from './Bloom'
import { StageRegionMeshes } from './StageRegionMeshes'
import { RiggingMeshes } from './RiggingMeshes'
import { FixtureModel } from './FixtureModel'
import type { RiggingDto } from '../../api/riggingApi'

// Stable empty array so child useMemo deps don't bust on every parent render
// while RTK Query is still loading.
const EMPTY_RIGGINGS: RiggingDto[] = []

interface Stage3DProps {
  projectId: number
  selectedFixtureKey: string | null
  onFixtureClick: (fixtureKey: string) => void
}

export function Stage3D({ projectId, selectedFixtureKey, onFixtureClick }: Stage3DProps) {
  const { data: project } = useProjectQuery(projectId)
  const { data: regions } = useStageRegionListQuery(projectId)
  const { data: riggings } = useRiggingListQuery(projectId)
  const { data: patches } = usePatchListQuery(projectId)
  const { data: fixtures } = useFixtureListQuery()
  const { data: fixtureTypes } = useFixtureTypeListQuery()

  const stageW = project?.stageWidthM ?? 10
  const stageD = project?.stageDepthM ?? 8
  const stageH = project?.stageHeightM ?? 6

  const fixtureByKey = useMemo(() => {
    const map = new Map<string, Fixture>()
    fixtures?.forEach((f) => map.set(f.key, f))
    return map
  }, [fixtures])

  const typeByKey = useMemo(() => {
    const map = new Map<string, FixtureTypeInfo>()
    fixtureTypes?.forEach((t) => map.set(t.typeKey, t))
    return map
  }, [fixtureTypes])

  const cameraDistance = Math.max(stageW, stageD) * 1.4
  const gridSize = Math.max(stageW, stageD) * 1.6
  const safeRiggings = riggings ?? EMPTY_RIGGINGS

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ toneMapping: NoToneMapping, antialias: true }}
      camera={{ position: [0, stageH * 0.7, cameraDistance], fov: 45 }}
      style={{ background: '#0b0e14' }}
    >
      <ambientLight intensity={0.35} />
      <gridHelper args={[gridSize, 20, '#3a3a3a', '#1f1f1f']} />
      <StageBoxOutline width={stageW} depth={stageD} height={stageH} />
      <StageRegionMeshes regions={regions ?? []} />
      <RiggingMeshes riggings={safeRiggings} />
      {(patches ?? []).map((patch) => {
        const fixture = fixtureByKey.get(patch.key)
        const fixtureType = fixture ? typeByKey.get(fixture.typeKey) : undefined
        return (
          <FixtureModel
            key={patch.id}
            patch={patch}
            fixture={fixture}
            fixtureType={fixtureType}
            riggings={safeRiggings}
            selected={selectedFixtureKey === patch.key}
            onClick={() => onFixtureClick(patch.key)}
          />
        )
      })}
      <OrbitControls makeDefault enableDamping target={[0, stageH / 4, 0]} />
      <Bloom />
    </Canvas>
  )
}

// Wireframe box marking the stage boundary — pure orientation aid. The stage
// occupies lighting (X∈[-w/2,w/2], Y∈[0,d], Z∈[0,h]) which swizzles to R3F
// (x∈[-w/2,w/2], y∈[0,h], z∈[-d,0]). Box centre is therefore (0, h/2, -d/2).
function StageBoxOutline({
  width,
  depth,
  height,
}: {
  width: number
  depth: number
  height: number
}) {
  return (
    <mesh position={[0, height / 2, -depth / 2]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial visible={false} />
      <Edges color="#5a6a7a" />
    </mesh>
  )
}
