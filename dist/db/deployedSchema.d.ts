import * as Schema from "effect/Schema";
export type InertSchemaProjection = Schema.Json;
export type DeployedSchemaCodec = {
    readonly decode: (value: unknown) => unknown;
    readonly encode: (value: unknown) => unknown;
};
export type DeployedSchemaBinding = {
    readonly projection: InertSchemaProjection;
    readonly codec: DeployedSchemaCodec;
};
export declare const bindDeployedSchema: (schema: Schema.Top) => DeployedSchemaBinding;
//# sourceMappingURL=deployedSchema.d.ts.map