import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { workerEntry } from "./workerEntry.js";
/**
 * Compatibility date and flags every Ramose peer Worker is deployed with.
 * One value — do not copy a date into a stack file.
 */
export const PEER_COMPAT = {
    date: "2026-03-17",
    flags: ["nodejs_compat", "global_fetch_strictly_public"],
};
export const PEER_BINDINGS = {
    store: "STORE",
    transactor: "TRANSACTOR",
    replica: "REPLICA",
    versionMetadata: "CF_VERSION_METADATA",
    internalSecret: "RAMOSE_INTERNAL_SECRET",
};
export const PEER_DO_CLASSES = {
    transactor: "TransactorDO",
    replica: "QueryReplicaDO",
};
export const PEER_DEFAULTS = {
    storage: "Store",
    worker: "Peer",
};
const nodeFs = () => {
    try {
        const builtin = process.getBuiltinModule?.("fs") ?? process.getBuiltinModule?.("node:fs");
        if (builtin?.realpathSync !== undefined)
            return builtin;
    }
    catch {
    }
    const req = globalThis.require;
    if (typeof req === "function")
        return req("node:fs");
    throw new Error("cannot stat a path in this runtime (no node:fs)");
};
const fileUrlToPath = (value) => {
    if (!value.startsWith("file:"))
        return value;
    const url = new URL(value);
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path))
        path = path.slice(1);
    return path;
};
const resolveMainPath = (main) => {
    let asPath;
    try {
        asPath = fileUrlToPath(main);
    }
    catch {
        asPath = main;
    }
    return nodeFs().realpathSync(asPath);
};
const isRecord = (value) => typeof value === "object" && value !== null;
const workerProps = (worker) => {
    if (!isRecord(worker))
        return undefined;
    const props = isRecord(worker.Props) ? worker.Props : worker;
    return {
        main: props.main,
        env: props.env,
        compatibility: props.compatibility,
        Type: worker.Type,
    };
};
const isCloudflareWorker = (worker) => {
    if (!isRecord(worker))
        return false;
    if (worker.Type === "Cloudflare.Worker")
        return true;
    const props = workerProps(worker);
    return props?.env !== undefined || typeof props?.main === "string";
};
const classNameOf = (binding) => {
    if (!isRecord(binding))
        return undefined;
    const props = isRecord(binding.Props) ? binding.Props : undefined;
    if (typeof props?.className === "string")
        return props.className;
    if (typeof binding.className === "string")
        return binding.className;
    return undefined;
};
const envOf = (worker) => {
    const env = workerProps(worker)?.env;
    return isRecord(env) ? env : undefined;
};
const isVersionMetadataBinding = (value) => Cloudflare.Workers.isVersionMetadata(value) ||
    (isRecord(value) &&
        value.kind === "Cloudflare.Workers.VersionMetadata" &&
        value.name === PEER_BINDINGS.versionMetadata);
export const workerEnvOf = (worker) => envOf(worker);
export const validatePeerWiring = (worker) => {
    if (typeof worker === "string")
        return undefined;
    if (!isCloudflareWorker(worker))
        return undefined;
    const env = envOf(worker);
    if (env === undefined) {
        return "ramose: the server Worker has no `env` — bind STORE, TRANSACTOR and REPLICA (or omit `worker` and let Ramose.Server declare them)";
    }
    const missing = [];
    for (const key of [
        PEER_BINDINGS.store,
        PEER_BINDINGS.transactor,
        PEER_BINDINGS.replica,
        PEER_BINDINGS.versionMetadata,
        PEER_BINDINGS.internalSecret,
    ]) {
        if (env[key] === undefined)
            missing.push(key);
    }
    if (missing.length > 0) {
        return `ramose: the server Worker is missing required internal binding${missing.length === 1 ? "" : "s"} ${missing.join(", ")}`;
    }
    if (!isVersionMetadataBinding(env[PEER_BINDINGS.versionMetadata])) {
        return "ramose: CF_VERSION_METADATA must be Cloudflare.Workers.VersionMetadata() so catalog identity and live queries can fence deployments";
    }
    const compatibility = workerProps(worker)?.compatibility;
    const flags = isRecord(compatibility) && Array.isArray(compatibility.flags)
        ? compatibility.flags
        : [];
    if (!flags.includes("global_fetch_strictly_public")) {
        return 'ramose: the server Worker compatibility flags must include "global_fetch_strictly_public" so live-query renewal probes re-enter the public Worker route';
    }
    const transactor = classNameOf(env[PEER_BINDINGS.transactor]);
    if (transactor !== undefined && transactor !== PEER_DO_CLASSES.transactor) {
        return `ramose: TRANSACTOR className must be "${PEER_DO_CLASSES.transactor}", not ${JSON.stringify(transactor)} — a typo here passes /health and fails on the first write`;
    }
    const replica = classNameOf(env[PEER_BINDINGS.replica]);
    if (replica !== undefined && replica !== PEER_DO_CLASSES.replica) {
        return `ramose: REPLICA className must be "${PEER_DO_CLASSES.replica}", not ${JSON.stringify(replica)} — a typo here passes /health and fails on the first read`;
    }
    const main = workerProps(worker)?.main;
    if (typeof main !== "string" || main === "") {
        return "ramose: the server Worker has no `main` — point it at a module that re-exports TransactorDO and QueryReplicaDO, or omit `worker` and let Ramose.Server resolve ramose/worker";
    }
    if (main === "ramose/worker") {
        return `ramose: main is the bare specifier "ramose/worker", which Alchemy resolves as a path and never finds. Use import.meta.resolve("ramose/worker") or omit \`worker\` so Ramose.Server calls workerEntry()`;
    }
    try {
        resolveMainPath(main);
    }
    catch (cause) {
        return `ramose: the server Worker's main ${JSON.stringify(main)} does not resolve to a file — ${cause instanceof Error ? cause.message : String(cause)}`;
    }
    return undefined;
};
const cloudflareRoute = (route) => ({
    pattern: route.pattern,
    ...(route.zoneName !== undefined ? { zoneName: route.zoneName } : {}),
    ...(route.zoneId !== undefined ? { zoneId: route.zoneId } : {}),
});
const storageDecl = (storage) => {
    if (storage === undefined)
        return Cloudflare.R2.Bucket(PEER_DEFAULTS.storage);
    if (typeof storage === "string")
        return Cloudflare.R2.Bucket(storage);
    return storage;
};
const ownedInternalSecret = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Redacted.make(Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""));
};
export const ownedPeerDurableObjects = () => ({
    transactor: Cloudflare.DurableObject(PEER_DO_CLASSES.transactor, {
        className: PEER_DO_CLASSES.transactor,
    }),
    replica: Cloudflare.DurableObject(PEER_DO_CLASSES.replica, {
        className: PEER_DO_CLASSES.replica,
    }),
});
export const declareOwnedPeer = (options) => Effect.gen(function* () {
    const dos = options.durableObjects ?? ownedPeerDurableObjects();
    const worker = yield* Cloudflare.Worker(options.peer ?? PEER_DEFAULTS.worker, {
        main: options.main ?? workerEntry(),
        compatibility: PEER_COMPAT,
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.dev !== undefined ? { dev: options.dev } : {}),
        env: {
            [PEER_BINDINGS.store]: storageDecl(options.storage),
            [PEER_BINDINGS.transactor]: dos.transactor,
            [PEER_BINDINGS.replica]: dos.replica,
            [PEER_BINDINGS.versionMetadata]: Cloudflare.Workers.VersionMetadata(),
            ...options.env,
            ...options.authEnv,
            [PEER_BINDINGS.internalSecret]: ownedInternalSecret(),
        },
        ...(options.routes !== undefined ? { routes: options.routes.map(cloudflareRoute) } : {}),
    });
    return worker;
});
//# sourceMappingURL=peer.js.map