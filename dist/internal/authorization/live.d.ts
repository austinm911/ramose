import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { Unauthorized } from "../../db/Errors.ts";
import type { Db } from "../core/db.ts";
import type { RuntimeBoundaries } from "../runtime-boundaries.ts";
import { type AuthenticatedCaller, type AuthorizedRequestInput } from "./request.ts";
import { OneShotReadError, type OneShotRead, type OneShotReadOptions } from "./reads.ts";
export type LiveQueryDiff = {
    readonly added: readonly unknown[];
    readonly retracted: readonly unknown[];
};
export type LiveBasisEvent = "ready" | "change";
export type AuthorizedLiveControls<R = never> = {
    readonly previous?: unknown;
    readonly wakes?: Queue.Dequeue<unknown>;
    readonly revoked?: Deferred.Deferred<void>;
    readonly renew?: Effect.Effect<void, Unauthorized, R>;
    readonly basisChanges?: Stream.Stream<LiveBasisEvent, Unauthorized, R>;
    readonly invalidations?: Stream.Stream<unknown, Unauthorized, R>;
    readonly boundaries?: RuntimeBoundaries;
};
export type AuthorizedLiveInput<R = never, EDb = unknown> = AuthorizedRequestInput<R, EDb> & AuthorizedLiveControls<R>;
export type AuthorizedLiveLeaseInput<R = never, EAuthorize = unknown> = AuthorizedLiveControls<R> & {
    readonly authenticate: Effect.Effect<AuthenticatedCaller, Unauthorized, R>;
    readonly interruptAfter?: Duration.Input;
    readonly authorize: (caller: AuthenticatedCaller) => Effect.Effect<Db, Unauthorized | EAuthorize, R>;
    readonly reauthorizeOnIdle?: boolean;
};
export declare const liveResultRows: (value: unknown) => readonly unknown[];
export declare const isSilentLiveDiff: (diff: LiveQueryDiff) => boolean;
export declare const diffAuthorizedResults: (previous: unknown, next: unknown) => LiveQueryDiff;
export declare const liveDiffFromPrevious: (previous: unknown | undefined, next: unknown) => LiveQueryDiff;
export declare const executeAuthorizedLiveLease: <R, EAuthorize = unknown>(input: AuthorizedLiveLeaseInput<R, EAuthorize>, read: OneShotRead, opts?: OneShotReadOptions) => Stream.Stream<LiveQueryDiff, Unauthorized | OneShotReadError | EAuthorize, R>;
export declare const executeAuthorizedLive: <R, EDb = unknown>(input: AuthorizedLiveInput<R, EDb>, read: OneShotRead, opts?: OneShotReadOptions) => Stream.Stream<LiveQueryDiff, Unauthorized | OneShotReadError | EDb, R>;
//# sourceMappingURL=live.d.ts.map