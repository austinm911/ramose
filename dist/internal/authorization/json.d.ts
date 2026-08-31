import * as Schema from "effect/Schema";
export declare const JsonScalar: Schema.Union<readonly [Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]>;
export type JsonScalar = typeof JsonScalar.Type;
export type JsonValue = JsonScalar | ReadonlyArray<JsonValue> | {
    readonly [key: string]: JsonValue;
};
export declare const JsonValue: Schema.Codec<JsonValue>;
//# sourceMappingURL=json.d.ts.map