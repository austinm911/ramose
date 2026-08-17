import * as SchemaFx from "@ripple/alchemy/schema";
import * as Schema from "effect/Schema";

export const Todo = SchemaFx.Namespace("todo", {
  title: SchemaFx.Attr(Schema.String),
  done: SchemaFx.Attr(Schema.Boolean),
  createdAt: SchemaFx.Attr(SchemaFx.Instant),
});

export const Todos = SchemaFx.Catalog({ todo: Todo });
