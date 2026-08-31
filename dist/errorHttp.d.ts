import { type DbError } from "./db/Errors.ts";
export interface ErrorHttp {
    readonly status: number;
    readonly body: Record<string, unknown>;
    readonly headers?: Record<string, string>;
}
/** Status + allowlisted JSON body/headers for a {@link DbError}. */
export declare const errorToHttp: (err: DbError) => ErrorHttp;
/** HTTP status for a {@link DbError}. */
export declare const statusOf: (err: DbError) => number;
/**
 * A `Response` for a {@link DbError}. Use {@link errorToHttp} when the
 * framework wants status + body rather than a Fetch `Response`.
 */
export declare const errorResponse: (err: DbError) => Response;
/**
 * Classify `unknown` as a {@link DbError} when it is one; otherwise wrap
 * as {@link InternalError}. Useful at a Worker boundary that `catch`es
 * anything.
 *
 * Worker-only tags (`NotFound`, `BadRequest`, `Internal`, `UpstreamError`)
 * are not {@link DbError}s and become `InternalError` (500) here. For the
 * peer Worker's own request Effect, use `fromThrown` + `toHttp` instead —
 * this helper does not know about those tags.
 */
export declare const toDbError: (err: unknown) => DbError;
//# sourceMappingURL=errorHttp.d.ts.map