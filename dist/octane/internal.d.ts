export declare const subSlot: import("octane").SlotlessSubSlot;
/**
 * Split the compiler-appended trailing slot off a hook's arguments.
 *
 * Positional lookup is not enough: every hook here has optional or variadic
 * arguments, so the slot's index varies. Counting from the end is exact — no
 * argument any of these hooks takes is a `symbol`.
 */
export declare const splitSlot: (args: readonly unknown[]) => [unknown[], symbol | undefined];
//# sourceMappingURL=internal.d.ts.map