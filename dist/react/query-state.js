export const PENDING = Object.freeze({
    status: "pending",
});
const unnamedFailure = () => new Error("ramose/react: the query failed without a reported cause");
/**
 * Narrow one published snapshot into the union a component switches on.
 *
 * | `QuerySnapshot`                    | `QueryState`                   |
 * | ---------------------------------- | ------------------------------ |
 * | `status: "pending"`                | `{ status: "pending" }`        |
 * | `status: "ready"`, `stale: false`  | `{ status: "ready", data }`    |
 * | `status: "ready"`, `stale: true`   | `{ status: "stale", data }`    |
 * | `status: "error"`                  | `{ status: "error", error }`   |
 *
 * `stale` is read only where it changes what a component may conclude. A
 * pending snapshot is stale by construction and has nothing to show either way,
 * and a failed one already says the local view could not answer — reporting
 * that failure twice, once per staleness, would split the error branch for no
 * decision a component could make differently.
 *
 * `previous` is the state this consumer last saw. It is not an optimization
 * detail: two different snapshots can narrow to the same state — a reconnect
 * that flips `stale` under a failed query is one — and returning a new equal
 * object would re-render every consumer for a change React was told did not
 * reach them.
 */
export const toQueryState = (snapshot, previous) => {
    switch (snapshot.status) {
        case "pending":
            return PENDING;
        case "error": {
            const error = snapshot.error ?? unnamedFailure();
            return previous !== undefined && previous.status === "error" &&
                previous.error === error
                ? previous
                : Object.freeze({ status: "error", error });
        }
        case "ready": {
            const status = snapshot.stale ? "stale" : "ready";
            const data = snapshot.data;
            return previous !== undefined && previous.status === status &&
                previous.data === data
                ? previous
                : Object.freeze({ status, data });
        }
    }
};
//# sourceMappingURL=query-state.js.map