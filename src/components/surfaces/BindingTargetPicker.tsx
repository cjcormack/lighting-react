import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGroupListQuery } from "@/store/groups"
import { usePatchListQuery } from "@/store/patches"
import { useProjectCueStackListQuery } from "@/store/cueStacks"
import type { BindingTarget, TakeoverPolicy } from "@/store/surfaces"

interface BindingTargetPickerProps {
  projectId: number
  /** True if the selected control is a fader/encoder (continuous). False for buttons. */
  continuous: boolean
  value: BindingTarget
  onChange: (target: BindingTarget) => void
  policy: TakeoverPolicy | null
  onPolicyChange: (policy: TakeoverPolicy | null) => void
}

type TargetKind =
  | "fixtureProperty"
  | "groupProperty"
  | "cueStackGo"
  | "cueStackBack"
  | "cueStackPause"
  | "fireCue"
  | "flash"
  | "blackout"
  | "grandMasterToggle"
  | "setBank"

const CONTINUOUS_KINDS: TargetKind[] = ["fixtureProperty", "groupProperty"]
const BUTTON_KINDS: TargetKind[] = [
  "flash",
  "cueStackGo",
  "cueStackBack",
  "cueStackPause",
  "fireCue",
  "blackout",
  "grandMasterToggle",
  "setBank",
]

const KIND_LABELS: Record<TargetKind, string> = {
  fixtureProperty: "Fixture property",
  groupProperty: "Group property",
  cueStackGo: "Cue stack — Go",
  cueStackBack: "Cue stack — Back",
  cueStackPause: "Cue stack — Pause",
  fireCue: "Fire cue",
  flash: "Flash",
  blackout: "Blackout",
  grandMasterToggle: "Grand Master",
  setBank: "Set bank",
}

export function BindingTargetPicker({
  projectId,
  continuous,
  value,
  onChange,
  policy,
  onPolicyChange,
}: BindingTargetPickerProps) {
  const options = continuous ? CONTINUOUS_KINDS : BUTTON_KINDS
  const currentKind = value.type as TargetKind
  const [kind, setKind] = useState<TargetKind>(options.includes(currentKind) ? currentKind : options[0])

  const { data: groups } = useGroupListQuery()
  const { data: patches } = usePatchListQuery(projectId)
  const { data: stacks } = useProjectCueStackListQuery(projectId)

  const fixtureOptions = useMemo(
    () => (patches ?? []).map((p) => ({ key: p.key, label: p.displayName })),
    [patches],
  )
  const groupOptions = useMemo(
    () => (groups ?? []).map((g) => g.name),
    [groups],
  )

  function changeKind(next: TargetKind) {
    setKind(next)
    onChange(defaultForKind(next, fixtureOptions, groupOptions, stacks))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Target type</Label>
        <Select value={kind} onValueChange={(v) => changeKind(v as TargetKind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>{KIND_LABELS[o]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TargetBody
        kind={kind}
        value={value}
        onChange={onChange}
        fixtureOptions={fixtureOptions}
        groupOptions={groupOptions}
        stacks={stacks ?? []}
      />

      {continuous && (value.type === "fixtureProperty" || value.type === "groupProperty") && (
        <div className="space-y-1.5">
          <Label className="text-xs">Takeover policy</Label>
          <Select
            value={policy ?? "DEFAULT"}
            onValueChange={(v) => onPolicyChange(v === "DEFAULT" ? null : (v as TakeoverPolicy))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DEFAULT">Device default</SelectItem>
              <SelectItem value="IMMEDIATE">Immediate</SelectItem>
              <SelectItem value="PICKUP">Pickup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

function TargetBody({
  kind,
  value,
  onChange,
  fixtureOptions,
  groupOptions,
  stacks,
}: {
  kind: TargetKind
  value: BindingTarget
  onChange: (v: BindingTarget) => void
  fixtureOptions: { key: string; label: string }[]
  groupOptions: string[]
  stacks: { id: number; name: string }[]
}) {
  if (kind === "fixtureProperty" && value.type === "fixtureProperty") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Fixture</Label>
          <Select
            value={value.fixtureKey}
            onValueChange={(v) => onChange({ ...value, fixtureKey: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {fixtureOptions.map((f) => (
                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Property</Label>
          <Input
            value={value.propertyName}
            onChange={(e) => onChange({ ...value, propertyName: e.target.value })}
            placeholder="dimmer"
          />
        </div>
      </div>
    )
  }
  if (kind === "groupProperty" && value.type === "groupProperty") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Group</Label>
          <Select
            value={value.groupName}
            onValueChange={(v) => onChange({ ...value, groupName: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {groupOptions.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Property</Label>
          <Input
            value={value.propertyName}
            onChange={(e) => onChange({ ...value, propertyName: e.target.value })}
            placeholder="dimmer"
          />
        </div>
      </div>
    )
  }
  if (
    (kind === "cueStackGo" || kind === "cueStackBack" || kind === "cueStackPause") &&
    (value.type === "cueStackGo" || value.type === "cueStackBack" || value.type === "cueStackPause")
  ) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">Cue stack</Label>
        <Select
          value={String(value.stackId)}
          onValueChange={(v) => onChange({ ...value, stackId: Number(v) })}
        >
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {stacks.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  if (kind === "fireCue" && value.type === "fireCue") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">Cue ID</Label>
        <Input
          type="number"
          value={value.cueId}
          onChange={(e) => onChange({ ...value, cueId: Number(e.target.value) })}
        />
      </div>
    )
  }
  if (kind === "flash" && value.type === "flash") {
    return (
      <div className="space-y-2">
        <TargetBody
          kind={value.target.type as TargetKind}
          value={value.target}
          onChange={(inner) =>
            onChange({
              ...value,
              target: inner as typeof value.target,
            })
          }
          fixtureOptions={fixtureOptions}
          groupOptions={groupOptions}
          stacks={stacks}
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Max (0–255)</Label>
          <Input
            type="number"
            min={0}
            max={255}
            value={value.max ?? 255}
            onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
          />
        </div>
      </div>
    )
  }
  if (kind === "setBank" && value.type === "setBank") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Device type</Label>
          <Input
            value={value.deviceTypeKey}
            onChange={(e) => onChange({ ...value, deviceTypeKey: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bank</Label>
          <Input
            value={value.bank}
            onChange={(e) => onChange({ ...value, bank: e.target.value })}
          />
        </div>
      </div>
    )
  }
  return null
}

function defaultForKind(
  kind: TargetKind,
  fixtures: { key: string; label: string }[],
  groups: string[],
  stacks: { id: number; name: string }[] = [],
): BindingTarget {
  switch (kind) {
    case "fixtureProperty":
      return { type: "fixtureProperty", fixtureKey: fixtures[0]?.key ?? "", propertyName: "dimmer" }
    case "groupProperty":
      return { type: "groupProperty", groupName: groups[0] ?? "", propertyName: "dimmer" }
    case "cueStackGo":
      return { type: "cueStackGo", stackId: stacks[0]?.id ?? 0 }
    case "cueStackBack":
      return { type: "cueStackBack", stackId: stacks[0]?.id ?? 0 }
    case "cueStackPause":
      return { type: "cueStackPause", stackId: stacks[0]?.id ?? 0 }
    case "fireCue":
      return { type: "fireCue", cueId: 0 }
    case "flash":
      return {
        type: "flash",
        target: { type: "groupProperty", groupName: groups[0] ?? "", propertyName: "dimmer" },
        max: 255,
      }
    case "blackout":
      return { type: "blackout" }
    case "grandMasterToggle":
      return { type: "grandMasterToggle" }
    case "setBank":
      return { type: "setBank", deviceTypeKey: "", bank: "" }
  }
}
