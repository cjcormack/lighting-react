import {Subscription} from "./subscription";
import {bool, CheckerReturnType, jsonParser, literal, object, string, union} from "@recoiljs/refine";
import {InMessageChecker, InternalApiConnection} from "./internalApi";

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

const TrackUpdateInMessageChecker = InMessageChecker(
    union(literal('uT'), literal('trackDetails')),
    TrackDetailsChecker
)

const trackUpdateParser = jsonParser(TrackUpdateInMessageChecker)

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
        const message = trackUpdateParser(ev.data)
        if (message != null) {
            currentTrack = message.data
            notifyTrackChange(currentTrack)
        }
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
