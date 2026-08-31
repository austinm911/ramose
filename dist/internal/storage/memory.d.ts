import type { R2Like } from "./index.ts";
export declare class MemoryBucket implements R2Like {
    readonly objects: Map<string, {
        body: Uint8Array;
        meta?: unknown;
    }>;
    puts: number;
    gets: number;
    readonly getLog: string[];
    get(key: string): Promise<{
        arrayBuffer: () => Promise<ArrayBuffer>;
        text: () => Promise<string>;
        httpMetadata: unknown;
    } | null>;
    put(key: string, value: ArrayBuffer | Uint8Array | string, options?: any): Promise<{}>;
    head(key: string): Promise<{} | null>;
    delete(keys: string | string[]): Promise<void>;
    list(options?: {
        prefix?: string;
        cursor?: string;
        limit?: number;
    }): Promise<{
        objects: {
            key: string;
            size: number;
        }[];
        truncated: boolean;
        cursor?: string | undefined;
    }>;
}
//# sourceMappingURL=memory.d.ts.map