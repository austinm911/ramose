export declare const ENGINE_TYPE_ASSERTION: unique symbol;
export type EngineTypeAssertion = {
    readonly [ENGINE_TYPE_ASSERTION]?: true;
};
export declare const markEngineTypeAssertion: <T extends object>(value: T) => T;
export declare const restoreEngineTypeAssertions: (txData: readonly unknown[]) => void;
//# sourceMappingURL=tx-provenance.d.ts.map