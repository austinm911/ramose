export declare const requestResult: <T>(request: IDBRequest<T>) => Promise<T>;
export declare const transactionFailure: (transaction: IDBTransaction) => DOMException;
export declare const transactionDone: (transaction: IDBTransaction) => Promise<void>;
export declare const commitTransaction: (transaction: IDBTransaction) => Promise<void>;
export declare const abortTransaction: (transaction: IDBTransaction) => Promise<void>;
export declare const abortWithSignal: (transaction: IDBTransaction, signal: AbortSignal | undefined) => (() => void);
export declare const prefixRange: (prefix: string) => IDBKeyRange;
export declare const compoundPrefixRange: (prefix: string) => IDBKeyRange;
//# sourceMappingURL=idb.d.ts.map