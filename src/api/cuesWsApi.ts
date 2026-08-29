import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createChangeSignalApi } from './wsSubscriptionFactory'

export interface CuesWsApi {
  subscribe(fn: () => void): Subscription
}

export function createCuesWsApi(conn: InternalApiConnection): CuesWsApi {
  return createChangeSignalApi(conn, 'cueListChanged')
}
