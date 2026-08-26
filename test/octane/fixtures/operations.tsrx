/**
 * `useOperation` fixture. `onError` is passed as a fresh inline object every
 * render — the common spelling, and the one that would break a `run` whose
 * identity depended on it.
 */

import type { AnyOperation, Db } from "ramose/db";
import {
	errorMessage,
	type OperationHandle,
	useOperation,
} from "ramose/octane";

export function OperationHost(props: {
	db: Db;
	operation: AnyOperation;
	onError?: (error: unknown) => void;
	report: (
		handle: OperationHandle<
			(a: unknown, b?: unknown) => Promise<unknown>
		>,
	) => void;
}) @{
	const handle = useOperation(props.db, props.operation, {
		onError: props.onError,
	});
	props.report(handle);
	<div class="operation" data-pending={String(handle.pending)}>
		{handle.error === undefined ? "-" : errorMessage(handle.error)}
	</div>
}
