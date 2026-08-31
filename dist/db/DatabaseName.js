import { InvalidRequest } from "./Errors.js";
/** A Ramose database name, as the peer Worker validates it (`validDbName`). */
export const DATABASE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
/** Whether `name` is a valid Ramose database name ({@link DATABASE_NAME_RE}). */
export const isDatabaseName = (name) => DATABASE_NAME_RE.test(name);
export const invalidDatabaseName = (name) => new InvalidRequest({
    message: `ramose: invalid database name ${JSON.stringify(name)} — must match ${DATABASE_NAME_RE}`,
});
//# sourceMappingURL=DatabaseName.js.map