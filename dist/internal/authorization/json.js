import * as Schema from "effect/Schema";
export const JsonScalar = Schema.Union([
    Schema.String,
    Schema.Finite,
    Schema.Boolean,
    Schema.Null,
]);
export const JsonValue = Schema.suspend(() => Schema.Union([
    JsonScalar,
    Schema.Array(JsonValue),
    Schema.Record(Schema.String, JsonValue),
]));
//# sourceMappingURL=json.js.map