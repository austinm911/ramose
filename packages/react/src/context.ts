/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RippleProvider` owns. Deliberately not exported from the package — the
 * public way in is `useRipple()`, and the public way to put one in the tree
 * is `<RippleProvider>`.
 */

import type { Client } from "@ripple/alchemy/db";
import { createContext } from "react";

export const RippleContext = createContext<Client | null>(null);
