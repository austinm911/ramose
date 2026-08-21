/**
 * `useTransact` fixture. `onError` is passed as a fresh inline object every
 * render — the common spelling, and the one that would break a `run` whose
 * identity depended on it.
 */

import { errorMessage, type Transact, useTransact } from "ramose/octane";

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
