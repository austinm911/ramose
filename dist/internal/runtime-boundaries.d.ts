export interface RuntimeBoundaries {
    readonly checkpoint: (name: string) => Promise<void>;
    readonly checkpointSync: (name: string) => void;
    readonly checkpointReached?: (name: string) => void;
    readonly checkpointCancel?: (name: string) => void;
}
export declare const inertRuntimeBoundaries: RuntimeBoundaries;
//# sourceMappingURL=runtime-boundaries.d.ts.map