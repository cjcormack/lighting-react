import {Subscription} from "./subscription";
import {aggregateAndDebounce} from "./aggregateAndDebounce";
import {array, jsonParser, literal, number, object} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";

export interface ChannelsApi {
    getAll(): Map<string, number>
    update(universe: number, channelNo: number, value: number): void
    subscribe(fn: (updates: Map<string, number>) => void): Subscription
}

const ChannelStateInMessageChecker = object({
    type: literal('channelState'),
    channels: array(object({
        universe: number(),
        id: number(),
        currentLevel: number()
    })),
})

const channelUpdateParser = jsonParser(ChannelStateInMessageChecker)

function debounceChannelUpdates(
    func: (updates: Map<string, number>) => void,
    waitMs: number
): (i: string, l: number) => void {

    const fn = aggregateAndDebounce(
        ([a, b]: [string,number], map: Map<string, number>) => {
            map.set(a, b);
            return map;
        },
        func,
        () => new Map(),
        waitMs
    );

    return (a: string, b: number) => {
        fn([a, b])
    }
}

export function createChannelsApi(conn: InternalApiConnection): ChannelsApi {
    const currentValues = new Map<string, number>()

    let nextChannelSubscriptionId = 1
    const channelUpdatesSubscriptions = new Map<number, (updates: Map<string, number>) => void>()

    const notifyChannelsChange = (updates: Map<string, number>) => {
        channelUpdatesSubscriptions.forEach((fn) => {
            fn(updates)
        })
    }

    const updateItem = debounceChannelUpdates((updates: Map<string, number>) => {
        notifyChannelsChange(updates)
    }, 100)

    const handleOnOpen = () => {
        const payload = {
            type: 'channelState',
        }
        conn.send(JSON.stringify(payload))
    }

    const handleOnMessage = (ev: MessageEvent) => {
        const message = channelUpdateParser(ev.data)

        if (message == null) {
            return
        }

        message.channels.forEach((update) => {
            const key = `${update.universe}:${update.id}`
            currentValues.set(key, update.currentLevel)
            updateItem(key, update.currentLevel)
        })
    }

    conn.subscribe((evType, ev) => {
        if (evType === 'open') {
            handleOnOpen()
        } else if (evType === 'message' && ev instanceof MessageEvent) {
            handleOnMessage(ev)
        }
    })

    return {
        getAll() {
            return currentValues
        },
        update(universe: number, channelNo: number, value: number) {
            const payload = {
                type: 'updateChannel',
                universe: universe,
                id: channelNo,
                level: value,
                fadeTime: 0
            }
            conn.send(JSON.stringify(payload))
        },
        subscribe(fn: (updates: Map<string, number>) => void): Subscription {
            const thisId = nextChannelSubscriptionId
            nextChannelSubscriptionId++

            channelUpdatesSubscriptions.set(thisId, fn)

            fn(currentValues)

            return {
                unsubscribe: () => {
                    channelUpdatesSubscriptions.delete(thisId)
                },
            }
        },
    }
}
