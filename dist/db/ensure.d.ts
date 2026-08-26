/** Lower a schema to ident-datom maps. Ensure is a separate, idempotent schema tx. */
import { type AnyField } from "./Field.ts";
import type { AnySchema } from "./Schema.ts";
export interface SchemaAttrTx {
    readonly ":db/ident": string;
    readonly ":db/valueType": string;
    readonly ":db/cardinality": string;
    readonly ":db/unique"?: string;
    readonly ":db/index"?: true;
    readonly ":db/isComponent"?: true;
    readonly ":db/optional"?: true;
    readonly ":db/doc"?: string;
}
export declare const attributeTx: (ident: string, field: AnyField) => SchemaAttrTx;
/** One map form per field, in schema / entity / key order. */
export declare const schemaTx: (schema: AnySchema) => SchemaAttrTx[];
//# sourceMappingURL=ensure.d.ts.map