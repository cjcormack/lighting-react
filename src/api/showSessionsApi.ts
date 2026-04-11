// Type definitions for show sessions API

export type ShowSessionEntryType = 'STACK' | 'MARKER'

export interface ShowSessionEntryDto {
  id: number
  entryType: ShowSessionEntryType
  sortOrder: number
  label: string | null
  cueStackId: number | null
  cueStackName: string | null
}

export interface ShowSessionDetails {
  id: number
  name: string
  sessionType: string
  activeEntryId: number | null
  entries: ShowSessionEntryDto[]
  canEdit: boolean
  canDelete: boolean
}

export interface NewShowSession {
  name: string
  sessionType?: string
}

export interface UpdateShowSession {
  name: string
  sessionType?: string
}

export interface AddStackToSessionRequest {
  cueStackId: number
  sortOrder?: number
  label?: string
}

export interface AddMarkerToSessionRequest {
  label: string
  sortOrder?: number
}

export interface UpdateShowSessionEntryRequest {
  label?: string
  sortOrder?: number
}

export interface ReorderEntriesRequest {
  entryIds: number[]
}

export interface AdvanceShowSessionRequest {
  direction: 'FORWARD' | 'BACKWARD'
  deactivatePrevious?: boolean
}

export interface GoToSessionEntryRequest {
  entryId: number
}

export interface ShowSessionActivateResponse {
  sessionId: number
  activeEntryId: number
  activatedStackId: number
  activatedStackName: string
}

export interface ShowSessionChangedEvent {
  sessionId: number
  activeEntryId: number | null
  activatedStackId: number | null
  activatedStackName: string | null
}
