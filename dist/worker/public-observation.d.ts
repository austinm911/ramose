import type { RamoseEnv } from "../RamoseEnv.ts";
export declare const PUBLIC_OBSERVATION_ALLOWLIST: Readonly<{
    healthFields: readonly ["ok", "service"];
    errorFields: readonly ["error", "tag", "message", "operation", "step", "reason", "code", "receipt"];
    responseHeaders: readonly ["content-type", "cache-control", "retry-after", "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers", "access-control-expose-headers", "vary"];
    requestHeaders: readonly ["content-type", "authorization", "x-ramose-catalog", "x-ramose-unit-hash"];
}>;
export declare const publicErrorBody: (body: Record<string, unknown>) => Record<string, unknown>;
export declare const publicResponseHeaders: (headers: Headers | Record<string, string> | undefined) => Record<string, string>;
export declare const publicCorsHeaders: (request?: Request, env?: Pick<RamoseEnv, "RAMOSE_ALLOWED_ORIGINS">) => Record<string, string>;
export declare const PUBLIC_HEALTH: Readonly<{
    ok: true;
    service: "ramose";
}>;
//# sourceMappingURL=public-observation.d.ts.map