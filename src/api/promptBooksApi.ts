// Type definitions for the prompt-book API — the operator's script view.
//
// A prompt-book binds one imported PDF script to the project's show:
//   • the script is identified by content hash (never filename),
//   • cue anchors pin cues to normalized regions on script pages,
//   • free annotations carry operator commentary (notes, cuts, freetext).
// The cue's lighting payload stays in the cue stack — anchors store only the binding.

/** A rectangle on a single script page, normalized to [0,1]. y grows downward. */
export interface Rect {
  /** 0-based page index within the PDF. */
  page: number
  x: number
  y: number
  w: number
  h: number
}

/** One-or-more rects — multiple rects span page breaks / wrapped lines. */
export type Region = Rect[]

export type AnnotationKind = 'NOTE' | 'STRIKETHROUGH' | 'FREETEXT'

/**
 * Severity/intent of a NOTE — drives the callout colour in the reader
 * (NOTE=blue, WARN=amber, SAFETY=red). Only meaningful for NOTE annotations;
 * null (or on non-NOTE kinds) reads as NOTE.
 */
export type NoteTone = 'NOTE' | 'WARN' | 'SAFETY'

export interface CueAnchorDto {
  cueId: number
  region: Region
  /** Cached display label ("LX 12") — rendering convenience, not identity. */
  label: string | null
}

export interface AnnotationDto {
  id: number
  kind: AnnotationKind
  region: Region
  text: string | null
  color: string | null
  tone: NoteTone | null
}

export interface PromptBookSummary {
  id: number
  name: string
  scriptHash: string
  scriptFileName: string | null
  pageCount: number
  anchorCount: number
  annotationCount: number
  canEdit: boolean
}

export interface PromptBookDetails {
  id: number
  name: string
  scriptHash: string
  scriptFileName: string | null
  pageCount: number
  anchors: CueAnchorDto[]
  annotations: AnnotationDto[]
  canEdit: boolean
}

export interface NewPromptBookRequest {
  name: string
  scriptHash: string
  pageCount: number
  scriptFileName?: string
}

export interface UpsertAnchorRequest {
  region: Region
  label?: string
}

export interface AnnotationRequest {
  kind: AnnotationKind
  region: Region
  text?: string
  color?: string
  tone?: NoteTone
}

export interface ScriptUploadResponse {
  scriptHash: string
  sizeBytes: number
}

/**
 * URL for the stored script PDF. Content-addressed, so the response is served
 * immutable — feed this straight to react-pdf's `file` prop and let HTTP caching
 * do the rest. Kept out of RTK Query on purpose: it's binary, not state.
 */
export function scriptDocUrl(projectId: number, scriptHash: string): string {
  return `/api/rest/project/${projectId}/prompt-books/scripts/${scriptHash}`
}
