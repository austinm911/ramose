import * as Schema from "effect/Schema";
import * as Ripple from "@ripple/alchemy";

export const User = Ripple.Namespace("user", {
  name: Ripple.Attr(Schema.String, { unique: "identity" }),
});
export const Movies = Ripple.Catalog({ user: User });
