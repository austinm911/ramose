/**
 * Read-hook fixtures. Every one reports its state out of the render *and*
 * serialises it into the DOM: the report is how a test asserts on an object
 * identity or an Error, the DOM is the proof a consumer would actually see.
 *
 * The inline variant rebuilds an equal query every render on purpose: the
 * hooks key by canonical identity, and a fixture that hoisted the query would
 * not prove that.
 */

import { Suspense } from "octane";
import type { Client, ClientDatabase } from "ramose/client";
import { Query, type QueryObject } from "ramose/db";
import {
	RamoseProvider,
	useQuery,
	useSuspenseQuery,
	type QueryState,
} from "ramose/octane";
import { Todo } from "../support/world.ts";

type Reported = (state: QueryState<unknown>) => void;

const text = (value: unknown): string => JSON.stringify(value ?? null);

const body = (state: QueryState<unknown>): string => {
	switch (state.status) {
		case "ready":
		case "stale":
			return text(state.data);
		case "error":
			return state.error.message;
		case "pending":
			return "empty-offline";
	}
};

/** `useQuery` under a provider, observing a query the test hands in. */
export function QueryRows(props: {
	client: Client;
	query: QueryObject<unknown, unknown>;
	report: Reported;
}) @{
	<RamoseProvider client={props.client}>
		<QueryReader query={props.query} report={props.report} />
	</RamoseProvider>
}

/** The bare reader, used alone under a wrapper or twice under one provider. */
export function QueryReader(props: {
	query: QueryObject<unknown, unknown>;
	report: Reported;
	database?: ClientDatabase;
}) @{
	const state = useQuery(props.query, props.database);
	props.report(state);
	<div class="query" data-status={state.status}>{body(state)}</div>
}

/**
 * Rebuilds an equal `titles` query every render. Same observation key as the
 * hoisted `titles` value, so answering through `titles` reaches this reader.
 */
export function QueryInline(props: {
	client: Client;
	report: Reported;
}) @{
	<RamoseProvider client={props.client}>
		<QueryInlineReader report={props.report} />
	</RamoseProvider>
}

export function QueryInlineReader(props: { report: Reported }) @{
	const state = useQuery(Query.from(Todo).select({ title: Todo.title }));
	props.report(state);
	<div class="query" data-status={state.status}>{body(state)}</div>
}

/** `useQuery` with an explicit database and no provider in the tree. */
export function QueryDirect(props: {
	database: ClientDatabase;
	query: QueryObject<unknown, unknown>;
	report: Reported;
}) @{
	const state = useQuery(props.query, props.database);
	props.report(state);
	<div class="query" data-status={state.status}>{body(state)}</div>
}

/** Two readers asking the same question under one provider. */
export function TwoQueryReaders(props: {
	client: Client;
	query: QueryObject<unknown, unknown>;
	reportA: Reported;
	reportB: Reported;
}) @{
	<RamoseProvider client={props.client}>
		<QueryReader query={props.query} report={props.reportA} />
		<QueryReader query={props.query} report={props.reportB} />
	</RamoseProvider>
}

/**
 * `useSuspenseQuery` under a Suspense boundary. The fallback is what shows
 * while the session could still produce a first local answer; once a local
 * value exists (or the session cannot produce one), the reader commits.
 */
export function SuspenseQuery(props: {
	client: Client;
	query: QueryObject<unknown, unknown>;
	report: Reported;
}) @{
	<RamoseProvider client={props.client}>
		<Suspense fallback={<div class="fallback">waiting</div>}>
			<SuspenseReader query={props.query} report={props.report} />
		</Suspense>
	</RamoseProvider>
}

export function SuspenseReader(props: {
	query: QueryObject<unknown, unknown>;
	report: Reported;
	database?: ClientDatabase;
}) @{
	const state = useSuspenseQuery(props.query, props.database);
	props.report(state);
	<div class="suspense" data-status={state.status}>{body(state)}</div>
}
