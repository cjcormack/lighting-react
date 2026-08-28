import {Subscription} from "./subscription";
import {InternalApiConnection} from "./internalApi";

export interface UniversesApi {
    get(): readonly number[]
    subscribe(fn: (universes: readonly number[]) => void): Subscription
}

type UniversesInMessage = {
    type: 'universesState',
    universes: number[],
}

export function createUniversesApi(conn: InternalApiConnection): UniversesApi {
    let currentValues: readonly number[] = []

    let nextUniversesSubscriptionId = 1
    const universesUpdatesSubscriptions = new Map<number, (universes: readonly number[]) => void>()

    const updateItem = (universes: readonly number[]) => {
        universesUpdatesSubscriptions.forEach((fn) => {
            fn(universes)
        })
    }

    const handleOnMessage = (ev: MessageEvent) => {
        const message: UniversesInMessage = JSON.parse(ev.data)

        if (message == null || message.type != 'universesState') {
            return
        }

        currentValues = message.universes
        updateItem(message.universes)
    }

    // No `universesState` request on open: the server pushes one per connection.
    conn.subscribe((evType, ev) => {
        if (evType === 'message' && ev instanceof MessageEvent) {
            handleOnMessage(ev)
        }
    })

    return {
        get() {
            return currentValues
        },
        subscribe(fn: (universes: readonly number[]) => void): Subscription {
            const thisId = nextUniversesSubscriptionId
            nextUniversesSubscriptionId++

            universesUpdatesSubscriptions.set(thisId, fn)

            return {
                unsubscribe: () => {
                    universesUpdatesSubscriptions.delete(thisId)
                },
            }
        }
    }
}
