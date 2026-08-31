import type { RamoseEnv } from "../RamoseEnv.ts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { type FetchImplementation } from "jose";
import { Unauthorized } from "./errors.ts";
import { type VerifiedPrincipal } from "./auth.ts";
type JwtVerifierEnv = Pick<RamoseEnv, "RAMOSE_JWKS_URL" | "RAMOSE_JWKS_JSON" | "RAMOSE_JWKS_SERVICE" | "RAMOSE_JWT_ISS" | "RAMOSE_JWT_AUD" | "RAMOSE_JWT_MAX_TTL">;
export interface JwksServiceBinding {
    fetch(url: string, init: RequestInit): Promise<Response>;
}
export interface JwtVerifierClient {
    readonly verify: (token: Redacted.Redacted<string>) => Effect.Effect<VerifiedPrincipal, Unauthorized>;
}
declare const JwtVerifier_base: Context.ServiceClass<JwtVerifier, "ramose/worker/JwtVerifier", JwtVerifierClient>;
export declare class JwtVerifier extends JwtVerifier_base {
}
export declare const temporalClaimsHold: (iat: number, exp: number, nbf: number | undefined, nowMs: number) => boolean;
export declare const serviceBindingFetch: (binding: JwksServiceBinding) => FetchImplementation;
export declare const resetJwtVerifier: () => void;
export declare const fromEnv: (env: JwtVerifierEnv) => JwtVerifierClient;
export {};
//# sourceMappingURL=jwt.d.ts.map