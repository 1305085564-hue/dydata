/** Merges concurrent callers while leaving later explicit refreshes intact. */
export function createInFlightRequest<T>(request: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;

    let current: Promise<T>;
    try {
      current = request();
    } catch (error) {
      current = Promise.reject(error);
    }
    inFlight = current;
    void current.then(
      () => {
        if (inFlight === current) inFlight = null;
      },
      () => {
        if (inFlight === current) inFlight = null;
      },
    );
    return current;
  };
}
