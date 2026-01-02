import {Subscription} from "./subscription";
import {InternalApiConnection} from "./internalApi";

export interface ChannelsApi {
    getAll(): Map<string, number>
    get(universe: number, channelNo: number): number
    update(universe: number, channelNo: number, value: number): void
    subscribe(fn: (updates: Map<string, number>) => void): Subscription
    subscribeToChannel(key: string, fn: (value: number) => void): Subscription
}

type ChannelStateInMessage = {
    type: 'channelState',
    channels: {
        universe: number,
        id: number,
        currentLevel: number,
    }[],
}

/**
 * Debounces map updates, merging incoming maps with pending updates.
 * All entries from a single call are guaranteed to fire together,
 * either immediately (if no interval running) or on the next tick.
 */
function debounceMapUpdates(
    func: (updates: Map<string, number>) => void,
    waitMs: number
): (updates: Map<string, number>) => void {
    let intervalId: number | undefined = undefined
    let pending = new Map<string, number>()
    let newValsSeen = false

    function flush() {
        if (newValsSeen) {
            func(pending)
            pending = new Map()
            newValsSeen = false
        } else {
            clearInterval(intervalId)
            intervalId = undefined
        }
    }

    return (updates: Map<string, number>) => {
        updates.forEach((value, key) => {
            pending.set(key, value)
        })
        newValsSeen = true

        if (!intervalId) {
            flush()
            intervalId = window.setInterval(flush, waitMs)
        }
    }
}

export function createChannelsApi(conn: InternalApiConnection): ChannelsApi {
    const currentValues = new Map<string, number>()

    let nextChannelSubscriptionId = 1
    const channelUpdatesSubscriptions = new Map<number, (updates: Map<string, number>) => void>()

    const perChannelUpdatesSubscriptions = new Map<string, Map<number, (value: number) => void>>

    const notifyChannelsChange = (updates: Map<string, number>) => {
        channelUpdatesSubscriptions.forEach((fn) => {
            fn(updates)
        })

        updates.forEach((value, key) => {
            const subscriptions = perChannelUpdatesSubscriptions.get(key)
            if (subscriptions) {
                subscriptions.forEach((fn) => {
                    fn(value)
                })
            }
        })
    }

    const updateBatch = debounceMapUpdates((updates: Map<string, number>) => {
        notifyChannelsChange(updates)
    }, 33)

    const handleOnOpen = () => {
        const payload = {
            type: 'channelState',
        }
        conn.send(JSON.stringify(payload))
    }

    const handleOnMessage = (ev: MessageEvent) => {
        const message: ChannelStateInMessage = JSON.parse(ev.data)

        if (message == null || message.type != 'channelState') {
            return
        }

        // Batch all channels from this message together
        const updates = new Map<string, number>()
        message.channels.forEach((update) => {
            const key = `${update.universe}:${update.id}`
            currentValues.set(key, update.currentLevel)
            updates.set(key, update.currentLevel)
        })
        updateBatch(updates)
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
        get(universe: number, channelNo: number): number {
            return currentValues.get(`${universe}:${channelNo}`) || 0
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

            return {
                unsubscribe: () => {
                    channelUpdatesSubscriptions.delete(thisId)
                },
            }
        },
        subscribeToChannel(key: string, fn: (value: number) => void): Subscription {
            const thisId = nextChannelSubscriptionId
            nextChannelSubscriptionId++

            let channelMap = perChannelUpdatesSubscriptions.get(key)
            if (!channelMap) {
                channelMap = new Map<number, (value: number) => void>()
                perChannelUpdatesSubscriptions.set(key, channelMap)
            }

            channelMap.set(thisId, fn)

            return {
                unsubscribe: () => {
                    channelMap.delete(thisId)
                },
            }
        },
    }
}
