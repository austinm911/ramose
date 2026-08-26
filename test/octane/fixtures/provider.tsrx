/**
 * Provider fixtures. Each one carries its own `ClientOptions`, rather than
 * leaning on a `wrapper`, because the point of most of these tests is what a
 * *prop change* does to the client the provider owns.
 */

import type { Client, ClientOptions, Db } from "ramose/db";
import { useEffect } from "octane";
import { RamoseProvider, useDb, useRamose } from "ramose/octane";
import { titles, Todos } from "../support/world.ts";

/** `useRamose` with nothing above it: the throw is the contract. */
export function BareRamose() @{
	const client = useRamose();
	<span class="client">{String(client !== null)}</span>
}

/** Reports the memoised `Db` every render, so its identity can be asserted. */
export function DbProbe(props: {
	name: string;
	report: (db: Db<typeof Todos>) => void;
}) @{
	const db = useDb(props.name, Todos);
	props.report(db);
	<span class="db">{props.name}</span>
}

/**
 * One read per `db`, so the client stops being idle and opens its session
 * socket — which is the only way a test can see a client get closed.
 */
export function ReadOnce(props: { report?: (client: Client) => void }) @{
	const client = useRamose();
	const db = useDb("todos", Todos);
	props.report?.(client);
	useEffect(() => {
		// a query on a closed client rejects (that is what a prop change does to
		// the old one) — recovering from it is the provider's job, not this
		// probe's to observe
		void db.query(titles).catch(() => {});
	}, [db]);
	<span class="read-once" />
}

/** A provider with one reader inside it. */
export function Reading(props: ClientOptions & {
	report?: (client: Client) => void;
}) @{
	<RamoseProvider
		url={props.url}
		token={props.token}
		fetch={props.fetch}
		webSocket={props.webSocket}
	><ReadOnce report={props.report} /></RamoseProvider>
}

/** A provider with a `useDb` probe inside it. */
export function ProvidedDb(props: ClientOptions & {
	name: string;
	report: (db: Db<typeof Todos>) => void;
}) @{
	<RamoseProvider
		url={props.url}
		token={props.token}
		fetch={props.fetch}
		webSocket={props.webSocket}
	><DbProbe name={props.name} report={props.report} /></RamoseProvider>
}
