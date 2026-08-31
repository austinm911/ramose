/** A value that can be observed and read without recomputation. */
export type Subscription<A> = {
    readonly subscribe: (onChange: () => void) => () => void;
    readonly getSnapshot: () => A;
};
export declare class Store<A> {
    private readonly listeners;
    private value;
    readonly subscription: Subscription<A>;
    constructor(initial: A);
    getSnapshot(): A;
    get size(): number;
    subscribe(onChange: () => void): () => void;
    publish(next: A): boolean;
    private notify;
}
export declare const sameResult: (left: unknown, right: unknown) => boolean;
//# sourceMappingURL=subscription.d.ts.map