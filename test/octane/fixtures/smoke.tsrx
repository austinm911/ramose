/** Toolchain probe: the smallest TSRX component with a hook in it. */

import { useState } from "octane";

export function Smoke(props: { label: string }) @{
	const [n, setN] = useState(1);
	<button id="smoke" onClick={() => setN(n + 1)}>{`${props.label}:${n}`}</button>
}
