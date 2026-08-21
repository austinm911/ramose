/**
 * The server fixture: every read hook in the entry, in one component, so a
 * single static render proves the whole surface is server-safe.
 */

import type { ReadDb } from "ramose/db";
import { useBasis, useLive, useQuery } from "ramose/octane";
import { allTodos, titles, Todos } from "../support/world.ts";

type Todos = ReadDb<typeof Todos>;

export function ServerReads(props: { db: Todos }) @{
	const live = useLive(props.db, allTodos);
	const query = useQuery(props.db, titles);
	const basis = useBasis(props.db);
	<p id="server-state">
		{`${JSON.stringify(live.rows ?? null)}/${live.ticks}/${query.loading}/${JSON.stringify(query.data ?? null)}/${basis ?? "-"}`}
	</p>
}

/** A pinned view answers its coordinate from the first render, server included. */
export function ServerPinned(props: { db: Todos; t: number }) @{
	const basis = useBasis(props.db.asOf(props.t));
	<p id="pinned-basis">{String(basis)}</p>
}
