import type { AnyEntity } from "./Entity.ts";
import type { AnyTrait } from "./Trait.ts";
export declare const COMPOSED_TRAITS: unique symbol;
/** A concrete entity or a trait usable as a polymorphic read focus. */
export type AnyComposer = AnyEntity | AnyTrait;
export declare const isComposer: (value: unknown) => value is AnyComposer;
//# sourceMappingURL=Composer.d.ts.map