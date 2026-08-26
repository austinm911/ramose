/**
 * The peer Worker the Server owns: pinned compat, fixed binding names,
 * Durable Object class names, and deploy-time validation of the escape hatch.
 *
 * A typo'd `className` used to pass `/health` and die on the first transact.
 * {@link validatePeerWiring} is what makes that a deploy error instead.
 */
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { workerEntry } from "./workerEntry.js";
/**
 * Compatibility date and flags every Ramose peer Worker is deployed with.
 * One value — do not copy a date into a stack file.
 */
export const PEER_COMPAT = {
    date: "2026-03-17",
    flags: ["nodejs_compat"],
};
/** Env keys the peer Worker and both DO classes read. */
export const PEER_BINDINGS = {
    store: "STORE",
    transactor: "TRANSACTOR",
    replica: "REPLICA",
};
/** Durable Object `className`s the `ramose/worker` entry exports. */
export const PEER_DO_CLASSES = {
    transactor: "TransactorDO",
    replica: "QueryReplicaDO",
};
/** Default Alchemy logical ids when Server declares the peer. */
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
        // no `process`
    }
    const req = globalThis.require;
    if (typeof req === "function")
        return req("node:fs");
    throw new Error("cannot stat a path in this runtime (no node:fs)");
};
/** Alchemy's `fileURLToPath` + fall-back, without importing `node:url`. */
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
    // LogicalId / name are Alchemy resource ids, not the exported class.
    // Guessing them turns a missing className into a wrong one and fails a
    // correctly-wired hatch (`DurableObject("Tx", { className: "TransactorDO" })`).
    return undefined;
};
const envOf = (worker) => {
    const env = workerProps(worker)?.env;
    return isRecord(env) ? env : undefined;
};
/**
 * @internal The Worker's env bag, or `undefined` when the value is a URL
 * (nothing to compare or validate).
 */
export const workerEnvOf = (worker) => envOf(worker);
/**
 * Deploy-time check of a user-owned Worker. Returns an error message, or
 * `undefined` when the worker is not a Cloudflare Worker (a URL, or
 * `{ url }`) — those forms have no bindings to validate.
 */
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
    for (const key of [PEER_BINDINGS.store, PEER_BINDINGS.transactor, PEER_BINDINGS.replica]) {
        if (env[key] === undefined)
            missing.push(key);
    }
    if (missing.length > 0) {
        return `ramose: the server Worker is missing env binding${missing.length === 1 ? "" : "s"} ${missing.join(", ")} — those names are fixed (STORE / TRANSACTOR / REPLICA)`;
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
const storageDecl = (storage) => {
    if (storage === undefined)
        return Cloudflare.R2.Bucket(PEER_DEFAULTS.storage);
    if (typeof storage === "string")
        return Cloudflare.R2.Bucket(storage);
    return storage;
};
/**
 * The two Durable Object *declarations* a hand-written stack writes at
 * module scope (`Cloudflare.DurableObject("TransactorDO", …)`). Alchemy
 * scopes a declaration created while evaluating `Worker({ env })` as a
 * nested binding (`[Worker/TRANSACTOR]`) and never gives it its own
 * logical id — the working e2e stack and Reef both declare these as
 * siblings of the Worker instead.
 *
 * Call this from `Ramose.Server(…)` itself (stack-module evaluation),
 * not from inside Worker's env literal.
 */
export const ownedPeerDurableObjects = () => ({
    transactor: Cloudflare.DurableObject(PEER_DO_CLASSES.transactor, {
        className: PEER_DO_CLASSES.transactor,
    }),
    replica: Cloudflare.DurableObject(PEER_DO_CLASSES.replica, {
        className: PEER_DO_CLASSES.replica,
    }),
});
/**
 * Declare the R2 bucket, both DO classes, and the peer Worker. The caller
 * `yield*`s this from Server's init so Alchemy tracks the dependencies
 * through the Worker's env (the same pattern as a hand-written stack).
 */
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
            ...options.env,
            ...options.authEnv,
        },
        ...(options.routes !== undefined ? { routes: [...options.routes] } : {}),
    });
    return worker;
});
//# sourceMappingURL=peer.js.map