// Type definitions for show API — a project IS a show, entries belong directly to the project.

export type ShowEntryType = 'STACK' | 'MARKER'

export interface ShowEntryDto {
  id: number
  entryType: ShowEntryType
  sortOrder: number
  label: string | null
  cueStackId: number | null
  cueStackName: string | null
}

export interface ShowDetails {
  projectId: number
  activeEntryId: number | null
  entries: ShowEntryDto[]
  canEdit: boolean
}

export interface AddStackToShowRequest {
  cueStackId: number
  sortOrder?: number
  label?: string
}

export interface AddMarkerToShowRequest {
  label: string
  sortOrder?: number
}

export interface UpdateShowEntryRequest {
  label?: string
  sortOrder?: number
}

export interface ReorderEntriesRequest {
  entryIds: number[]
}

export interface AdvanceShowRequest {
  direction: 'FORWARD' | 'BACKWARD'
  deactivatePrevious?: boolean
}

export interface GoToShowEntryRequest {
  entryId: number
}

export interface ShowActivateResponse {
  projectId: number
  // Null when activating an empty show (no entries yet).
  activeEntryId: number | null
  activatedStackId: number | null
  activatedStackName: string | null
}

export interface ShowChangedEvent {
  projectId: number
  activeEntryId: number | null
  activatedStackId: number | null
  activatedStackName: string | null
}
