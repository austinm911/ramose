import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
export const envKeys = (server) => ({
    service: server.LogicalId,
    url: `${server.LogicalId}_URL`,
});
export const bindOutput = (key, output) => output.bind(key);
export const required = (key, accessor) => accessor.pipe(Effect.flatMap((value) => value === undefined || value === null || value === ""
    ? Effect.die(new Error(`ramose: no value bound under "${key}" — the capability must be provided on a host that takes bindings (a Cloudflare.Worker, or an Alchemy.Action; Ramose.layer falls back to HTTPS when no service binding is present)`))
    : Effect.succeed(value)));
//# sourceMappingURL=ServerRuntime.js.map