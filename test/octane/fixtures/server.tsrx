/**
 * Server fixtures: every server-reachable hook, each in its own component so a
 * single static render can pin that hook's server contract without a DOM.
 *
 * Query hooks must land on `pending` (via `getServerSnapshot`) and subscribe to
 * nothing. `useSuspenseQuery` must do the same outside a browser — if that
 * guard regresses, every SSR render of a consuming app hangs.
 */

import type { Client, Receipt } from "ramose/client";
import {
	RamoseProvider,
	useDb,
	useQuery,
	useRamose,
	useReceipt,
	useSuspenseQuery,
	useSyncState,
} from "ramose/octane";
import { titles } from "../support/world.ts";

/** `useQuery` on the server: pending markup, no attempt to read data. */
export function ServerQuery(props: { client: Client }) @{
	<RamoseProvider client={props.client}>
		<QueryPending />
	</RamoseProvider>
}

function QueryPending() @{
	const state = useQuery(titles);
	<p id="query">{state.status}</p>
}

/**
 * `useSuspenseQuery` on the server: same pending branch as `useQuery`.
 * The browser-only suspend guard must keep this render completing.
 */
export function ServerSuspenseQuery(props: { client: Client }) @{
	<RamoseProvider client={props.client}>
		<SuspensePending />
	</RamoseProvider>
}

function SuspensePending() @{
	const state = useSuspenseQuery(titles);
	<p id="suspense">{state.status}</p>
}

/** `useDb()` during a server render: `open()` is inert and interned. */
export function ServerDb(props: { client: Client }) @{
	<RamoseProvider client={props.client}>
		<DbProbe />
	</RamoseProvider>
}

function DbProbe() @{
	const db = useDb();
	<p id="db">{db === undefined ? "missing" : "open"}</p>
}

/** `useRamose()` returns the provided client on the server. */
export function ServerRamose(props: { client: Client }) @{
	<RamoseProvider client={props.client}>
		<RamoseProbe />
	</RamoseProvider>
}

function RamoseProbe() @{
	const client = useRamose();
	<p id="ramose">{client === undefined ? "missing" : "provided"}</p>
}

/** `useRamose()` with no provider: the throw is the contract. */
export function BareRamose() @{
	const client = useRamose();
	<p id="bare">{String(client !== null)}</p>
}

/** `useSyncState` reads the client's current status synchronously. */
export function ServerSync(props: { client: Client }) @{
	<RamoseProvider client={props.client}>
		<SyncProbe />
	</RamoseProvider>
}

function SyncProbe() @{
	const sync = useSyncState();
	<p id="sync">{sync.status}</p>
}

/** `useReceipt(null)` is idle on the server. */
export function ServerReceiptIdle() @{
	const state = useReceipt(null);
	<p id="receipt">{state.status}</p>
}

/** A settled receipt's terminal state is readable without subscribing. */
export function ServerReceiptSettled(props: { receipt: Receipt }) @{
	const state = useReceipt(props.receipt);
	<p id="receipt">{state.status}</p>
}
