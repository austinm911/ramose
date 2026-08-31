import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import { type VerifiedPrincipal } from "./auth.ts";
import { Unauthorized } from "./errors.ts";
import { JwtVerifier } from "./jwt.ts";
export declare const requestCredential: (request: Request) => Result.Result<Redacted.Redacted<string>, Unauthorized>;
export declare const authenticateRequest: (request: Request<unknown, CfProperties<unknown>>) => Effect.Effect<VerifiedPrincipal, Unauthorized, JwtVerifier>;
//# sourceMappingURL=admit.d.ts.map