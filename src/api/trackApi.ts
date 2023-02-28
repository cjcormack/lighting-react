import {Subscription} from "./subscription";
import {InternalApiConnection} from "./lightingApi";

export interface TrackDetails {
    isPlaying: boolean,
    artist: string,
    name: string,
}

export interface TrackApi {
    get(): TrackDetails
    subscribe(fn: (currentTrack: TrackDetails) => void): Subscription
}

const enum TrackTypes {
    'uT' = 'uT',
    'trackDetails' = 'trackDetails',
}

interface TrackUpdateInMessage {
    type: TrackTypes.uT | TrackTypes.trackDetails
    data: TrackDetails
}


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

    const handleOnOpen = (ev: Event) => {
        const payload = {
            type: 'trackDetails',
        }
        conn.send(JSON.stringify(payload))
    }

    const handleOnMessage = (ev: MessageEvent) => {
        const message: TrackUpdateInMessage = JSON.parse(ev.data)

        currentTrack = message.data
        notifyTrackChange(currentTrack)
    }

    conn.subscribe((evType, ev) => {
        if (evType === 'open') {
            handleOnOpen(ev)
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
