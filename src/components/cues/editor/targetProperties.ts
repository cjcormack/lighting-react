import { useMemo } from 'react'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupPropertiesQuery } from '@/store/groups'
import type { PropertyDescriptor } from '@/store/fixtures'
import type { GroupPropertyDescriptor } from '@/api/groupsApi'
import type { CueTarget } from '@/api/cuesApi'

export interface AvailableProperty {
  name: string
  displayName: string
  type: 'slider' | 'colour' | 'position' | 'setting'
  category: string
}

/** Return the addable property descriptors for the given cue target. Empty when
 *  fixture/group data hasn't loaded or the target doesn't resolve. */
export function useTargetProperties(target: CueTarget | null): AvailableProperty[] {
  const { data: fixtures } = useFixtureListQuery()
  const { data: groupProps } = useGroupPropertiesQuery(target?.key ?? '', {
    skip: target?.type !== 'group',
  })

  return useMemo(() => {
    if (!target) return []
    if (target.type === 'fixture') {
      const fixture = fixtures?.find((f) => f.key === target.key)
      if (!fixture) return []
      return fixture.properties.map(toAvailable)
    }
    if (!groupProps) return []
    return groupProps.map(toAvailableGroup)
  }, [target, fixtures, groupProps])
}

export function defaultValueFor(prop: AvailableProperty | undefined): string {
  if (!prop) return ''
  switch (prop.type) {
    case 'slider':
    case 'setting':
      return '0'
    case 'colour':
      return '#000000'
    case 'position':
      return '127,127'
  }
}

export function placeholderFor(prop: AvailableProperty): string {
  switch (prop.type) {
    case 'slider':
    case 'setting':
      return '0..255'
    case 'colour':
      return '#rrggbb or P1'
    case 'position':
      return 'pan,tilt'
  }
}

function toAvailable(p: PropertyDescriptor): AvailableProperty {
  return { name: p.name, displayName: p.displayName, type: p.type, category: p.category }
}

function toAvailableGroup(p: GroupPropertyDescriptor): AvailableProperty {
  return { name: p.name, displayName: p.displayName, type: p.type, category: p.category }
}
