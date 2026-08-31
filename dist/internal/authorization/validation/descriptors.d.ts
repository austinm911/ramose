import * as Result from "effect/Result";
import type { OperationInputShape } from "../catalog.ts";
import { type ClaimDescriptor } from "../principal.ts";
import { type ValidateFailure } from "./common.ts";
export declare const validateVocabularies: (subjectClaim: string, classes: ReadonlyArray<string>, claims: ReadonlyArray<ClaimDescriptor>) => Result.Result<void, ValidateFailure>;
export declare const validateInputShapeKeys: (shape: OperationInputShape) => Result.Result<void, ValidateFailure>;
export declare const claimByKey: (claims: ReadonlyArray<ClaimDescriptor>, key: string) => Result.Result<ClaimDescriptor, ValidateFailure>;
//# sourceMappingURL=descriptors.d.ts.map