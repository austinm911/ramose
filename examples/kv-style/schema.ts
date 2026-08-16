import * as Schema from "effect/Schema";
import { SchemaFx } from "@ripple/alchemy";

export const User = SchemaFx.Namespace("user", {
  name: SchemaFx.Attr(Schema.String, { unique: "identity" }),
});
export const Movies = SchemaFx.Catalog({ user: User });
