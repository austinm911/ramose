import type { RamoseVt } from "./valueTypes.ts";
/** One addressable position inside a decoded operation output. */
export type AllocationPathSegment = string | number;
/** One declared slot, normalized. */
export type AllocationSlot = {
    readonly slot: string;
    readonly path: readonly AllocationPathSegment[];
};
/** Canonically ordered declared slots. Empty when nothing is allocated. */
export type AllocationSlots = readonly AllocationSlot[];
type Decrement = [never, 0, 1, 2, 3, 4];
export type EntityRefPath<OCodec, Depth extends number = 5> = [Depth] extends [
    never
] ? never : OCodec extends RamoseVt<"ref"> ? readonly [] : OCodec extends {
    readonly value: infer Item;
} ? EntityRefPath<Item, Decrement[Depth]> extends infer Tail extends readonly AllocationPathSegment[] ? readonly [number, ...Tail] : never : OCodec extends {
    readonly fields: infer Fields;
} ? {
    [Key in keyof Fields & string]: EntityRefPath<Fields[Key], Decrement[Depth]> extends infer Tail extends readonly AllocationPathSegment[] ? readonly [Key, ...Tail] : never;
}[keyof Fields & string] : never;
/**
 * Author-facing declaration: slot name to the output path it allocates.
 * Only entity-reference positions of the operation's own declared output
 * type-check, so a slot cannot be bound to a title or a count.
 */
export type AllocationDeclaration<OCodec> = {
    readonly [slot: string]: EntityRefPath<OCodec>;
};
export declare const isAllocationSlotName: (value: unknown) => value is string;
export declare const allocationPathKey: (path: readonly AllocationPathSegment[]) => string;
/**
 * Normalize and validate one declaration into the canonical ordered list a
 * queue record and an invocation digest may hold.
 *
 * Two slots may not name the same output position: the receipt maps a slot to
 * exactly one entity, so an aliased position would make the durable mapping
 * ambiguous in precisely the way this design exists to prevent.
 */
export declare const allocationSlots: (declaration?: Readonly<Record<string, readonly AllocationPathSegment[]>>) => AllocationSlots;
export declare const readAllocationPath: (output: unknown, path: readonly AllocationPathSegment[]) => unknown;
export {};
//# sourceMappingURL=allocations.d.ts.map