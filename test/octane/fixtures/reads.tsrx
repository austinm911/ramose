/**
 * Read-hook fixtures. Every one reports its state out of the render *and*
 * serialises it into the DOM: the report is how a test asserts on a `Cause`
 * or an object identity, the DOM is the proof a consumer would actually see.
 *
 * The pinned variants apply `asOf` / build the subject **inline**, on purpose
 * — a fresh-but-equal view object every render is exactly the case these
 * hooks key structurally, and a fixture that hoisted it would test nothing.
 */

import * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import { useEffect } from "octane";
import type { Eid, QueryInput, ReadDb } from "ramose/db";
import {
	type Async,
	type Live,
	useBasis,
	useLive,
	usePull,
	useQuery,
} from "ramose/octane";
import { shape, titles, Todos } from "../support/world.ts";

type Todos = ReadDb<typeof Todos>;
type Rows = QueryInput<readonly Eid[]>;
type Reported = (live: Live<unknown, unknown>) => void;

const text = (value: unknown): string => JSON.stringify(value ?? null);

/** `useLive`, query form, live view. */
export function LiveRows(props: { db: Todos; query: Rows; report: Reported }) @{
	const live = useLive(props.db, props.query);
	props.report(live);
	<div class="rows" data-ticks={String(live.ticks)}>{text(live.rows)}</div>
}

/** `useLive` over an inline `db.asOf(t)`. */
export function LiveAsOf(props: {
	db: Todos;
	query: Rows;
	t: number;
	report: Reported;
}) @{
	const live = useLive(props.db.asOf(props.t), props.query);
	props.report(live);
	<div class="rows" data-ticks={String(live.ticks)}>{text(live.rows)}</div>
}

/** `useLive` with params bound inline — a params-only change must not blank rows. */
export function LiveParams(props: {
	db: Todos;
	query: QueryInput<readonly Eid[], { n: number }>;
	n: number;
	report: Reported;
}) @{
	const live = useLive(props.db, props.query, { n: props.n });
	props.report(live);
	<div class="rows">{text(live.rows)}</div>
}

/** `useLive`, stream form: no db, no provider. */
export function LiveStream(props: {
	stream: Stream.Stream<unknown, unknown>;
	report: Reported;
}) @{
	const live = useLive(props.stream);
	props.report(live);
	<div class="rows" data-ticks={String(live.ticks)}>{text(live.rows)}</div>
}

/** `useQuery` over an inline `db.asOf(t)`. */
export function QueryRows(props: {
	db: Todos;
	t: number;
	report: (async: Async<unknown, unknown>) => void;
}) @{
	const async = useQuery(props.db.asOf(props.t), titles);
	props.report(async);
	<div class="data" data-loading={String(async.loading)}>{text(async.data)}</div>
}

/** `usePull` with the subject written inline. */
export function PullRow(props: { db: Todos; id: number; report: Reported }) @{
	const live = usePull(props.db, { id: props.id }, shape);
	props.report(live);
	<div class="pull" data-ticks={String(live.ticks)}>{text(live.rows)}</div>
}

/** `usePull` over an inline pinned view, subject written inline too. */
export function PullAsOf(props: {
	db: Todos;
	t: number;
	id: number;
	report: Reported;
}) @{
	const live = usePull(props.db.asOf(props.t), { id: props.id }, shape);
	props.report(live);
	<div class="pull" data-ticks={String(live.ticks)}>{text(live.rows)}</div>
}

/**
 * `useBasis` on a live view, plus one read — a `basis()` alone answers over
 * HTTPS, and it takes an open session socket for a `{ op: "tx" }` frame to
 * reach the wake subscription at all.
 */
export function BasisWatching(props: {
	db: Todos;
	report: (t: number | undefined) => void;
}) @{
	const t = useBasis(props.db);
	props.report(t);
	useEffect(() => {
		Effect.runPromise(props.db.q(titles)).catch(() => {});
	}, [props.db]);
	<div class="basis">{t === undefined ? "-" : String(t)}</div>
}

/**
 * `useBasis` over a view chosen per render: `t` pinned answers from the
 * coordinate with no request at all, `t` absent asks the peer.
 */
export function BasisSwitching(props: {
	db: Todos;
	t?: number;
	report: (t: number | undefined) => void;
}) @{
	const basis = useBasis(props.t === undefined ? props.db : props.db.asOf(props.t));
	props.report(basis);
	<div class="basis">{basis === undefined ? "-" : String(basis)}</div>
}
