export function aggregateAndDebounce<A, B>(
    // Take some val and the current aggregated vals in and return next aggregated vals
    aggregate: (val: A, vals: B) => B,
    // This is called waitMs after the some values are given
    debounced: (val: B) => void,
    // This produces an initial state for the aggregated vals, to start from/
    initialVals: () => B,
    // How long to wait until calling the debounce
    waitMs: number
): (val: A) => void {
  let intervalId: number | undefined = undefined
  let vals = initialVals()
  let newValsSeen = false

  function callAggregate(val: A) {
    vals = aggregate(val, vals)
    newValsSeen = true
  }

  function callDebounced() {
    if (newValsSeen) {
      // New vals seen since last fire; send them out.
      debounced(vals)
      vals = initialVals()
      newValsSeen = false
    } else {
      // No new vals seen in waitMs since last fire; stop interval
      clearInterval(intervalId)
      intervalId = undefined
    }
  }

  return (val: A) => {
    callAggregate(val)

    if (!intervalId) {
      callDebounced()
      intervalId = window.setInterval(() => {
        callDebounced()
      }, waitMs)
    }
  }
}
