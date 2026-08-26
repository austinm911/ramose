/**
 * @internal Service-binding source. The public surface is
 * {@link import("./Databases.ts").layer}, which auto-picks this hop when
 * the host is a Worker.
 */
import * as Effect from "effect/Effect";
import { bindToken, envKeys } from "./ServerRuntime.js";
/** The origin the server never looks at — service-binding dispatch ignores the host. */
export const SERVICE_ORIGIN = "https://ramose.internal";
/** The service-binding {@link ServerSource}: `env[LogicalId].fetch`, token from env. */
export const makeBindingSource = (env, server) => Effect.gen(function* () {
    const keys = envKeys(server);
    const token = yield* bindToken(server);
    const missing = () => new Error(`ramose: no service binding "${keys.service}" on this Worker — the server's worker must be a Cloudflare.Worker`);
    return {
        endpoint: Effect.suspend(() => env[keys.service] === undefined
            ? Effect.die(missing())
            : Effect.map(token, (value) => ({
                url: SERVICE_ORIGIN,
                token: value,
            }))),
        fetch: (url, init) => {
            const peer = env[keys.service];
            if (peer === undefined)
                return Promise.reject(missing());
            return peer.fetch(url, init);
        },
    };
});
//# sourceMappingURL=ServerBinding.js.map