/**
 * Tiny stale-response guard. Each `next()` issues a monotonically increasing
 * request id; `isLatest(id)` returns true only for the most recent one. Use it
 * to drop in-flight responses when the user fires a new request before the
 * previous one resolves (e.g. typeahead search).
 */
export interface RequestSequencer {
  next(): number;
  isLatest(id: number): boolean;
}

export function createRequestSequencer(): RequestSequencer {
  let seq = 0;
  return {
    next() {
      seq += 1;
      return seq;
    },
    isLatest(id: number) {
      return id === seq;
    },
  };
}
