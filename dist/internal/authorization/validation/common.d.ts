import * as Result from "effect/Result";
import { CatalogMismatch, InvalidIR } from "../failures.ts";
import type { EntityId, FieldId, OperationId, TraitId } from "../identities.ts";
export type ValidateFailure = InvalidIR | CatalogMismatch;
export type ValidationLimits = {
    readonly maxTraversalDepth: number;
    readonly maxStaticWork: number;
};
export declare const defaultValidationLimits: ValidationLimits;
export declare const tightenValidationLimits: (overrides: Partial<ValidationLimits> | undefined) => Result.Result<ValidationLimits, ValidateFailure>;
export declare const SEPARATOR = "\0";
export declare const entityKey: (id: EntityId) => string;
export declare const traitKey: (id: TraitId) => string;
export declare const fieldKey: (id: FieldId) => string;
export declare const operationKey: (id: OperationId) => string;
export declare const invalid: (message: string) => Result.Result<never, ValidateFailure>;
export declare const mismatch: (fields: ConstructorParameters<typeof CatalogMismatch>[0]) => Result.Result<never, ValidateFailure>;
export declare const isBlank: (value: string) => boolean;
export declare const requireNonBlank: (value: string, label: string) => Result.Result<string, ValidateFailure>;
//# sourceMappingURL=common.d.ts.map