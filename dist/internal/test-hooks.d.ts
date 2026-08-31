export declare const TEST_HOOKS_ENV_KEY: "RAMOSE_TEST_HOOKS";
export type TestHooksEnv = {
    readonly RAMOSE_TEST_HOOKS?: string | undefined;
    readonly RAMOSE_STAGE?: string | undefined;
};
export type CheckpointAction = "wait" | "throw";
export type CheckpointScope = "worker" | "transactor" | "replica";
export declare const MAX_CHECKPOINT_RELEASE_DELAY_MS = 30000;
export declare const isCheckpointReleaseDelay: (value: unknown) => value is number;
export interface CheckpointArm {
    readonly action: CheckpointAction;
    readonly error?: string | undefined;
    readonly pending: boolean;
}
export type CheckpointThrowOptions = {
    readonly error?: string | undefined;
    readonly errorName?: string | undefined;
    readonly times?: number | undefined;
};
export declare const testHooksEnabled: (env?: TestHooksEnv) => boolean;
export declare const enableTestHooks: () => void;
export declare const testHooksArmed: () => boolean;
export declare const resetTestHooks: () => void;
export declare const armCheckpointThrow: (name: string, options?: CheckpointThrowOptions) => void;
export declare const armCheckpoint: (name: string, action: CheckpointAction, error?: string, releaseAfterMs?: number) => void;
export declare const releaseCheckpoint: (name: string) => void;
export declare const checkpointStatus: () => Record<string, CheckpointArm>;
export declare const checkpointReached: (name: string) => void;
export declare const checkpoint: (name: string) => Promise<void>;
export declare const checkpointSync: (name: string) => void;
export declare const testRuntimeBoundaries: Readonly<{
    checkpoint: typeof checkpoint;
    checkpointSync: typeof checkpointSync;
    checkpointReached: typeof checkpointReached;
    checkpointCancel: typeof releaseCheckpoint;
}>;
export declare const handleIsolateTestAdmin: (request: Request, path: string, abort?: (reason: string) => void, inspect?: {
    readonly operationReceiptCount: () => number;
}) => Promise<Response | undefined>;
//# sourceMappingURL=test-hooks.d.ts.map