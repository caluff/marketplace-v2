type ConfirmedCartCount = { count: number; confirmedAt: number }

export function createCartCountStore() {
  let confirmed: ConfirmedCartCount | null = null
  const listeners = new Set<() => void>()

  return {
    notify(count: number, confirmedAt: number) {
      if (
        !Number.isSafeInteger(count) ||
        count < 0 ||
        !Number.isSafeInteger(confirmedAt) ||
        confirmedAt < 0 ||
        (confirmed && confirmedAt < confirmed.confirmedAt)
      )
        return
      confirmed = { count, confirmedAt }
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getCount(initialCount: number | null, snapshotAt: number) {
      // Both timestamps come from the web server, never the browser clock.
      return confirmed && confirmed.confirmedAt >= snapshotAt
        ? confirmed.count
        : initialCount
    },
  }
}

const cartCountStore = createCartCountStore()

export const notifyCartUpdated = cartCountStore.notify
export const subscribeCartUpdates = cartCountStore.subscribe
export const getCartCount = cartCountStore.getCount
