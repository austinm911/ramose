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
export type SchemaTxOp = SchemaAttrTx;
export declare const attributeTx: (ident: string, field: AnyField) => SchemaAttrTx;
export declare const schemaTx: (schema: AnySchema) => SchemaTxOp[];
//# sourceMappingURL=ensure.d.ts.map