import { InvalidRequest } from "./Errors.ts";
/** A Ramose database name, as the peer Worker validates it (`validDbName`). */
export declare const DATABASE_NAME_RE: RegExp;
/** Whether `name` is a valid Ramose database name ({@link DATABASE_NAME_RE}). */
export declare const isDatabaseName: (name: string) => boolean;
export declare const invalidDatabaseName: (name: string) => InvalidRequest;
//# sourceMappingURL=DatabaseName.d.ts.map