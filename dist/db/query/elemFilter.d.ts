import type { PullElemPred } from "../../internal/core/query/ast.ts";
import { type AnyVar } from "./kernel.ts";
export type ElemFilterFragment = (focus: AnyVar) => Iterable<unknown>;
export declare const lowerElemFilter: (preds: readonly ElemFilterFragment[], attr: {
    readonly ident: string;
}) => PullElemPred[];
//# sourceMappingURL=elemFilter.d.ts.map