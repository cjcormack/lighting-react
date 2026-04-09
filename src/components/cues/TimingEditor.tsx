import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TimingMode = 'immediate' | 'delayed' | 'recurring'

interface TimingValues {
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
}

interface TimingEditorProps {
  values: TimingValues
  onChange: (values: TimingValues) => void
}

function getTimingMode(values: TimingValues): TimingMode {
  if (values.intervalMs) return 'recurring'
  if (values.delayMs) return 'delayed'
  return 'immediate'
}

/**
 * Timing editor for preset applications and ad-hoc effects.
 * Always shows the mode dropdown; conditional inputs appear based on selection.
 */
export function TimingEditor({ values, onChange }: TimingEditorProps) {
  const mode = getTimingMode(values)

  const handleModeChange = (newMode: TimingMode) => {
    switch (newMode) {
      case 'immediate':
        onChange({ delayMs: null, intervalMs: null, randomWindowMs: null })
        break
      case 'delayed':
        onChange({ delayMs: values.delayMs ?? 2000, intervalMs: null, randomWindowMs: null })
        break
      case 'recurring':
        onChange({
          delayMs: values.delayMs,
          intervalMs: values.intervalMs ?? 5000,
          randomWindowMs: values.randomWindowMs,
        })
        break
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">When to apply</Label>
        <Select value={mode} onValueChange={(v) => handleModeChange(v as TimingMode)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="immediate">Immediately</SelectItem>
            <SelectItem value="delayed">After delay</SelectItem>
            <SelectItem value="recurring">Recurring</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'delayed' && (
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="timing-delay">Delay (ms)</Label>
          <Input
            id="timing-delay"
            type="number"
            min="100"
            step="100"
            value={values.delayMs ?? ''}
            onChange={(e) => onChange({ ...values, delayMs: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 2000"
            className="h-8 text-xs"
          />
        </div>
      )}

      {mode === 'recurring' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="timing-interval">Interval (ms)</Label>
            <Input
              id="timing-interval"
              type="number"
              min="100"
              step="100"
              value={values.intervalMs ?? ''}
              onChange={(e) => onChange({ ...values, intervalMs: e.target.value ? Number(e.target.value) : null })}
              placeholder="e.g. 40000"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="timing-random">Random window (ms)</Label>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Each interval varies by +- this amount for organic timing.
            </p>
            <Input
              id="timing-random"
              type="number"
              min="0"
              step="100"
              value={values.randomWindowMs ?? ''}
              onChange={(e) => onChange({ ...values, randomWindowMs: e.target.value ? Number(e.target.value) : null })}
              placeholder="e.g. 5000"
              className="h-8 text-xs"
            />
          </div>
        </>
      )}
    </div>
  )
}
