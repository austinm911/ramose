/**
 * `Read` — the one result every `ramose/react` read hook returns.
 *
 * Live and one-shot, query and pull: `data` (never `rows`), a plain tagged
 * `error`, `status` / `isLoading`, the basis `t` the rows were read at,
 * `refetch()`, and `retry()`. No Effect types.
 */
import { seamOf } from "./seam.js";
export const READ_INITIAL = {
    data: undefined,
    error: undefined,
    status: "loading",
    isLoading: true,
    t: undefined,
};
export const asLoading = (prev) => ({
    data: prev.data,
    error: undefined,
    status: "loading",
    isLoading: true,
    t: prev.t,
});
export const asSuccess = (data, t) => ({
    data,
    error: undefined,
    status: "success",
    isLoading: false,
    t,
});
export const asError = (prev, error) => ({
    data: prev.data,
    error,
    status: "error",
    isLoading: false,
    t: prev.t,
});
/** First-paint state: hydrated rows, or the empty loading shell. */
export const hydrateRead = (options) => options !== undefined && options.initialData !== undefined
    ? asSuccess(options.initialData, options.initialT)
    : READ_INITIAL;
/**
 * The basis a view reads at, without `GET /info`: pinned `asOf(t)`, else
 * `session.t` once the session has seen a frame. `0` is "not yet".
 */
export const readT = (db) => {
    if (db === undefined)
        return undefined;
    const seam = seamOf(db);
    if (seam === undefined)
        return undefined;
    if (seam.asOf !== undefined)
        return seam.asOf;
    const t = seam.t();
    return t !== undefined && t > 0 ? t : undefined;
};
//# sourceMappingURL=read.js.map