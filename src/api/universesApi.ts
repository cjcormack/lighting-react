import {Subscription} from "./subscription";
import {array, jsonParser, literal, number, object} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";

export interface UniversesApi {
    get(): readonly number[]
    subscribe(fn: (universes: readonly number[]) => void): Subscription
}

const UniversesInMessageChecker = object({
    type: literal('universesState'),
    universes: array(number()),
})

const universesUpdateParser = jsonParser(UniversesInMessageChecker)

export function createUniversesApi(conn: InternalApiConnection): UniversesApi {
    let currentValues: readonly number[] = []

    let nextUniversesSubscriptionId = 1
    const universesUpdatesSubscriptions = new Map<number, (universes: readonly number[]) => void>()

    const updateItem = (universes: readonly number[]) => {
        universesUpdatesSubscriptions.forEach((fn) => {
            fn(universes)
        })
    }

    const handleOnOpen = () => {
        const payload = {
            type: 'universesState',
        }
        conn.send(JSON.stringify(payload))
    }

    const handleOnMessage = (ev: MessageEvent) => {
        const message = universesUpdateParser(ev.data)

        if (message == null) {
            return
        }

        currentValues = message.universes
        updateItem(message.universes)
    }

    conn.subscribe((evType, ev) => {
        if (evType === 'open') {
            handleOnOpen()
        } else if (evType === 'message' && ev instanceof MessageEvent) {
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

            fn(currentValues)

            return {
                unsubscribe: () => {
                    universesUpdatesSubscriptions.delete(thisId)
                },
            }
        }
    }
}
