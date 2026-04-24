import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupListQuery } from '@/store/groups'
import { useCurrentProjectQuery } from '@/store/projects'
import {
  useClearPresetPreviewMutation,
  usePreviewPresetMutation,
} from '@/store/fxPresets'
import type {
  FxPresetPropertyAssignment,
  PresetPreviewRequest,
  TogglePresetTarget,
} from '@/api/fxPresetsApi'

interface PresetLivePreviewProps {
  /** Preset's declared fixture type. Drives the fixture filter. */
  fixtureType: string | null
  propertyAssignments: FxPresetPropertyAssignment[]
  palette: string[]
}

const PUSH_DEBOUNCE_MS = 80

function toggleInSet<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

interface TargetPillsProps<T> {
  label: string
  items: T[]
  isSelected: (item: T) => boolean
  onToggle: (item: T) => void
  renderLabel: (item: T) => React.ReactNode
  keyOf: (item: T) => string
}

function TargetPills<T>({ label, items, isSelected, onToggle, renderLabel, keyOf }: TargetPillsProps<T>) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const on = isSelected(item)
          return (
            <button
              key={keyOf(item)}
              type="button"
              onClick={() => onToggle(item)}
              className={cn(
                'px-2 py-0.5 rounded-md border text-[11px] transition-colors',
                on
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-accent',
              )}
            >
              {renderLabel(item)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * "Live Preview" panel inside the PresetEditor. While enabled, the in-progress draft is
 * pushed to the backend's project-scoped preview slot on every change (debounced); on
 * toggle-off and on unmount the slot is cleared. Group targets are not pre-filtered by
 * fixture type — the backend silently skips members whose typeKey doesn't match.
 */
export function PresetLivePreview({
  fixtureType,
  propertyAssignments,
  palette,
}: PresetLivePreviewProps) {
  const { data: currentProject } = useCurrentProjectQuery()
  const projectId = currentProject?.id

  const { data: fixtureList } = useFixtureListQuery()
  const groups = useGroupListQuery().data ?? []
  const [pushPreview, { isLoading: isPushing }] = usePreviewPresetMutation()
  const [clearPreview] = useClearPresetPreviewMutation()

  const [enabled, setEnabled] = useState(false)
  const [selectedFixtures, setSelectedFixtures] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  const compatibleFixtures = useMemo(() => {
    if (!fixtureType || !fixtureList) return []
    return fixtureList.filter((f) => f.typeKey === fixtureType)
  }, [fixtureList, fixtureType])

  const targets = useMemo<TogglePresetTarget[]>(() => {
    const out: TogglePresetTarget[] = []
    for (const key of selectedFixtures) out.push({ type: 'fixture', key })
    for (const key of selectedGroups) out.push({ type: 'group', key })
    return out
  }, [selectedFixtures, selectedGroups])

  // Skip identical re-pushes — `propertyAssignments` and `targets` re-identity on every
  // parent render even when their contents are unchanged.
  const lastSentRef = useRef<string | null>(null)
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const schedulePush = useCallback(() => {
    if (!projectId) return
    const payload: PresetPreviewRequest = { propertyAssignments, palette, targets }
    const sig = JSON.stringify(payload)
    if (sig === lastSentRef.current) return
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null
      lastSentRef.current = sig
      pushPreview({ projectId, ...payload })
    }, PUSH_DEBOUNCE_MS)
  }, [projectId, pushPreview, propertyAssignments, palette, targets])

  useEffect(() => {
    if (!enabled) return
    schedulePush()
    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current)
        pushTimerRef.current = null
      }
    }
  }, [enabled, schedulePush])

  // Clear on unmount only — toggle-off clears via the button handler so we don't fire a
  // spurious DELETE on first mount when `enabled` starts false.
  useEffect(() => {
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
      if (projectId) clearPreview({ projectId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = () => {
    setEnabled((wasEnabled) => {
      const nowEnabled = !wasEnabled
      if (!nowEnabled && projectId) {
        lastSentRef.current = null
        clearPreview({ projectId })
      }
      return nowEnabled
    })
  }

  const targetCount = targets.length
  const isActive = enabled && targetCount > 0

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          <Activity className="size-3.5" />
          Live Preview
          {isActive && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 ml-1">
              {targetCount} target{targetCount === 1 ? '' : 's'}
            </Badge>
          )}
          {isPushing && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </Label>
        <Button
          type="button"
          variant={enabled ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          onClick={handleToggle}
          disabled={!fixtureType || !projectId}
        >
          {enabled ? 'On' : 'Off'}
        </Button>
      </div>

      {!fixtureType ? (
        <p className="text-[11px] text-muted-foreground">
          Pick a fixture type above to enable live preview.
        </p>
      ) : enabled ? (
        <div className="space-y-2">
          <TargetPills
            label="Fixtures"
            items={compatibleFixtures}
            keyOf={(f) => f.key}
            isSelected={(f) => selectedFixtures.has(f.key)}
            onToggle={(f) => setSelectedFixtures((prev) => toggleInSet(prev, f.key))}
            renderLabel={(f) => f.name}
          />
          <TargetPills
            label="Groups"
            items={groups}
            keyOf={(g) => g.name}
            isSelected={(g) => selectedGroups.has(g.name)}
            onToggle={(g) => setSelectedGroups((prev) => toggleInSet(prev, g.name))}
            renderLabel={(g) => (
              <>
                {g.name}
                <span className="ml-1 text-[10px] opacity-70">×{g.memberCount}</span>
              </>
            )}
          />
          {compatibleFixtures.length === 0 && groups.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No fixtures of type{' '}
              <code className="text-[10px] bg-background px-1 py-0.5 rounded">
                {fixtureType}
              </code>{' '}
              or groups available in this project.
            </p>
          )}
          {targetCount === 0 && (compatibleFixtures.length > 0 || groups.length > 0) && (
            <p className="text-[11px] text-muted-foreground">
              Pick at least one target to start previewing.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Toggle on to apply the in-progress draft to a scratch fixture or group selection.
          Stage updates live as you edit; turning off (or closing the editor) clears it.
        </p>
      )}
    </div>
  )
}
