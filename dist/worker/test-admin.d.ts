import { type CheckpointScope } from "../internal/test-hooks.ts";
import type { RamoseEnv } from "../RamoseEnv.ts";
import { BadRequest, Internal, NotFound, UpstreamError } from "./errors.ts";
export declare const parseTestAdminPath: (pathname: string) => {
    db: string;
    rest: string;
} | undefined;
export declare const handleTestAdmin: (request: Request, env: RamoseEnv, url: URL) => Promise<Response>;
export declare const asTestAdminError: (err: unknown) => BadRequest | NotFound | UpstreamError | Internal;
export type { CheckpointScope };
//# sourceMappingURL=test-admin.d.ts.map