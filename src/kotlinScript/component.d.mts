import { Component } from "react"

/**
 * The prop shape `component.mjs` forwards to the `kotlin-playground` widget.
 *
 * This file replaces a `propTypes` block that React 19 no longer validates, so it is
 * now the only description of the surface — and it is deliberately stricter than that
 * block was, because two of the widget's attributes are read by *presence* rather than
 * by value:
 *
 * - `highlightOnly` is `targetNode.hasAttribute(...)` unless the value is exactly
 *   `"nocursor"`. So `highlightOnly="false"` makes the editor read-only, and only
 *   omitting the prop makes it editable. It is typed here so the falsy case can only
 *   be `undefined` — the natural tidy-up `String(readOnly)` no longer compiles.
 * - `noneMarkers`, `indent`, `from` and `to` are likewise presence-tested, but the
 *   wrapper has no caller for them.
 *
 * Every other flag below is compared `=== "true"`, so `"false"` genuinely turns it off.
 */
export interface ReactKotlinPlaygroundProps {
  /** Class name for the wrapper `div` the widget mounts inside. */
  className?: string

  /** The `kotlin-playground` factory. `index.mjs` supplies this; callers do not. */
  playground?: (target: string | HTMLElement, ...args: unknown[]) => unknown

  // Event proxies. The wrapper forwards each of these straight through.
  onChange?: (code: string) => void
  onConsoleOpen?: () => void
  onConsoleClose?: () => void
  getInstance?: (instance: unknown) => void
  getJsCode?: (code: string) => void
  onRun?: () => void
  onError?: (errors: unknown) => void

  /** Initial editor content, including the widget's own `//sampleStart` fold markers. */
  value?: string

  version?: string
  args?: string | string[]
  targetPlatform?: "junit" | "canvas" | "js" | "java"

  /** Presence-tested — see the note above. Never pass `"false"`. */
  highlightOnly?: "true" | "nocursor"

  jsLibs?: string
  autoIndent?: boolean
  theme?: string
  mode?:
    | "kotlin"
    | "js"
    | "java"
    | "groovy"
    | "xml"
    | "c"
    | "shell"
    | "swift"
    | "obj-c"
  minCompilerVersion?: string
  autocomplete?: "true" | "false"
  highlightOnFly?: "true" | "false"
  indent?: number
  lines?: "true" | "false"
  from?: number
  to?: number
  outputHeight?: number
  matchBrackets?: "true" | "false"
  mobileShorterHeight?: number
}

export default class ReactKotlinPlayground extends Component<ReactKotlinPlaygroundProps> {}
