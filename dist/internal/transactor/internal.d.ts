import type { RamoseEnv } from "./env.ts";
export declare const INTERNAL_HEADER = "x-ramose-internal";
type SecretEnv = Pick<RamoseEnv, "RAMOSE_INTERNAL_SECRET">;
export declare function internalHeaders(env: SecretEnv): Record<string, string>;
export declare function isInternal(env: SecretEnv, request: Request): boolean;
export declare function internalGate(env: SecretEnv, request: Request): Response | undefined;
export {};
//# sourceMappingURL=internal.d.ts.map