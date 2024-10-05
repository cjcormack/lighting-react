import {Subscription} from "./subscription";
import {bool, CheckerReturnType, jsonParser, object, string} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";

export interface TrackApi {
    get(): TrackDetails
    subscribe(fn: (currentTrack: TrackDetails) => void): Subscription
}

export const TrackDetailsChecker = object({
    isPlaying: bool(),
    artist: string(),
    name: string(),
})

export type TrackDetails = CheckerReturnType<typeof TrackDetailsChecker>

const trackUpdateParser = jsonParser(TrackDetailsChecker)

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
        const message = trackUpdateParser(ev.data)
        if (message != null) {
            currentTrack = message
            notifyTrackChange(currentTrack)
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
