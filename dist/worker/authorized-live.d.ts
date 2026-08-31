import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { Unauthorized } from "../db/Errors.ts";
import { OneShotReadError, type AuthorizedLiveInput, type AuthorizedRequestInput, type LiveQueryDiff, type OneShotRead, type OneShotReadOptions } from "../internal/authorization/index.ts";
export declare const liveNdjsonStream: <R, EDb>(input: AuthorizedLiveInput<R, EDb> & {
    readonly wakes?: Queue.Dequeue<unknown>;
}, read: OneShotRead, opts: OneShotReadOptions, context: Context.Context<R>) => ReadableStream<Uint8Array>;
export declare const liveDiffNdjsonStream: <R, E>(stream: Stream.Stream<LiveQueryDiff, E, R>, context: Context.Context<R>) => ReadableStream<Uint8Array>;
export declare const liveResponseFromStream: <R, E>(stream: Stream.Stream<LiveQueryDiff, E, R>, headers: Record<string, string>) => Effect.Effect<Response, never, R>;
export declare const authorizedLiveResponse: <R, EDb>(input: AuthorizedLiveInput<R, EDb> & {
    readonly admissionCurrentDb?: AuthorizedRequestInput<R, EDb>["currentDb"];
}, read: OneShotRead, opts: OneShotReadOptions, headers: Record<string, string>) => Effect.Effect<Response, EDb | OneShotReadError | Unauthorized, R>;
//# sourceMappingURL=authorized-live.d.ts.map