let t = Date.UTC(2026, 9, 31, 10, 0, 0);
/** Strictly increasing clock so `list()` ordering is deterministic. */
export const tick = () => (t += 1000);
