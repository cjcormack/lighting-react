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
  // A layer with no targets of its own contributes none here: it uses the Look's targets, which
  // this client cannot expand without fetching every Look's rows.
  for (const layer of cue.layers) {
    for (const t of layer.targets) push(t)
  }

  return out
}

export function targetKey(t: CueTarget): string {
  return `${t.type}:${t.key}`
}

export function targetEquals(a: CueTarget, b: CueTarget): boolean {
  return a.type === b.type && a.key === b.key
}
