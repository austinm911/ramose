export type KernelTools = {
    readonly describe: (args: unknown) => Promise<unknown>;
    readonly query: (args: unknown) => Promise<unknown>;
    readonly mutate: (args: unknown) => Promise<unknown>;
};
export declare const handleMcpRequest: (request: Request, tools: KernelTools) => Promise<Response>;
//# sourceMappingURL=server.d.ts.map