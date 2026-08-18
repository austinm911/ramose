/**
 * The catalog, on the portable entry: `@ripplegraph/alchemy/db` runs in a browser,
 * a Worker, Node/Bun and a test, so the same `schema.ts` is shared by the
 * stack, the app Worker and any client.
 */

import * as Ripple from "@ripplegraph/alchemy/db";
import * as Schema from "effect/Schema";

export const User = Ripple.Namespace("user", {
  name: Ripple.Attr(Schema.String, { unique: "identity" }),
});
export const Movies = Ripple.Catalog({ user: User });
