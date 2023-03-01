import {Subscription} from "./subscription";
import {aggregateAndDebounce} from "./aggregateAndDebounce";
import {InMessageChecker, InternalApiConnection} from "./internalApi";
import {array, jsonParser, literal, number, object, union} from "@recoiljs/refine";

export interface ChannelsApi {
    getAll(): Map<number, number>
    update(channelNo: number, value: number): void
    subscribe(fn: (updates: Map<number, number>) => void): Subscription
}

const ChannelUpdateInMessageChecker = InMessageChecker(
    literal('uC'),
    object({
        c: object({
            i: number(),
            l: number()
        })
    })
)
const ChannelStateInMessageChecker = InMessageChecker(
    literal('channelState'),
    object({
        channels: array(object({
            id: number(),
            currentLevel: number()
        }))
    })
)

const channelUpdateParser = jsonParser(union(ChannelUpdateInMessageChecker, ChannelStateInMessageChecker))

function debounceChannelUpdates(
    func: (updates: Map<number, number>) => void,
    waitMs: number
): (i: number, l: number) => void {

    let fn = aggregateAndDebounce(
        ([a, b]: [number,number], map: Map<number, number>) => {
            map.set(a, b);
            return map;
        },
        func,
        () => new Map(),
        waitMs
    );

    return (a: number, b: number) => {
        fn([a, b])
    }
}

export function createChannelsApi(conn: InternalApiConnection): ChannelsApi {
    const currentValues = new Map<number, number>()

    let nextChannelSubscriptionId = 1
    const channelUpdatesSubscriptions = new Map<number, (updates: Map<number, number>) => void>()

    const notifyChannelsChange = (updates: Map<number, number>) => {
        channelUpdatesSubscriptions.forEach((fn) => {
            fn(updates)
        })
    }

    const updateItem = debounceChannelUpdates((updates: Map<number, number>) => {
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

        if (message.type === 'uC') {
            currentValues.set(message.data.c.i, message.data.c.l)
            updateItem(message.data.c.i, message.data.c.l)
        } else if (message.type === 'channelState') {
            message.data.channels.forEach((update) => {
                currentValues.set(update.id, update.currentLevel)
                updateItem(update.id, update.currentLevel)
            })
        }
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
        subscribe(fn: (updates: Map<number, number>) => void): Subscription {
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
        update(channelNo: number, value: number) {
            const payload = {
                type: 'updateChannel',
                data: {channel: {id: channelNo, level: value, fadeTime: 0}}
            }
            conn.send(JSON.stringify(payload))
        }
    }
}
