/**
 * `Ramose.workerEntry()` — where `ramose/worker` actually lives on disk.
 *
 * `Cloudflare.Worker`'s `main` is a **path**, not a module specifier: Alchemy
 * `realpath`s it before handing it to the bundler. So the obvious spelling
 *
 * ```typescript
 * Cloudflare.Worker("Peer", { main: "ramose/worker" })   // ✗ never resolves
 * ```
 *
 * resolves against the working directory (`./ramose/worker`), which does not
 * exist. Worse, the failure is silent — Alchemy's bundle watcher runs in a
 * forked fiber, so under `alchemy dev` the Worker's proxy still binds its port
 * and logs `ready`, and every request to it hangs.
 *
 * ```typescript
 * Cloudflare.Worker("Peer", { main: import.meta.resolve("ramose/worker") })   // ✓
 * ```
 *
 * `Ramose.Server` without `worker:` calls this. An explicit-Worker hatch
 * should pass `import.meta.resolve("ramose/worker")` (or omit `worker` so
 * Server does). This helper exists so the resolution has one home, one
 * error message worth reading, and a test — it is not a public subpath.
 *
 * @module
 *
 * Deliberately **not** on the `ramose` barrel. That barrel is imported by
 * Worker and browser code (`Databases`, `layer`, `Policy`), and
 * `import.meta.resolve` is a host API with no meaning in either.
 */
/**
 * The absolute `file://` URL of the `ramose/worker` entry module, ready to
 * hand to `Cloudflare.Worker`'s `main`.
 *
 * Which file that is depends on the host's export conditions —
 * `src/worker/index.ts` under Bun, `dist/worker/index.js` under Node — and
 * either bundles identically.
 *
 * @throws when the subpath cannot be resolved, which since 0.2.0 means the
 * deploy script is running somewhere `ramose` itself is not installed.
 */
export declare const workerEntry: () => string;
//# sourceMappingURL=workerEntry.d.ts.map