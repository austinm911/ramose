/**
 * Provider fixtures. The provider carries a `client` — it neither creates nor
 * closes one — so every fixture that needs a client takes it as a prop.
 */

import type { Client, ClientDatabase } from "ramose/client";
import { RamoseProvider, useDb, useRamose } from "ramose/octane";

/** `useRamose` with nothing above it: the throw is the contract. */
export function BareRamose() @{
	const client = useRamose();
	<span class="client">{String(client !== null)}</span>
}

/** Reports the client every render. */
export function ClientProbe(props: {
	report: (client: Client) => void;
}) @{
	const client = useRamose();
	props.report(client);
	<span class="client" />
}

/** Reports the root handle every render. */
export function DbProbe(props: {
	report: (db: ClientDatabase) => void;
}) @{
	const db = useDb();
	props.report(db);
	<span class="db" />
}

/** A provider with a client probe inside it. */
export function ProvidedClient(props: {
	client: Client;
	report: (client: Client) => void;
}) @{
	<RamoseProvider client={props.client}><ClientProbe report={props.report} /></RamoseProvider>
}

/** A provider with a `useDb` probe inside it. */
export function ProvidedDb(props: {
	client: Client;
	report: (db: ClientDatabase) => void;
}) @{
	<RamoseProvider client={props.client}><DbProbe report={props.report} /></RamoseProvider>
}

/**
 * A provider with two sibling `useDb` probes — identity across components is
 * the claim, and `open()` being interned is why it holds.
 */
export function ProvidedSiblingDbs(props: {
	client: Client;
	reportLeft: (db: ClientDatabase) => void;
	reportRight: (db: ClientDatabase) => void;
}) @{
	<RamoseProvider client={props.client}>
		<div>
			<DbProbe report={props.reportLeft} />
			<DbProbe report={props.reportRight} />
		</div>
	</RamoseProvider>
}

/** A provider with both probes, for asserting a client swap moves both. */
export function ProvidedBoth(props: {
	client: Client;
	reportClient: (client: Client) => void;
	reportDb: (db: ClientDatabase) => void;
}) @{
	<RamoseProvider client={props.client}>
		<div>
			<ClientProbe report={props.reportClient} />
			<DbProbe report={props.reportDb} />
		</div>
	</RamoseProvider>
}
