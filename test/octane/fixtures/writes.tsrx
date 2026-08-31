/**
 * Write-side fixtures: the transact host, one receipt probe, and the sync-state
 * probes.
 *
 * `TransactHost`'s `onError` is passed as a fresh inline object every render —
 * the common spelling, and the one that would break a `run` whose identity
 * depended on it.
 *
 * `ReceiptProbe` calls `useReceipt` unconditionally, with the receipt as a
 * *prop*: that is the render before the user has acted (no receipt, `idle`),
 * the renders as one settles, and the swap to a second invocation, all in one
 * component.
 *
 * `SyncProbe` takes its source as a prop so one component covers all three
 * wirings — the provider's client, an explicit `Client`, an explicit
 * `ClientDatabase` — and `SyncSources` mounts all three at once, which is how a
 * test can see *which* session a hook read.
 */

import type { Client, ClientDatabase, Receipt, SyncState } from "ramose/client";
import {
	errorMessage,
	RamoseProvider,
	type ReceiptView,
	type Transact,
	useReceipt,
	useSyncState,
	useTransact,
} from "ramose/octane";

export function TransactHost(props: {
	onError?: (error: unknown) => void;
	report: (transact: Transact) => void;
}) @{
	const transact = useTransact({ onError: props.onError });
	props.report(transact);
	<div class="transact" data-pending={String(transact.pending)}>
		{transact.error === undefined ? "-" : errorMessage(transact.error)}
	</div>
}

/**
 * `useReceipt` over a receipt held above it. `null` and `undefined` are the
 * pre-invocation renders, and the DOM carries the status a consumer would
 * branch on plus the message it would show.
 */
export function ReceiptProbe(props: {
	receipt?: Receipt | null;
	report: (view: ReceiptView) => void;
}) @{
	const view = useReceipt(props.receipt);
	props.report(view);
	<div class="receipt" data-status={view.status}>
		{view.status === "rejected" || view.status === "failed"
			? errorMessage(view.error)
			: "-"}
	</div>
}

/**
 * `useSyncState`, source chosen by prop: absent falls back to the provider's
 * client, a `Client` or a `ClientDatabase` reads that one instead.
 */
export function SyncProbe(props: {
	source?: Client | ClientDatabase;
	name?: string;
	report: (state: SyncState) => void;
}) @{
	const state = useSyncState(props.source);
	props.report(state);
	<div
		class="sync"
		data-name={props.name === undefined ? "provider" : props.name}
		data-status={state.status}
	/>
}

/** One probe reading the provider's client. */
export function ProvidedSync(props: {
	client: Client;
	report: (state: SyncState) => void;
}) @{
	<RamoseProvider client={props.client}>
		<SyncProbe report={props.report} />
	</RamoseProvider>
}

/**
 * All three wirings under one provider. Moving only the client's session, or
 * only the database's, then shows which store each probe is actually on — the
 * one assertion that catches the two being wired together by mistake.
 */
export function SyncSources(props: {
	client: Client;
	db: ClientDatabase;
	fromProvider: (state: SyncState) => void;
	fromClient: (state: SyncState) => void;
	fromDatabase: (state: SyncState) => void;
}) @{
	<RamoseProvider client={props.client}>
		<div class="sources">
			<SyncProbe name="provider" report={props.fromProvider} />
			<SyncProbe name="client" source={props.client} report={props.fromClient} />
			<SyncProbe name="database" source={props.db} report={props.fromDatabase} />
		</div>
	</RamoseProvider>
}
