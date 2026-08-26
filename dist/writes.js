/**
 * Who may POST raw `/transact`. Shared by `Server` (deploy) and the Worker
 * (request) so the `"operations"` default cannot drift.
 *
 * `"operations"` is the peer default — unset `RAMOSE_WRITES` means this.
 * `"all"` is the explicit opt-out. Unrecognized env values fail closed to
 * `"operations"`; the Worker logs `writes.unrecognized`.
 */
/** Env key `Server({ writes })` lowers onto. */
export const WRITES_ENV_KEY = "RAMOSE_WRITES";
/** Worker→replica session upgrade: the resolved write mode. */
export const WRITES_HEADER = "x-ramose-writes";
export const isWritesMode = (value) => value === "all" || value === "operations";
/**
 * Server prop wins when set; otherwise the Worker env; otherwise `"operations"`.
 * Only the exact string `"all"` opts out — `All` / `ALL` / typos fail closed.
 */
export const resolveWrites = (writes, envWrites) => {
    if (isWritesMode(writes))
        return writes;
    return envWrites === "all" ? "all" : "operations";
};
export const parseWritesHeader = (raw) => isWritesMode(raw) ? raw : undefined;
/** Set and neither `"all"` nor `"operations"` — warn, then fail closed. */
export const isUnrecognizedWrites = (envWrites) => envWrites !== undefined && envWrites !== "" && !isWritesMode(envWrites);
//# sourceMappingURL=writes.js.map