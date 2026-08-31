import * as Result from "effect/Result";
import { type CompositionIndex } from "../core/composition.ts";
import type { CatalogDescriptor } from "./catalog.ts";
import type { InstalledCatalogUnitV2 } from "./catalog-unit.ts";
import { type PreparedAuthorizationCatalog } from "./validation/catalog.ts";
import type { ValidateFailure } from "./validation/common.ts";
export declare const compositionFromPrepared: (index: PreparedAuthorizationCatalog) => CompositionIndex;
export declare const compositionFromDescriptor: (descriptor: CatalogDescriptor) => Result.Result<CompositionIndex, ValidateFailure>;
export declare const compositionFromUnit: (unit: InstalledCatalogUnitV2) => Result.Result<CompositionIndex, ValidateFailure>;
//# sourceMappingURL=composition.d.ts.map