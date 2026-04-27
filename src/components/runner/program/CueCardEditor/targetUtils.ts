import type { Cue, CueTarget } from '@/api/cuesApi'

/**
 * Order: insertion order across the three lists, deduplicated by `type:key`.
 */
export function collectCueTargets(cue: Cue): CueTarget[] {
  const seen = new Set<string>()
  const out: CueTarget[] = []

  const push = (t: CueTarget) => {
    const id = `${t.type}:${t.key}`
    if (seen.has(id)) return
    seen.add(id)
    out.push({ type: t.type, key: t.key })
  }

  for (const a of cue.propertyAssignments) push({ type: a.targetType, key: a.targetKey })
  for (const e of cue.adHocEffects) push({ type: e.targetType, key: e.targetKey })
  for (const p of cue.presetApplications) {
    for (const t of p.targets) push(t)
  }

  return out
}

export function targetKey(t: CueTarget): string {
  return `${t.type}:${t.key}`
}

export function targetEquals(a: CueTarget, b: CueTarget): boolean {
  return a.type === b.type && a.key === b.key
}
