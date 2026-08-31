import type { RamoseEnv } from "../RamoseEnv.ts";
import { type ServerOptions } from "./handle.ts";
import { type OperationCatalogs } from "./operation-catalogs.ts";
export declare const createServer: (options?: ServerOptions) => {
    fetch(request: Request, env: unknown, _ctx?: ExecutionContext): Promise<Response>;
};
export declare const createTransactorDO: (operationCatalogs: OperationCatalogs) => new (ctx: DurableObjectState, env: RamoseEnv) => CloudflareWorkersModule.DurableObject<RamoseEnv>;
export declare const TransactorDO: new (ctx: DurableObjectState, env: RamoseEnv) => CloudflareWorkersModule.DurableObject<RamoseEnv>;
export declare const QueryReplicaDO: new (ctx: DurableObjectState, env: RamoseEnv) => CloudflareWorkersModule.DurableObject<RamoseEnv>;
declare const _default: {
    fetch(request: Request, env: unknown, _ctx?: ExecutionContext): Promise<Response>;
};
export default _default;
//# sourceMappingURL=testing.d.ts.map