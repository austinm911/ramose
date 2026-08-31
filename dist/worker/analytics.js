import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
export class DatasetError extends Data.TaggedError("DatasetError") {
}
export const classifyDatasetError = (cause) => new DatasetError({ message: cause instanceof Error ? cause.message : String(cause), cause });
export class Analytics extends Context.Service()("ramose/worker/Analytics") {
}
export const fromBinding = (binding) => ({
    bound: binding !== undefined && binding !== null,
    writeDataPoint: (point) => binding
        ? Effect.try({
            try: () => binding.writeDataPoint(point),
            catch: classifyDatasetError,
        })
        : Effect.void,
});
export const bindingOf = (env) => {
    const b = env?.ANALYTICS;
    return typeof b?.writeDataPoint === "function" ? b : undefined;
};
export function routeOf(rest, method) {
    if (rest === "/transact")
        return "transact";
    if (rest === "/op")
        return "op";
    if (rest === "/query")
        return "query";
    if (rest === "/pull")
        return "pull";
    if (rest === "/live")
        return "live";
    if (rest === "/replicate")
        return "replicate";
    if (rest === "/info")
        return "info";
    if (rest === "/session")
        return "session";
    if (rest.startsWith("/admin/"))
        return "admin";
    if (/^\/entity\/\d+$/.test(rest) && method === "GET")
        return "entity";
    return "other";
}
export function httpPoint(o) {
    const db = o.db && o.db.length > 0 ? o.db : "-";
    const ok = o.status < 400;
    return {
        indexes: [db],
        blobs: ["http", db, o.colo ?? "-", o.route, String(o.status)],
        doubles: [o.ms, 1, ok ? 1 : 0, ok ? 0 : 1],
    };
}
//# sourceMappingURL=analytics.js.map