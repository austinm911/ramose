export const WRITES_ENV_KEY = "RAMOSE_WRITES";
export const WRITES_HEADER = "x-ramose-writes";
export const isWritesMode = (value) => value === "all" || value === "operations";
export const resolveWrites = (writes, envWrites) => {
    if (isWritesMode(writes))
        return writes;
    return envWrites === "all" ? "all" : "operations";
};
export const parseWritesHeader = (raw) => isWritesMode(raw) ? raw : undefined;
export const isUnrecognizedWrites = (envWrites) => envWrites !== undefined && envWrites !== "" && !isWritesMode(envWrites);
//# sourceMappingURL=writes.js.map