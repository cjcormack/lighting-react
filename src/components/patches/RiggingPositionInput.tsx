import { Input } from '@/components/ui/input'
import { chipButtonClassName } from './chipButton'

interface RiggingPositionInputProps {
  id?: string
  value: string | null
  onChange: (next: string | null) => void
  presets: readonly string[]
}

export function RiggingPositionInput({
  id,
  value,
  onChange,
  presets,
}: RiggingPositionInputProps) {
  const current = value ?? ''
  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={current}
        placeholder="e.g. LX1, ADV 2, FOH"
        className="font-mono"
        onChange={(e) => {
          const next = e.target.value.toUpperCase()
          onChange(next.length === 0 ? null : next)
        }}
      />
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono ${chipButtonClassName(p === current)}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
