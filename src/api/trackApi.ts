import {Subscription} from "./subscription";
import {InternalApiConnection} from "./internalApi";

export interface TrackApi {
    get(): TrackDetails
    subscribe(fn: (currentTrack: TrackDetails) => void): Subscription
}

export type TrackDetails = {
    isPlaying: boolean
    artist: string
    name: string
}

type TrackDetailsOutMessage = {
    type: 'trackChanged'
} & TrackDetails

export function createTrackApi(conn: InternalApiConnection): TrackApi {
    let currentTrack: TrackDetails = {
        isPlaying: false,
        artist: '',
        name: '',
    }

    let nextTrackSubscriptionId = 1
    const trackUpdatesSubscriptions = new Map<number, (currentTrack: TrackDetails) => void>()

    const notifyTrackChange = (currentTrack: TrackDetails) => {
        trackUpdatesSubscriptions.forEach((fn) => {
            fn(currentTrack)
        })
    }

    const handleOnOpen = () => {
        const payload = {
            type: 'trackDetails',
        }
        conn.send(JSON.stringify(payload))
    }

    const handleOnMessage = (ev: MessageEvent) => {
        const message: TrackDetailsOutMessage = JSON.parse(ev.data)
        if (message == null || message.type != 'trackChanged') {
            return
        }
        currentTrack = message
        notifyTrackChange(currentTrack)
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
            return currentTrack
        },
        subscribe(fn: (currentTrack: (TrackDetails)) => void): Subscription {
            const thisId = nextTrackSubscriptionId
            nextTrackSubscriptionId++

            trackUpdatesSubscriptions.set(thisId, fn)

            fn(currentTrack)

            return {
                unsubscribe: () => {
                    trackUpdatesSubscriptions.delete(thisId)
                },
            }
        }
    }
}
